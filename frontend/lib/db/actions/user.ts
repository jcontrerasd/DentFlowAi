'use server';

import * as bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { getServerIdentity } from "@/lib/db/actions/impersonation";
import { db, infraPromise } from "@/lib/db";
import { user, organization, file, caseAssignment, clinicalCase, clinicalCaseDelivery, userDeletionRequest } from "@/lib/db/schema";
import { eq, sql, and, isNull, lt, or, desc } from "drizzle-orm";
import { getSignedUrl } from "@/lib/gcs";
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
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        // Nunca exponer el hash en sí — solo si existe, para que el perfil pueda ofrecer
        // "agregar contraseña" (cuentas 100% Google) vs "cambiar contraseña" (ya la tienen).
        hasPassword: sql<boolean>`(${user.hashedPassword} IS NOT NULL)`,
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
        // No marcar emailVerified aquí: con EMAIL_VERIFICATION_ENABLED activo, el wizard de
        // registro llama requestEmailVerificationAction justo después de crear la cuenta — el
        // usuario queda verificado solo cuando confirma el link del correo. Marcarlo aquí de
        // entrada anulaba por completo la Fase 3 (todo usuario nuevo ya nacía "verificado").
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

/** Fase 2 (ajuste login): expone el flag server-only GOOGLE_OAUTH_ENABLED a la UI (login/registro). */
export async function getGoogleOAuthEnabledAction(): Promise<{ enabled: boolean }> {
  return { enabled: process.env.GOOGLE_OAUTH_ENABLED === 'true' };
}

/** Fase 3 (ajuste login): expone el flag server-only EMAIL_VERIFICATION_ENABLED a la UI (login). */
export async function getEmailVerificationEnabledAction(): Promise<{ enabled: boolean }> {
  return { enabled: process.env.EMAIL_VERIFICATION_ENABLED === 'true' };
}

/** Fase 5 (ajuste login): expone el flag server-only TAB_CLOSE_LOGOUT_ENABLED a la UI (dashboard). */
export async function getTabCloseLogoutEnabledAction(): Promise<{ enabled: boolean; heartbeatSeconds: number }> {
  return {
    enabled: process.env.TAB_CLOSE_LOGOUT_ENABLED === 'true',
    heartbeatSeconds: Number(process.env.SESSION_HEARTBEAT_SECONDS) || 30,
  };
}

export async function checkUserStatusAction(email: string) {
  try {
    const cleanEmail = email.toLowerCase().trim();
    const [existingUser] = await db
      .select({ isActive: user.isActive, emailVerified: user.emailVerified })
      .from(user)
      .where(sql`LOWER(${user.email}) = ${cleanEmail}`)
      .limit(1);

    if (!existingUser) return { exists: false, active: false, emailVerified: false };
    return { exists: true, active: existingUser.isActive, emailVerified: !!existingUser.emailVerified };
  } catch (error) {
    console.error("[checkUserStatusAction] Error crítico DB:", error);
    return { exists: false, active: false, emailVerified: false };
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
/**
 * Borra una cuenta de onboarding incompleta (purga GCS best-effort + delete user + limpieza de
 * organización huérfana). Reutilizada por `discardOnboardingAccountAction` (sesión real) y por
 * `cleanupAbandonedUnverifiedAccountsAction` (cron, sin sesión). Nunca borra admin ni cuentas
 * con onboarding completo — mismo guard para ambos llamadores.
 */
async function discardUserAccountById(userId: string): Promise<{ success: boolean; error?: string }> {
  const [target] = await db
    .select({
      role: user.role,
      onboardingStep: user.onboardingStep,
      organizationId: user.organizationId,
    })
    .from(user)
    .where(eq(user.id, userId))
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
      .where(eq(file.uploaderId, userId));
    const paths = filesToPurge.map(f => f.gcsPath).filter(Boolean) as string[];
    if (paths.length > 0) {
      await GCPStorageService.deleteFiles(paths);
    }
  } catch (gcsErr) {
    console.error("[discardUserAccountById] GCS purge best-effort falló:", gcsErr);
  }

  const orgId = target.organizationId;

  // Borrar el usuario (cascade limpia filas dependientes; libera el email).
  await db.delete(user).where(eq(user.id, userId));

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
      console.error("[discardUserAccountById] Limpieza de org huérfana falló:", orgErr);
    }
  }

  return { success: true };
}

