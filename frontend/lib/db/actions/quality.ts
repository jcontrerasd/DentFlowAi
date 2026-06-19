'use server';

/**
 * Compuerta de Calidad — server actions del rol `calidad` (gated por QUALITY_GATE_ENABLED).
 *
 * Flujo: el técnico entrega (`submitReviewAction` en cases.ts) → caso `enRevisionCalidad`.
 * Calidad itera con el técnico igual que el dentista hoy:
 *   - `requestQualityRevisionAction` → pide ajustes → `enEjecucion` (el técnico re-entrega).
 *   - `certifyQualityAction` → certifica → `certificadoCalidad` (NO reenvía; lo controla el técnico).
 * Recién con `sendToDentistAction` (acción explícita del técnico) la entrega llega al dentista.
 *
 * Asignación equitativa (round-robin / menos cargado) en `assignQualityReviewerAction`,
 * invocada al iniciar el trabajo. Derivación entre revisores en `deriveQualityReviewAction`.
 *
 * Anonimato: los eventos de la etapa de Calidad son `visibleTo: 'tecnico'` (el dentista no los ve);
 * Calidad ve todo su caso por la regla de filtro ampliada (caseEventsUchFilter).
 */

import { db } from '@/lib/db';
import { clinicalCase, clinicalCaseDelivery, user, caseQualityAssignment, review } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { ActionResult } from '@/lib/types/actions';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { isQualityGateEnabled } from '@/lib/constants/qualityFlags';
import { canActAsCalidad, canActAsTecnico } from '@/lib/auth-helpers';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';
import { notifyUser } from '@/lib/services/notifications';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';

/** Datos mínimos del caso para los guards de Calidad. */
type CaseGuardRow = {
  id: string;
  status: string;
  service_type: string | null;
  quality_reviewer_id: string | null;
  assigned_technician_id: string | null;
  doctor_id: string | null;
};

async function loadCaseGuardRow(tx: any, caseId: string): Promise<CaseGuardRow | null> {
  const [row]: any = await tx.execute(sql`
    SELECT id, status, service_type, quality_reviewer_id, assigned_technician_id, doctor_id
    FROM clinical_case WHERE id = ${caseId} LIMIT 1
  `);
  return row ?? null;
}

/**
 * Calidad solicita ajustes al técnico (espeja requestRevisionAction del dentista).
 * Marca la entrega pending como rechazada por Calidad y devuelve el caso a ejecución.
 */
export async function requestQualityRevisionAction(caseId: string, reason: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };
  if (!canActAsCalidad(identity.role)) return { success: false, error: 'Solo Calidad puede solicitar ajustes en esta etapa' };

  const guarded = await guardTextOrFail({
    actionName: 'requestQualityRevisionAction',
    caseId,
    identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
    fields: [{ text: reason, field: 'qualityRevisionReason' }],
  });
  if (!guarded.ok) return { success: false, error: guarded.error };

  try {
    return await db.transaction(async (tx) => {
      const caseRow = await loadCaseGuardRow(tx, caseId);
      if (!caseRow) return { success: false, error: 'Caso no encontrado' };
      if (caseRow.status !== CASE_STATUSES.EN_REVISION_CALIDAD) {
        return { success: false, error: 'El caso no está en revisión de Calidad' };
      }
      if (!identity.isSystemAdmin && caseRow.quality_reviewer_id !== identity.id) {
        return { success: false, error: 'No eres el revisor de Calidad de este caso' };
      }

      const [pendingDelivery] = await tx
        .select({ id: (clinicalCaseDelivery as any).id, files: (clinicalCaseDelivery as any).files, version: (clinicalCaseDelivery as any).version })
        .from(clinicalCaseDelivery as any)
        .where(and(
          eq((clinicalCaseDelivery as any).clinicalCaseId, caseId),
          eq((clinicalCaseDelivery as any).status, 'pending'),
        ))
        .limit(1);

      await tx.execute(sql`
        UPDATE clinical_case_delivery
        SET status = 'rejected', quality_status = 'rejected', reviewed_at = now(),
            quality_reviewed_at = now(), quality_reviewer_id = ${identity.id},
            quality_comment = ${reason}, review_comment = ${reason}
        WHERE clinical_case_id = ${caseId} AND status = 'pending'
      `);

      await tx.update(clinicalCase)
        .set({
          status: CASE_STATUSES.EN_EJECUCION,
          currentResponsibility: 'tecnico',
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clinicalCase.id, caseId));

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.REVISION_SOLICITADA_CALIDAD,
        content: `${reason}`,
        payload: {
          reason,
          deliveryId: pendingDelivery?.id ?? null,
          deliveryVersion: pendingDelivery?.version ?? null,
          files: pendingDelivery?.files ?? [],
          visibleTo: 'tecnico',
          qualityScoped: true,
        },
        stateChange: { from: CASE_STATUSES.EN_REVISION_CALIDAD, to: CASE_STATUSES.EN_EJECUCION },
      }, tx);

      if (caseRow.assigned_technician_id) {
        await notifyUser(caseRow.assigned_technician_id, 'CALIDAD_SOLICITO_AJUSTES', { caseId, reason });
      }

      return { success: true };
    });
  } catch (error) {
    console.error('Error requesting quality revision:', error);
    return { success: false, error: 'Fallo al solicitar ajustes de Calidad' };
  }
}

