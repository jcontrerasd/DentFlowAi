'use server';

import { db } from "@/lib/db";
import { annotation } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Crea una nueva anotación técnica sobre un modelo 3D.
 */
export async function createAnnotationAction(data: {
  caseId: string;
  userId: string;
  text: string;
  coordinates: { x: number; y: number; z: number };
}) {
  try {
    const [newAnnotation] = await db
      .insert(annotation)
      .values({
        clinicalCaseId: data.caseId,
        userId: data.userId,
        text: data.text,
        coordinates: data.coordinates,
        isResolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    return newAnnotation;
  } catch (error) {
    console.error("[createAnnotationAction] Error:", error);
    throw error;
  }
}

/**
 * Elimina una anotación.
 */
export async function deleteAnnotationAction(id: string) {
  try {
    await db.delete(annotation).where(eq(annotation.id, id));
    return { success: true };
  } catch (error) {
    console.error("[deleteAnnotationAction] Error:", error);
    return { success: false };
  }
}
