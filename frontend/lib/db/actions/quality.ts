'use server';

/**
 * Compuerta de Calidad — server actions del rol `calidad` (gated por QUALITY_GATE_ENABLED).
 *
 * Flujo: el técnico entrega (`submitReviewAction` en cases.ts) → caso `enRevisionCalidad`.
 * Calidad itera con el técnico SIN salir de la compuerta (el caso permanece en
 * `enRevisionCalidad` durante todo el bucle; `currentResponsibility` marca de quién es la pelota):
 *   - `requestQualityRevisionAction` → pide ajustes → sigue `enRevisionCalidad`, responsibility `tecnico`
 *     (SLA de Calidad en pausa); el técnico re-entrega y la responsabilidad vuelve a `calidad`.
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
import { clinicalCase, clinicalCaseDelivery, clinicalCaseEvent, user, caseQualityAssignment, review, qualityDerivationReason } from '@/lib/db/schema';
import { and, count, eq, sql } from 'drizzle-orm';
import type { ActionResult } from '@/lib/types/actions';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { isQualityGateEnabled } from '@/lib/constants/qualityFlags';
import { canActAsCalidad, canActAsTecnico } from '@/lib/auth-helpers';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';
import { notifyUser } from '@/lib/services/notifications';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { getActiveConfig } from './fauchard';

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
          // El caso permanece en la compuerta de Calidad durante todo el bucle de ajustes;
          // `currentResponsibility` indica de quién es la pelota (técnico debe re-entregar).
          status: CASE_STATUSES.EN_REVISION_CALIDAD,
          currentResponsibility: 'tecnico',
          // Pausa el SLA de Calidad mientras ajusta el técnico (se reinicia al re-entregar).
          lastQualitySubmittedAt: null,
          qualityReminderSentAt: null,
          qualityOverdueNotifiedAt: null,
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
        // Sin cambio de fase pública: sigue en la compuerta de Calidad (cambia la responsabilidad).
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

      // Versión desde la perspectiva del dentista: cuántas entregas REVISION_ENVIADA
      // con visibleTo:'ambos' ya existen + 1. Distinto de certifiedDelivery.version que
      // cuenta iteraciones internas técnico-calidad que el dentista no debe ver.
      const [{ value: pastDentistDeliveries }] = await tx
        .select({ value: count() })
        .from(clinicalCaseEvent)
        .where(and(
          eq(clinicalCaseEvent.clinicalCaseId, caseId),
          eq(clinicalCaseEvent.action, CASE_EVENTS.REVISION_ENVIADA),
          sql`payload->>'visibleTo' = 'ambos'`,
        ));
      const dentistVersion = (pastDentistDeliveries ?? 0) + 1;

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
        content: certifiedDelivery.notes || `Entrega v${dentistVersion} lista para revisión.`,
        payload: {
          deliveryVersion: dentistVersion,
          deliveryId: certifiedDelivery.id,
          files: certifiedDelivery.files ?? [],
          visibleTo: 'ambos',
        },
        stateChange: { from: CASE_STATUSES.CERTIFICADO_CALIDAD, to: CASE_STATUSES.EN_REVISION },
      }, tx);

      if (caseRow.doctor_id) {
        await notifyUser(caseRow.doctor_id, 'REVISION_PENDIENTE', { caseId, version: dentistVersion });
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
  if (!(await isQualityGateEnabled())) return { success: true, assigned: false };

  const run = async (client: any) => {
    const caseRow = await loadCaseGuardRow(client, caseId);
    if (!caseRow) return { success: false, assigned: false, error: 'Caso no encontrado' };
    if (caseRow.service_type !== 'solo_diseno') return { success: true, assigned: false };
    if (caseRow.quality_reviewer_id) return { success: true, assigned: true, reviewerId: caseRow.quality_reviewer_id };

    // Reparto ponderado: una entrega real esperando revisión (enRevisionCalidad) pesa 1.0;
    // un caso reservado (asignado pero el técnico aún no entrega) pesa qualityReservedCaseWeight (configurable en
    // Fauchard → Selección y Asignación). Desempate por asignado hace más tiempo (o nunca).
    const config = await getActiveConfig();
    const reservedWeight = Number(config.qualityReservedCaseWeight);

    const [candidate]: any = await client.execute(sql`
      SELECT u.id AS id,
             COALESCE(SUM(
               CASE
                 WHEN cqa.status = 'active' AND cc.status = ${CASE_STATUSES.EN_REVISION_CALIDAD} THEN 1.0
                 WHEN cqa.status = 'active' THEN ${reservedWeight}
                 ELSE 0
               END
             ), 0) AS weighted_load,
             MAX(cqa.assigned_at) AS last_assigned
      FROM "user" u
      LEFT JOIN case_quality_assignment cqa ON cqa.calidad_user_id = u.id
      LEFT JOIN clinical_case cc ON cc.id = cqa.clinical_case_id
      WHERE u.role = 'calidad'
      GROUP BY u.id
      ORDER BY weighted_load ASC, last_assigned ASC NULLS FIRST
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
  if (!(await isQualityGateEnabled())) return { success: false, error: 'Compuerta de Calidad desactivada' };

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
          comment: data.comment?.trim() || null,
          revieweeId: caseRow.assigned_technician_id,
          // visibleTo:'ambos' expone el evento al dentista y al técnico asignado;
          // el filtro en caseEventsUchFilter acota al revieweeId para el carril técnico.
          visibleTo: 'ambos' as const,
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

      // Verificar que no haya ya una derivación pendiente para este caso.
      const existingPending = await tx
        .select({ id: caseQualityAssignment.id })
        .from(caseQualityAssignment)
        .where(and(
          eq(caseQualityAssignment.clinicalCaseId, caseId),
          eq(caseQualityAssignment.status, 'pending_derivation'),
        ))
        .limit(1);
      if (existingPending.length > 0) {
        return { success: false, error: 'Ya existe una derivación pendiente de respuesta para este caso' };
      }

      // La fila origen permanece 'active'; se abre una fila destino con 'pending_derivation'
      // que almacena el motivo y comentario para que el destino tenga contexto al decidir.
      await tx.insert(caseQualityAssignment).values({
        clinicalCaseId: caseId,
        calidadUserId: targetCalidadId,
        status: 'pending_derivation',
        derivationReasonId: reasonId as any,
        derivationComment: note || null,
      });

      // clinical_case.quality_reviewer_id NO se actualiza todavía — el origen sigue siendo el revisor.

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.CASO_DERIVADO_CALIDAD,
        content: note
          ? `Solicitud de derivación enviada a ${target.fullName ?? 'otro revisor'}.\n\nComentario:\n${note}`
          : `Solicitud de derivación enviada a ${target.fullName ?? 'otro revisor'}.`,
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

/**
 * El QA destino acepta la derivación pendiente.
 * Cierra la fila origen (active → derived) y activa la fila destino (pending_derivation → active).
 */
export async function acceptDerivedQualityReviewAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };
  if (!canActAsCalidad(identity.role)) return { success: false, error: 'Solo Calidad puede aceptar una derivación' };

  try {
    return await db.transaction(async (tx) => {
      // Verificar que el viewer tiene una fila pending_derivation para este caso.
      const [pendingRow] = await tx
        .select({ id: caseQualityAssignment.id })
        .from(caseQualityAssignment)
        .where(and(
          eq(caseQualityAssignment.clinicalCaseId, caseId),
          eq(caseQualityAssignment.calidadUserId, identity.id as string),
          eq(caseQualityAssignment.status, 'pending_derivation'),
        ))
        .limit(1);
      if (!pendingRow) return { success: false, error: 'No tienes una derivación pendiente para este caso' };

      // Obtener la fila activa actual (el origen) para registrar derived_to_id.
      const [activeRow] = await tx
        .select({ id: caseQualityAssignment.id, calidadUserId: caseQualityAssignment.calidadUserId })
        .from(caseQualityAssignment)
        .where(and(
          eq(caseQualityAssignment.clinicalCaseId, caseId),
          eq(caseQualityAssignment.status, 'active'),
        ))
        .limit(1);

      if (activeRow) {
        await tx.execute(sql`
          UPDATE case_quality_assignment
          SET status = 'derived', derived_to_id = ${identity.id}, updated_at = now()
          WHERE id = ${activeRow.id}
        `);
      }

      // Activar la fila destino.
      await tx.execute(sql`
        UPDATE case_quality_assignment
        SET status = 'active', updated_at = now()
        WHERE id = ${pendingRow.id}
      `);

      // Actualizar el revisor del caso.
      await tx.update(clinicalCase)
        .set({ qualityReviewerId: identity.id as string, qualityAssignedAt: new Date(), updatedAt: new Date() })
        .where(eq(clinicalCase.id, caseId));

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.DERIVACION_CALIDAD_ACEPTADA,
        content: 'Derivación aceptada. El caso ha sido transferido.',
        payload: {
          visibleTo: 'calidad',
          fromCalidadId: activeRow?.calidadUserId ?? null,
          toCalidadId: identity.id,
        },
      }, tx);

      if (activeRow?.calidadUserId) {
        await notifyUser(activeRow.calidadUserId, 'DERIVACION_CALIDAD_ACEPTADA', { caseId });
      }

      return { success: true };
    });
  } catch (error) {
    console.error('Error accepting derived quality review:', error);
    return { success: false, error: 'Fallo al aceptar la derivación' };
  }
}