/**
 * Calidad certifica la entrega: queda lista para que el técnico la envíe al dentista.
 * NO reenvía al dentista ni arranca el SLA del dentista; el envío es acción del técnico.
 */
export async function certifyQualityAction(caseId: string, comment?: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };
  if (!canActAsCalidad(identity.role)) return { success: false, error: 'Solo Calidad puede certificar' };

  const note = typeof comment === 'string' ? comment.trim() : '';
  if (note) {
    const guarded = await guardTextOrFail({
      actionName: 'certifyQualityAction',
      caseId,
      identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
      fields: [{ text: note, field: 'qualityCertifyComment' }],
    });
    if (!guarded.ok) return { success: false, error: guarded.error };
  }

  try {
    return await db.transaction(async (tx) => {
      const caseRow = await loadCaseGuardRow(tx, caseId);
      if (!caseRow) return { success: false, error: 'Caso no encontrado' };
      if (caseRow.status !== CASE_STATUSES.EN_REVISION_CALIDAD) {
        return { success: false, error: 'El caso no está en revisión de Calidad' };
      }
      if (!identity.isSystemAdmin && caseRow.quality_reviewer_id !== identity.id) {
        return { success: false, error: 'No eres el revisor de Calidad de este caso' };
      }

      const [pendingDelivery] = await tx
        .select({ id: (clinicalCaseDelivery as any).id, version: (clinicalCaseDelivery as any).version })
        .from(clinicalCaseDelivery as any)
        .where(and(
          eq((clinicalCaseDelivery as any).clinicalCaseId, caseId),
          eq((clinicalCaseDelivery as any).status, 'pending'),
        ))
        .limit(1);
      if (!pendingDelivery) return { success: false, error: 'No hay entrega pendiente de certificar' };

      await tx.execute(sql`
        UPDATE clinical_case_delivery
        SET quality_status = 'certified', quality_reviewed_at = now(),
            quality_reviewer_id = ${identity.id}, quality_comment = ${note || null}
        WHERE id = ${pendingDelivery.id}
      `);

      // La entrega queda certificada; el técnico decide cuándo enviarla al dentista.
      await tx.update(clinicalCase)
        .set({
          status: CASE_STATUSES.CERTIFICADO_CALIDAD,
          currentResponsibility: 'tecnico',
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clinicalCase.id, caseId));

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.CALIDAD_CERTIFICADA,
        content: note
          ? `Entrega certificada por Calidad. Ya puedes enviarla al solicitante.\n\nComentario:\n${note}`
          : 'Entrega certificada por Calidad. Ya puedes enviarla al solicitante.',
        payload: {
          deliveryId: pendingDelivery.id,
          deliveryVersion: pendingDelivery.version,
          visibleTo: 'tecnico',
          qualityScoped: true,
          ...(note ? { qualityComment: note } : {}),
        },
        stateChange: { from: CASE_STATUSES.EN_REVISION_CALIDAD, to: CASE_STATUSES.CERTIFICADO_CALIDAD },
      }, tx);

      if (caseRow.assigned_technician_id) {
        await notifyUser(caseRow.assigned_technician_id, 'CALIDAD_CERTIFICO', { caseId });
      }

      return { success: true };
    });
  } catch (error) {
    console.error('Error certifying quality:', error);
    return { success: false, error: 'Fallo al certificar la entrega' };
  }
}

