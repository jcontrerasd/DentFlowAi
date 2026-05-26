'use server';

import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
import { eq, ilike, or } from "drizzle-orm";

/**
 * Crea una nueva organización (clínica o laboratorio).
 */
export async function createOrganizationAction(data: {
  id?: string;
  name: string;
  type: string;
  isActive?: boolean;
}) {
  try {
    const [newOrg] = await db
      .insert(organization as any)
      .values({
        id: data.id || crypto.randomUUID(),
        name: data.name,
        type: data.type as 'clinica' | 'laboratorio',
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
  try {
    const [updated] = await db
      .update(organization)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(organization.id, id))
      .returning();
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
