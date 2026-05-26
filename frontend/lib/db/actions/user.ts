'use server';

import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { user, organization } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

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
  try {
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
export async function getUsersByRoleAction(role: 'dentista' | 'tecnico') {
  try {
    const results = await db
      .select({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        image: user.image,
        organizationName: organization.name,
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