/**
 * El técnico envía al dentista la entrega ya certificada por Calidad.
 * Arranca el SLA de revisión del dentista (tDentistReviewHours).
 */
export async function sendToDentistAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };
  if (!canActAsTecnico(identity.role)) return { success: false, error: 'Solo el técnico asignado puede enviar al solicitante' };

  try {
    return await db.transaction(async (tx) => {
      const caseRow = await loadCaseGuardRow(tx, caseId);
      if (!caseRow) return { success: false, error: 'Caso no encontrado' };
      if (caseRow.status !== CASE_STATUSES.CERTIFICADO_CALIDAD) {
        return { success: false, error: 'La entrega no está certificada y lista para enviar' };
      }
      if (!identity.isSystemAdmin && caseRow.assigned_technician_id !== identity.id) {
        return { success: false, error: 'No eres el técnico asignado de este caso' };
      }

      const [certifiedDelivery] = await tx
        .select({ id: (clinicalCaseDelivery as any).id, files: (clinicalCaseDelivery as any).files, version: (clinicalCaseDelivery as any).version, notes: (clinicalCaseDelivery as any).notes })
        .from(clinicalCaseDelivery as any)
        .where(and(
          eq((clinicalCaseDelivery as any).clinicalCaseId, caseId),
          eq((clinicalCaseDelivery as any).status, 'pending'),
          eq((clinicalCaseDelivery as any).qualityStatus, 'certified'),
        ))
        .limit(1);
      if (!certifiedDelivery) return { success: false, error: 'No hay entrega certificada para enviar' };

      await tx.update(clinicalCase)
        .set({
          status: CASE_STATUSES.EN_REVISION,
          currentResponsibility: 'dentista',
          lastActivityAt: new Date(),
          // Arranca el countdown de revisión del dentista al momento del envío real.
          lastRevisionSubmittedAt: new Date(),
          reviewReminderSentAt: null,
          reviewOverdueNotifiedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(clinicalCase.id, caseId));

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'tecnico',
        action: CASE_EVENTS.REVISION_ENVIADA,
        content: certifiedDelivery.notes || `Entrega v${certifiedDelivery.version} lista para revisión.`,
        payload: {
          deliveryVersion: certifiedDelivery.version,
          deliveryId: certifiedDelivery.id,
          files: certifiedDelivery.files ?? [],
          visibleTo: 'ambos',
        },
        stateChange: { from: CASE_STATUSES.CERTIFICADO_CALIDAD, to: CASE_STATUSES.EN_REVISION },
      }, tx);

      if (caseRow.doctor_id) {
        await notifyUser(caseRow.doctor_id, 'REVISION_PENDIENTE', { caseId, version: certifiedDelivery.version });
      }

      return { success: true };
    });
  } catch (error) {
    console.error('Error sending to dentist:', error);
    return { success: false, error: 'Fallo al enviar al solicitante' };
  }
}

/**
 * Asigna un revisor de Calidad al caso con reparto equitativo (round-robin / menos cargado).
 * Idempotente: si el caso ya tiene revisor, no hace nada. Inerte con el flag off.
 * Devuelve `{ success, assigned, reviewerId }`. Si no hay Calidad activo, `assigned=false`
 * (el caso continúa; al entregar se degradará a flujo legacy directo al dentista).
 */
