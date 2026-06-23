'use server';

import * as bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { db, infraPromise } from "@/lib/db";
import { user, organization, file, caseAssignment } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import GCPStorageService from "@/lib/services/gcp-storage";

/**
 * Obtiene el perfil completo de un usuario, incluyendo su organización.
 * Esta función reemplaza directamente a la query de Data Connect.
 */
export async function getUserProfileDirect(userId: string) {
  try {
    const result = await db
      .select({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        bio: user.bio,
        onboardingStep: user.onboardingStep,
        phone: user.phone,
        specialty: user.specialty,
        registrationNumber: user.registrationNumber,
        country: user.country,
        region: user.region,
        comuna: user.comuna,
        address: user.address,
        addressNumber: user.addressNumber,
        addressOffice: user.addressOffice,
        experienceYears: user.experienceYears,
        subRoles: user.subRoles,
        isActive: user.isActive,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        organization: {
          id: organization.id,
          name: organization.name,
          type: organization.type,
          rut: organization.rut,
          giro: organization.giro,
          legalAddress: organization.legalAddress,
          logoUrl: organization.logoUrl,
          technicalCapabilities: organization.technicalCapabilities,
        }
      })
      .from(user)
      .leftJoin(organization, eq(user.organizationId, organization.id))
      .where(eq(user.id, userId))
      .limit(1);

    return result[0] || null;
  } catch (error) {
    console.error("[getUserProfileDirect] Error:", error);
    return null;
  }
}


/**
 * Crea un nuevo registro de usuario nativo con contraseña hasheada.
 * Genera IDs automáticos si no se proveen.
 */
