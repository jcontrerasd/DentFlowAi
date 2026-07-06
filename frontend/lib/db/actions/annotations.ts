'use server';

import { db } from "@/lib/db";
import { annotation, clinicalCaseDelivery, clinicalCase, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getServerIdentity } from "./impersonation";
import { guardTextOrFail } from "@/lib/contactGuard/guardOrFail";

// ─── Legacy: anotaciones en la ficha de caso (sin delivery_id) ────────────────
export async function createAnnotationAction(data: {
  caseId: string;
  userId: string;
  text: string;
  coordinates: { x: number; y: number; z: number };
}) {
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
}

export async function deleteAnnotationAction(id: string) {
  await db.delete(annotation).where(eq(annotation.id, id));
  return { success: true };
}

export async function deleteDeliveryAnnotationAction(annotationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) return { success: false, error: 'No autenticado' };

    const [row] = await db
      .select({ userId: annotation.userId, deliveryId: annotation.deliveryId })
      .from(annotation)
      .where(eq(annotation.id, annotationId))
      .limit(1);

    if (!row) return { success: false, error: 'Anotación no encontrada' };
    if (!row.deliveryId) return { success: false, error: 'Operación no permitida' };
    if (row.userId !== identity.id && !identity.isSystemAdmin) {
      return { success: false, error: 'Solo el autor puede eliminar esta anotación' };
    }

    await db.delete(annotation).where(eq(annotation.id, annotationId));
    return { success: true };
  } catch (error) {
    console.error('[deleteDeliveryAnnotationAction] Error:', error);
    return { success: false, error: 'Error al eliminar anotación' };
  }
}

export async function createPolylineAnnotationAction(input: {
  caseId: string;
  deliveryId?: string;
  points: Array<{ x: number; y: number; z: number }>;
}): Promise<{ success: boolean; annotation?: Record<string, unknown>; error?: string }> {
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) return { success: false, error: 'No autenticado' };

    if (input.deliveryId) {
      const [delivery] = await db
        .select({ clinicalCaseId: clinicalCaseDelivery.clinicalCaseId })
        .from(clinicalCaseDelivery)
        .where(eq(clinicalCaseDelivery.id, input.deliveryId))
        .limit(1);
      if (!delivery || delivery.clinicalCaseId !== input.caseId) {
        return { success: false, error: 'Entrega no encontrada' };
      }
    }

    const [newAnnotation] = await db
      .insert(annotation)
      .values({
        clinicalCaseId: input.caseId,
        ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
        userId: identity.id,
        text: '',
        coordinates: input.points,
        isResolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { success: true, annotation: newAnnotation as Record<string, unknown> };
  } catch (error) {
    console.error('[createPolylineAnnotationAction] Error:', error);
    return { success: false, error: 'Error al guardar trazado' };
  }
}

export async function deletePolylineAnnotationAction(annotationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) return { success: false, error: 'No autenticado' };

    const [row] = await db
      .select({ userId: annotation.userId, coordinates: annotation.coordinates })
      .from(annotation)
      .where(eq(annotation.id, annotationId))
      .limit(1);

    if (!row) return { success: false, error: 'Trazado no encontrado' };
    if (!Array.isArray(row.coordinates)) return { success: false, error: 'Operación no permitida' };
    if (row.userId !== identity.id && !identity.isSystemAdmin) {
      return { success: false, error: 'Solo el autor puede eliminar este trazado' };
    }

    await db.delete(annotation).where(eq(annotation.id, annotationId));
    return { success: true };
  } catch (error) {
    console.error('[deletePolylineAnnotationAction] Error:', error);
    return { success: false, error: 'Error al eliminar trazado' };
  }
}

const MAX_POLYLINE_POINTS = 500;

export async function updatePolylineAnnotationAction(
  annotationId: string,
  points: Array<{ x: number; y: number; z: number }>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) return { success: false, error: 'No autenticado' };

    if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POLYLINE_POINTS) {
      return { success: false, error: 'Trazado inválido' };
    }
    for (const p of points) {
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || !Number.isFinite(p?.z)) {
        return { success: false, error: 'Trazado inválido' };
      }
    }

    const [row] = await db
      .select({ userId: annotation.userId, coordinates: annotation.coordinates })
      .from(annotation)
      .where(eq(annotation.id, annotationId))
      .limit(1);

    if (!row) return { success: false, error: 'Trazado no encontrado' };
    if (!Array.isArray(row.coordinates)) return { success: false, error: 'Operación no permitida' };
    if (row.userId !== identity.id && !identity.isSystemAdmin) {
      return { success: false, error: 'Solo el autor puede editar este trazado' };
    }

    await db
      .update(annotation)
      .set({
        coordinates: points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        updatedAt: new Date(),
      })
      .where(eq(annotation.id, annotationId));

    return { success: true };
  } catch (error) {
    console.error('[updatePolylineAnnotationAction] Error:', error);
    return { success: false, error: 'Error al actualizar trazado' };
  }
}