export async function assignQualityReviewerAction(caseId: string, tx?: any): Promise<{ success: boolean; assigned: boolean; reviewerId?: string; error?: string }> {
  if (!isQualityGateEnabled()) return { success: true, assigned: false };

  const run = async (client: any) => {
    const caseRow = await loadCaseGuardRow(client, caseId);
    if (!caseRow) return { success: false, assigned: false, error: 'Caso no encontrado' };
    if (caseRow.service_type !== 'solo_diseno') return { success: true, assigned: false };
    if (caseRow.quality_reviewer_id) return { success: true, assigned: true, reviewerId: caseRow.quality_reviewer_id };

    // Round-robin equitativo: menos asignaciones activas; desempate por asignado hace más tiempo (o nunca).
    const [candidate]: any = await client.execute(sql`
      SELECT u.id AS id,
             COUNT(cqa.id) FILTER (WHERE cqa.status = 'active') AS active_load,
             MAX(cqa.assigned_at) AS last_assigned
      FROM "user" u
      LEFT JOIN case_quality_assignment cqa ON cqa.calidad_user_id = u.id
      WHERE u.role = 'calidad'
      GROUP BY u.id
      ORDER BY active_load ASC, last_assigned ASC NULLS FIRST
      LIMIT 1
    `);
    if (!candidate?.id) return { success: true, assigned: false };

    const reviewerId = candidate.id as string;
    await client.update(clinicalCase)
      .set({ qualityReviewerId: reviewerId, qualityAssignedAt: new Date(), updatedAt: new Date() })
      .where(eq(clinicalCase.id, caseId));

    await client.insert(caseQualityAssignment).values({
      clinicalCaseId: caseId,
      calidadUserId: reviewerId,
      status: 'active',
    });

    await logCaseEvent({
      caseId,
      userId: reviewerId,
      type: 'sistema',
      action: CASE_EVENTS.ASIGNACION_CALIDAD,
      content: 'Caso asignado a revisión de Calidad.',
      payload: { visibleTo: 'calidad', calidadUserId: reviewerId },
      skipActivityUpdate: true,
    }, client);

    return { success: true, assigned: true, reviewerId };
  };

  try {
    return tx ? await run(tx) : await db.transaction(run);
  } catch (error) {
    console.error('Error assigning quality reviewer:', error);
    return { success: false, assigned: false, error: 'Fallo al asignar revisor de Calidad' };
  }
}

/**
 * Calificación del revisor de Calidad al técnico (dimension='quality').
 * Separada de la calificación del dentista; privada del equipo QA (visibleTo calidad).
 * Solo disponible cuando el caso está completado.
 */
export async function submitQualityRatingAction(data: {
  caseId: string;
  rating: number;
  comment?: string;
}): Promise<ActionResult> {
  if (!isQualityGateEnabled()) return { success: false, error: 'Compuerta de Calidad desactivada' };

  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };
  if (!canActAsCalidad(identity.role)) return { success: false, error: 'Solo Calidad puede enviar esta calificación' };

  const rating = Math.round(data.rating);
  if (rating < 1 || rating > 5) return { success: false, error: 'La calificación debe ser entre 1 y 5' };

  if (data.comment) {
    const guarded = await guardTextOrFail({
      actionName: 'submitQualityRatingAction',
      caseId: data.caseId,
      identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
      fields: [{ text: data.comment, field: 'qualityRatingComment' }],
    });
    if (!guarded.ok) return { success: false, error: guarded.error };
  }

  try {
    return await db.transaction(async (tx) => {
      const caseRow = await loadCaseGuardRow(tx, data.caseId);
      if (!caseRow) return { success: false, error: 'Caso no encontrado' };
      if (caseRow.status !== 'completado') return { success: false, error: 'Solo se puede calificar cuando el caso está completado' };
      if (!identity.isSystemAdmin && caseRow.quality_reviewer_id !== identity.id) {
        return { success: false, error: 'Solo el revisor asignado puede calificar este caso' };
      }
      if (!caseRow.assigned_technician_id) return { success: false, error: 'El caso no tiene técnico asignado' };

      await tx.insert(review).values({
        clinicalCaseId: data.caseId,
        reviewerId: identity.id as string,
        revieweeId: caseRow.assigned_technician_id,
        rating,
        dimension: 'quality',
        comment: data.comment?.trim() || null,
      }).onConflictDoUpdate({
        target: [review.clinicalCaseId, review.reviewerId, review.dimension],
        set: { rating, comment: data.comment?.trim() || null, createdAt: new Date() },
      });

      await logCaseEvent({
        caseId: data.caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.CALIFICACION_ENVIADA_CALIDAD,
        content: `Calificación de Calidad: ${rating}/5`,
        payload: {
          dimension: 'quality',
          rating,
          revieweeId: caseRow.assigned_technician_id,
          visibleTo: 'calidad',
        },
      }, tx);

      return { success: true };
    });
  } catch (error) {
    console.error('Error submitting quality rating:', error);
    return { success: false, error: 'Fallo al enviar la calificación' };
  }
}