/**
 * El QA destino rechaza la derivación pendiente.
 * La fila destino pasa a 'derivation_rejected'; el origen permanece 'active'.
 */
export async function rejectDerivedQualityReviewAction(
  caseId: string,
  reasonId: string,
  comment?: string,
): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };
  if (!canActAsCalidad(identity.role)) return { success: false, error: 'Solo Calidad puede rechazar una derivación' };

  const note = typeof comment === 'string' ? comment.trim() : '';
  if (note) {
    const guarded = await guardTextOrFail({
      actionName: 'rejectDerivedQualityReviewAction',
      caseId,
      identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
      fields: [{ text: note, field: 'qualityDerivationRejectionComment' }],
    });
    if (!guarded.ok) return { success: false, error: guarded.error };
  }

  try {
    return await db.transaction(async (tx) => {
      // Verificar que el viewer tiene una fila pending_derivation para este caso.
      const [pendingRow] = await tx
        .select({ id: caseQualityAssignment.id })
        .from(caseQualityAssignment)
        .where(and(
          eq(caseQualityAssignment.clinicalCaseId, caseId),
          eq(caseQualityAssignment.calidadUserId, identity.id as string),
          eq(caseQualityAssignment.status, 'pending_derivation'),
        ))
        .limit(1);
      if (!pendingRow) return { success: false, error: 'No tienes una derivación pendiente para este caso' };

      // Obtener la fila activa (origen) para saber a quién notificar.
      const [activeRow] = await tx
        .select({ id: caseQualityAssignment.id, calidadUserId: caseQualityAssignment.calidadUserId })
        .from(caseQualityAssignment)
        .where(and(
          eq(caseQualityAssignment.clinicalCaseId, caseId),
          eq(caseQualityAssignment.status, 'active'),
        ))
        .limit(1);

      // Resolver el label del motivo para incluirlo en el evento.
      const [reasonRow] = await tx
        .select({ label: qualityDerivationReason.label })
        .from(qualityDerivationReason)
        .where(eq(qualityDerivationReason.id, reasonId as any))
        .limit(1);

      // Marcar la fila destino como rechazada (audit trail).
      await tx.execute(sql`
        UPDATE case_quality_assignment
        SET status = 'derivation_rejected',
            derivation_reason_id = ${reasonId},
            derivation_comment = ${note || null},
            updated_at = now()
        WHERE id = ${pendingRow.id}
      `);

      // La fila origen permanece 'active' — el caso sigue con el revisor original.

      const reasonLabel = reasonRow?.label ?? '';
      const content = note
        ? `Derivación rechazada. Motivo: ${reasonLabel}.\n\nComentario:\n${note}`
        : `Derivación rechazada. Motivo: ${reasonLabel}.`;

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.DERIVACION_CALIDAD_RECHAZADA,
        content,
        payload: {
          visibleTo: 'calidad',
          // toCalidadId es el origen (quien recibe la notificación de rechazo).
          toCalidadId: activeRow?.calidadUserId ?? null,
          fromCalidadId: identity.id,
          reasonId,
          reasonLabel,
          comment: note || null,
        },
      }, tx);

      if (activeRow?.calidadUserId) {
        await notifyUser(activeRow.calidadUserId, 'DERIVACION_CALIDAD_RECHAZADA', { caseId });
      }

      return { success: true };
    });
  } catch (error) {
    console.error('Error rejecting derived quality review:', error);
    return { success: false, error: 'Fallo al rechazar la derivación' };
  }
}

/**
 * Marca como "visto" la asignación de calidad activa para el caso.
 * Idempotente: solo escribe first_viewed_at si aún es NULL.
 * Llamado desde la página del caso cuando actingAsCalidad entra por primera vez.
 */
export async function markQualityAssignmentViewedAction(caseId: string): Promise<void> {
  const identity = await getServerIdentity();
  if (!identity?.id || !canActAsCalidad(identity.role)) return;
  try {
    await db
      .update(caseQualityAssignment)
      .set({ firstViewedAt: new Date() })
      .where(
        and(
          eq(caseQualityAssignment.clinicalCaseId, caseId),
          eq(caseQualityAssignment.calidadUserId, identity.id as string),
          eq(caseQualityAssignment.status, 'active'),
          sql`${caseQualityAssignment.firstViewedAt} IS NULL`,
        ),
      );
  } catch (error) {
    console.error('Error marking quality assignment as viewed:', error);
  }
}