export async function createUserAction(data: {
  id?: string;
  organizationId?: string;
  email: string;
  fullName: string;
  role: string;
  onboardingStep?: number;
  password?: string;
}) {
  try {
    const userId = data.id || crypto.randomUUID();
    let orgId = data.organizationId;

    // Si no hay organización, creamos una temporal para cumplir con la restricción de integridad
    if (!orgId) {
      const [newOrg] = await db.insert(organization as any).values({
        id: crypto.randomUUID(),
        name: `Temporal - ${data.email}`,
        type: data.role === 'tecnico' ? 'laboratorio' : 'clinica',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      orgId = newOrg.id;
    }

    let hashedPassword = null;
    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(data.password, salt);
    }

    const [newUser] = await db
      .insert(user)
      .values({
        id: userId,
        organizationId: orgId,
        email: data.email,
        fullName: data.fullName,
        role: data.role as 'dentista' | 'tecnico',
        onboardingStep: data.onboardingStep || 0,
        hashedPassword,
        emailVerified: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: user.email,
        set: {
          fullName: data.fullName,
          role: data.role as 'dentista' | 'tecnico',
          hashedPassword: hashedPassword || undefined,
          updatedAt: new Date(),
        }
      })
      .returning();

    return { success: true, data: newUser };
  } catch (error) {
    console.error("[createUserAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Actualiza el perfil de un usuario.
 */
export async function updateUserAction(id: string, data: Partial<typeof user.$inferInsert>) {
  if (infraPromise) await infraPromise;
  try {
    const session = await auth();
    const caller = session?.user as any;
    const callerId = caller?.id as string | undefined;
    if (!callerId) return { success: false, error: 'No autenticado' };
    const isAdmin = caller?.role === 'admin';
    if (callerId !== id && !isAdmin) return { success: false, error: 'Sin permiso para modificar este perfil' };

    const [updated] = await db
      .update(user)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning();
    return { success: true, data: updated };
  } catch (error) {
    console.error("[updateUserAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function checkUserStatusAction(email: string) {
  try {
    const cleanEmail = email.toLowerCase().trim();
    const [existingUser] = await db
      .select({ isActive: user.isActive })
      .from(user)
      .where(sql`LOWER(${user.email}) = ${cleanEmail}`)
      .limit(1);

    if (!existingUser) return { exists: false, active: false };
    return { exists: true, active: existingUser.isActive };
  } catch (error) {
    console.error("[checkUserStatusAction] Error crítico DB:", error);
    return { exists: false, active: false };
  }
}

/**
 * Obtiene una lista de usuarios filtrada por rol.
 * Usado principalmente por administradores para simulación de identidad.
 */
export async function getUsersByRoleAction(role: 'dentista' | 'tecnico' | 'calidad') {
  try {
    const results = await db
      .select({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        image: user.image,
        organizationName: organization.name,
        // Invitaciones que el técnico tiene por cotizar (status 'pending').
        // Subconsulta correlacionada: resuelve todos los usuarios en una sola query.
        pendingInvitations: sql<number>`(
          SELECT count(*)::int FROM ${caseAssignment} ci
          WHERE ci.technician_id = ${user.id} AND ci.status = 'pending'
        )`,
      })
      .from(user)
      .leftJoin(organization, eq(user.organizationId, organization.id))
      .where(eq(user.role, role))
      .limit(50); // Límite razonable para el selector
    
    return results;
  } catch (error) {
    console.error("[getUsersByRoleAction] Error:", error);
    return [];
  }
}

/**
 * Auto-borrado de una inscripción a medio terminar (botón "Cancelar" del wizard).
 * Cierra el ciclo de una cuenta creada por el auto-login del registro que el
 * usuario decide descartar: borra el usuario (libera el email) y su organización
 * temporal si queda huérfana.
 *
 * Seguridad:
 * - Usa la sesión REAL (`auth()`), nunca `getServerIdentity()`, para que la
 *   impersonación admin jamás pueda auto-borrar la cuenta simulada.
 * - Solo procede sobre inscripciones incompletas y no-admin.
 */
export async function discardOnboardingAccountAction(): Promise<{ success: boolean; error?: string }> {
  if (infraPromise) await infraPromise;

  try {
    const session = await auth();
    const realUserId = (session?.user as any)?.id as string | undefined;

    // Sin sesión (p. ej. paso 0, antes de crear la cuenta): nada que descartar.
    if (!realUserId) return { success: true };

    const [target] = await db
      .select({
        role: user.role,
        onboardingStep: user.onboardingStep,
        organizationId: user.organizationId,
      })
      .from(user)
      .where(eq(user.id, realUserId))
      .limit(1);

    // El usuario ya no existe: nada que hacer.
    if (!target) return { success: true };

    // Guard: nunca descartar cuentas completas ni administradores.
    if (target.role === 'admin' || (target.onboardingStep ?? 0) >= 100) {
      return { success: false, error: 'Solo se puede descartar una inscripción incompleta.' };
    }

    // Purga best-effort de archivos GCS subidos por este usuario (avatar, etc.).
    try {
      const filesToPurge = await db
        .select({ gcsPath: file.gcsPath })
        .from(file)
        .where(eq(file.uploaderId, realUserId));
      const paths = filesToPurge.map(f => f.gcsPath).filter(Boolean) as string[];
      if (paths.length > 0) {
        await GCPStorageService.deleteFiles(paths);
      }
    } catch (gcsErr) {
      console.error("[discardOnboardingAccountAction] GCS purge best-effort falló:", gcsErr);
    }

    const orgId = target.organizationId;

    // Borrar el usuario (cascade limpia filas dependientes; libera el email).
    await db.delete(user).where(eq(user.id, realUserId));

    // Limpiar la organización temporal si queda sin usuarios (el cascade es
    // org→user, no user→org, así que la org no se borra al borrar el usuario).
    if (orgId) {
      try {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(user)
          .where(eq(user.organizationId, orgId));
        if (count === 0) {
          await db.delete(organization).where(eq(organization.id, orgId));
        }
      } catch (orgErr) {
        // El objetivo crítico (usuario borrado, email liberado) ya se cumplió.
        console.error("[discardOnboardingAccountAction] Limpieza de org huérfana falló:", orgErr);
      }
    }

    return { success: true };
  } catch (error) {
    console.error("[discardOnboardingAccountAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}