/** Usuarios Calidad activos (para el dropdown de derivación). */
export async function listActiveCalidadUsersAction(): Promise<{ success: boolean; data?: Array<{ id: string; fullName: string | null }>; error?: string }> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };
  if (!canActAsCalidad(identity.role)) return { success: false, error: 'No autorizado' };
  try {
    const rows = await db
      .select({ id: user.id, fullName: user.fullName })
      .from(user)
      .where(eq(user.role, 'calidad'));
    return { success: true, data: rows };
  } catch (error) {
    console.error('Error listing calidad users:', error);
    return { success: false, error: 'Fallo al listar revisores de Calidad' };
  }
}

/**
 * Deriva el caso a otro revisor de Calidad con motivo (catálogo) + comentario.
 * Cierra la fila activa actual y abre una nueva para el destino.
 */
export async function deriveQualityReviewAction(
  caseId: string,
  targetCalidadId: string,
  reasonId: string,
  comment?: string,
): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };
  if (!canActAsCalidad(identity.role)) return { success: false, error: 'Solo Calidad puede derivar un caso' };
  if (targetCalidadId === identity.id) return { success: false, error: 'No puedes derivarte el caso a ti mismo' };

  const note = typeof comment === 'string' ? comment.trim() : '';
  if (note) {
    const guarded = await guardTextOrFail({
      actionName: 'deriveQualityReviewAction',
      caseId,
      identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
      fields: [{ text: note, field: 'qualityDerivationComment' }],
    });
    if (!guarded.ok) return { success: false, error: guarded.error };
  }

  try {
    return await db.transaction(async (tx) => {
      const caseRow = await loadCaseGuardRow(tx, caseId);
      if (!caseRow) return { success: false, error: 'Caso no encontrado' };
      if (!identity.isSystemAdmin && caseRow.quality_reviewer_id !== identity.id) {
        return { success: false, error: 'No eres el revisor de Calidad de este caso' };
      }

      // Destino debe ser un Calidad activo y distinto.
      const [target] = await tx
        .select({ id: user.id, role: user.role, fullName: user.fullName })
        .from(user)
        .where(eq(user.id, targetCalidadId))
        .limit(1);
      if (!target || target.role !== 'calidad') {
        return { success: false, error: 'El destino no es un revisor de Calidad válido' };
      }

      // Cerrar fila activa actual (si existe) registrando la derivación.
      await tx.execute(sql`
        UPDATE case_quality_assignment
        SET status = 'derived', derived_to_id = ${targetCalidadId},
            derivation_reason_id = ${reasonId}, derivation_comment = ${note || null}, updated_at = now()
        WHERE clinical_case_id = ${caseId} AND status = 'active'
      `);

      // Abrir nueva fila para el destino.
      await tx.insert(caseQualityAssignment).values({
        clinicalCaseId: caseId,
        calidadUserId: targetCalidadId,
        status: 'active',
      });

      await tx.update(clinicalCase)
        .set({ qualityReviewerId: targetCalidadId, qualityAssignedAt: new Date(), updatedAt: new Date() })
        .where(eq(clinicalCase.id, caseId));

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.CASO_DERIVADO_CALIDAD,
        content: note
          ? `Caso derivado a otro revisor de Calidad.\n\nComentario:\n${note}`
          : 'Caso derivado a otro revisor de Calidad.',
        payload: {
          visibleTo: 'calidad',
          reasonId,
          comment: note || null,
          fromCalidadId: identity.id,
          toCalidadId: targetCalidadId,
        },
      }, tx);

      await notifyUser(targetCalidadId, 'CASO_DERIVADO_CALIDAD', { caseId });

      return { success: true };
    });
  } catch (error) {
    console.error('Error deriving quality review:', error);
    return { success: false, error: 'Fallo al derivar el caso' };
  }
}
