'use server';

import { auth } from "@/auth";
import { db, infraPromise } from "@/lib/db";
import { organization, user } from "@/lib/db/schema";
import { eq, ilike, or } from "drizzle-orm";

/**
 * Crea una nueva organización (clínica o laboratorio).
 */
export async function createOrganizationAction(data: {
  id?: string;
  name: string;
  type: string;
  rut?: string;
  isActive?: boolean;
}) {
  try {
    const [newOrg] = await db
      .insert(organization as any)
      .values({
        id: data.id || crypto.randomUUID(),
        name: data.name,
        type: data.type as 'clinica' | 'laboratorio',
        rut: data.rut ?? '',
        isActive: data.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return { success: true, data: newOrg };
  } catch (error) {
    console.error("[createOrganizationAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Actualiza los detalles legales de una organización.
 */
export async function updateOrganizationDetailsAction(id: string, data: Partial<typeof organization.$inferInsert>) {
  if (infraPromise) await infraPromise;
  try {
    const session = await auth();
    const caller = session?.user as any;
    const callerId = caller?.id as string | undefined;
    if (!callerId) return { success: false, error: 'No autenticado' };

    // Verificar que el caller pertenece a esta organización o es admin
    const isAdmin = caller?.role === 'admin';
    if (!isAdmin) {
      const [callerRow] = await db
        .select({ organizationId: user.organizationId })
        .from(user)
        .where(eq(user.id, callerId))
        .limit(1);
      if (!callerRow || callerRow.organizationId !== id) {
        return { success: false, error: 'Sin permiso para modificar esta organización' };
      }
    }

    const [updated] = await db
      .update(organization)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organization.id, id))
      .returning();
    if (!updated) return { success: false, error: 'Organización no encontrada' };
    return { success: true, data: updated };
  } catch (error) {
    console.error("[updateOrganizationDetailsAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Busca una organización por su RUT.
 */
export async function getOrganizationByRutAction(rut: string) {
  try {
    const result = await db
      .select()
      .from(organization)
      .where(eq(organization.rut, rut))
      .limit(1);
    return { success: true, data: result[0] || null };
  } catch (error) {
    console.error("[getOrganizationByRutAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Busca organizaciones por coincidencia de nombre (para autocompletado).
 */
export async function searchOrganizationByNameAction(name: string) {
  try {
    const results = await db
      .select()
      .from(organization)
      .where(ilike(organization.name, `%${name}%`))
      .limit(10);
    return { success: true, data: results };
  } catch (error) {
    console.error("[searchOrganizationByNameAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}