export async function discardOnboardingAccountAction(): Promise<{ success: boolean; error?: string }> {
  if (infraPromise) await infraPromise;

  try {
    const identity = await getServerIdentity();
    const userId = identity?.id as string | undefined;

    // Sin sesión (p. ej. paso 0, antes de crear la cuenta): nada que descartar.
    if (!userId) return { success: true };

    // Un admin no puede auto-borrarse disfrazado de otro usuario.
    if (identity?.isSimulating && identity.role === 'admin') {
      return { success: false, error: 'No disponible en modo simulación para cuentas admin.' };
    }

    return await discardUserAccountById(userId);
  } catch (error) {
    console.error("[discardOnboardingAccountAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Cumplimiento legal (Ley 21.719/19.628, derecho de cancelación/supresión) — el propio
 * usuario solicita eliminar su cuenta. Usa `getServerIdentity()` para respetar la
 * simulación admin (el admin puede actuar en nombre del usuario simulado), pero bloquea
 * explícitamente que un admin se auto-borre disfrazado de otro usuario.
 *
 * - Sin rastro de actividad (casos/asignaciones/entregas/reviews/eventos) → se borra
 *   físicamente, igual que `discardUserAccountById`.
 * - Con actividad → no se puede borrar sin perder integridad histórica; se desactiva la
 *   cuenta (mismo efecto que el bloqueo admin) y se registra `deletionRequestedAt` para que
 *   el caso pueda revisarse/purgarse manualmente respetando la política de retención
 *   (ver Doc/Auditoria_Cumplimiento_Legal.md).
 */
export async function requestAccountDeletionAction(): Promise<{ success: boolean; deactivated?: boolean; error?: string }> {
  if (infraPromise) await infraPromise;
  try {
    const identity = await getServerIdentity();
    const userId = identity?.id as string | undefined;
    if (!userId) return { success: false, error: 'No autenticado' };

    // Un admin no puede auto-borrarse disfrazado de otro usuario.
    if (identity?.isSimulating && identity.role === 'admin') {
      return { success: false, error: 'No disponible en modo simulación para cuentas admin.' };
    }

    const [target] = await db.select({ role: user.role, email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
    if (!target) return { success: false, error: 'Usuario no encontrado.' };
    if (target.role === 'admin') return { success: false, error: 'Un administrador no puede solicitar la eliminación de su propia cuenta.' };

    const { hasUserActivityTrace } = await import('@/lib/db/actions/admin');
    const activityReason = await hasUserActivityTrace(userId);

    if (!activityReason) {
      // Insertar registro de auditoría antes de la eliminación física (FK quedará NULL tras el delete)
      await db.insert(userDeletionRequest).values({
        userId,
        userEmailSnapshot: target.email,
        outcome: 'deleted',
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const result = await discardUserAccountById(userId);
      return { ...result, deactivated: false };
    }

    await db.update(user)
      .set({ isActive: false, deletionRequestedAt: new Date(), updatedAt: new Date() })
      .where(eq(user.id, userId));
    await db.insert(userDeletionRequest).values({
      userId,
      userEmailSnapshot: target.email,
      outcome: 'deactivated',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { success: true, deactivated: true };
  } catch (error) {
    console.error("[requestAccountDeletionAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Cumplimiento legal (Ley 21.719, derecho de acceso y portabilidad) — exporta los datos
 * personales del usuario autenticado: perfil, organización y los casos en los que participa
 * (como dentista o como técnico asignado). Usa `getServerIdentity()` para respetar la
 * simulación admin: el admin puede exportar los datos del usuario simulado en su nombre.
 */
export async function exportMyDataAction(): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  if (infraPromise) await infraPromise;
  try {
    const identity = await getServerIdentity();
    const userId = identity?.id as string | undefined;
    if (!userId) return { success: false, error: 'No autenticado' };

    const profile = await getUserProfileDirect(userId);
    if (!profile) return { success: false, error: 'Usuario no encontrado' };
    const { organization: organizationData, ...usuario } = profile;

    const casosRaw = await db
      .select({
        id: clinicalCase.id,
        internalName: clinicalCase.internalName,
        status: clinicalCase.status,
        rolEnElCaso: sql<string>`CASE WHEN ${clinicalCase.doctorId} = ${userId} THEN 'dentista' ELSE 'tecnico' END`,
        createdAt: clinicalCase.createdAt,
        publishedAt: clinicalCase.publishedAt,
        completedAt: clinicalCase.completedAt,
      })
      .from(clinicalCase)
      .where(or(eq(clinicalCase.doctorId, userId), eq(clinicalCase.assignedTechnicianId, userId)));

    // Solo se incluyen los archivos de la ENTREGA APROBADA (final), nunca revisiones
    // intermedias pendientes o rechazadas — esas son borradores de trabajo, no el
    // resultado final que el dentista aceptó para el paciente.
    const casos = await Promise.all(casosRaw.map(async (caso) => {
      const [approvedDelivery] = await db
        .select({ files: clinicalCaseDelivery.files, version: clinicalCaseDelivery.version })
        .from(clinicalCaseDelivery)
        .where(and(eq(clinicalCaseDelivery.clinicalCaseId, caso.id), eq(clinicalCaseDelivery.status, 'approved')))
        .orderBy(desc(clinicalCaseDelivery.version))
        .limit(1);

      let archivosEntregaFinal: { path: string; url: string | null }[] = [];
      if (approvedDelivery?.files?.length) {
        archivosEntregaFinal = await Promise.all(
          approvedDelivery.files.map(async (gcsPath) => ({
            path: gcsPath,
            url: await getSignedUrl(gcsPath).catch(() => null),
          })),
        );
      }

      return { ...caso, archivosEntregaFinal };
    }));

    return {
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        usuario,
        organizacion: organizationData ?? null,
        casos,
      },
    };
  } catch (error) {
    console.error("[exportMyDataAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Fase 3 follow-up (ajuste login) — cron de limpieza: borra cuentas creadas hace más de 2 días
 * que nunca verificaron su correo y nunca completaron el onboarding (abandonadas a medio
 * registrar). Los usuarios de Google OAuth quedan excluidos naturalmente (el adapter les pone
 * emailVerified al crearlos); admin y cuentas completas los excluye discardUserAccountById.
 */
export async function cleanupAbandonedUnverifiedAccountsAction(): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  if (infraPromise) await infraPromise;
  try {
    const cutoff = new Date(Date.now() - 2 * 24 * 3600_000);
    const candidates = await db
      .select({ id: user.id })
      .from(user)
      .where(and(isNull(user.emailVerified), lt(user.onboardingStep, 100), lt(user.createdAt, cutoff)));

    let deletedCount = 0;
    for (const candidate of candidates) {
      const result = await discardUserAccountById(candidate.id);
      if (result.success) deletedCount++;
    }

    return { success: true, deletedCount };
  } catch (error) {
    console.error("[cleanupAbandonedUnverifiedAccountsAction] Error:", error);
    return { success: false, deletedCount: 0, error: (error as Error).message };
  }
}