export async function createDeliveryAnnotationAction(input: {
  caseId: string;
  deliveryId: string;
  text: string;
  coordinates: { x: number; y: number; z: number };
}) {
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) return { success: false, error: 'No autenticado' };

    const guarded = await guardTextOrFail({
      actionName: 'createDeliveryAnnotationAction',
      caseId: input.caseId,
      identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
      fields: [{ text: input.text, field: 'annotationText' }],
    });
    if (!guarded.ok) return { success: false, error: guarded.error };

    const [delivery] = await db
      .select({ clinicalCaseId: clinicalCaseDelivery.clinicalCaseId })
      .from(clinicalCaseDelivery)
      .where(eq(clinicalCaseDelivery.id, input.deliveryId))
      .limit(1);

    if (!delivery || delivery.clinicalCaseId !== input.caseId) {
      return { success: false, error: 'Entrega no encontrada' };
    }

    const [newAnnotation] = await db
      .insert(annotation)
      .values({
        clinicalCaseId: input.caseId,
        deliveryId: input.deliveryId,
        userId: identity.id,
        text: input.text,
        coordinates: input.coordinates,
        isResolved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { success: true, annotation: newAnnotation };
  } catch (error) {
    console.error("[createDeliveryAnnotationAction] Error:", error);
    return { success: false, error: 'Error al guardar anotación' };
  }
}

export async function listDeliveryAnnotationsAction(deliveryId: string): Promise<{
  success: boolean;
  annotations?: Array<{
    id: string;
    text: string;
    coordinates: { x: number; y: number; z: number };
    userId: string;
    user: { fullName: string; role: string };
  }>;
  error?: string;
}> {
  try {
    const identity = await getServerIdentity();
    if (!identity?.id) return { success: false, error: 'No autenticado' };

    // Solo el dentista dueño del caso puede ver anotaciones
    const [delivery] = await db
      .select({ clinicalCaseId: clinicalCaseDelivery.clinicalCaseId })
      .from(clinicalCaseDelivery)
      .where(eq(clinicalCaseDelivery.id, deliveryId))
      .limit(1);

    if (!delivery) return { success: false, error: 'Entrega no encontrada' };

    const [caseRow] = await db
      .select({
        doctorId: clinicalCase.doctorId,
        assignedTechnicianId: clinicalCase.assignedTechnicianId,
        qualityReviewerId: clinicalCase.qualityReviewerId,
      })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, delivery.clinicalCaseId))
      .limit(1);

    const isDentistOwner = caseRow?.doctorId === identity.id;
    const isAssignedTechnician = caseRow?.assignedTechnicianId === identity.id;
    const isAdmin = identity.isSystemAdmin;
    // Calidad puede ver anotaciones solo si es el revisor activo del caso (solo lectura).
    const isCalidadReviewer = identity.role === 'calidad' && caseRow?.qualityReviewerId === identity.id;

    if (!isDentistOwner && !isAssignedTechnician && !isAdmin && !isCalidadReviewer) {
      return { success: true, annotations: [] };
    }

    const rows = await db
      .select({
        id: annotation.id,
        text: annotation.text,
        coordinates: annotation.coordinates,
        userId: annotation.userId,
        fullName: user.fullName,
        role: user.role,
      })
      .from(annotation)
      .innerJoin(user, eq(annotation.userId, user.id))
      .where(eq(annotation.deliveryId, deliveryId));

    return {
      success: true,
      annotations: rows.map((r) => ({
        id: r.id,
        text: r.text,
        coordinates: r.coordinates as { x: number; y: number; z: number },
        userId: r.userId,
        user: { fullName: r.fullName ?? 'Usuario', role: r.role ?? '' },
      })),
    };
  } catch (error) {
    console.error("[listDeliveryAnnotationsAction] Error:", error);
    return { success: false, error: 'Error al cargar anotaciones' };
  }
}

