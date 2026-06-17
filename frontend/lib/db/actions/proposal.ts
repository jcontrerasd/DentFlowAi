'use server';

import { db } from '@/lib/db';
import { clinicalCase, caseAssignment, user } from '@/lib/db/schema';
import { eq, and, inArray, ne } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { assignQualityReviewerAction } from './quality';
import { notifyUser } from '../../services/notifications';
import { INTERNAL_CASE_STATUSES, CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import type { ActionResult } from '@/lib/types/actions';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { archiveCaseFilesBestEffort } from '@/lib/db/archiveCaseFiles';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';
import { resolveWorkDeadline } from '@/lib/cases/workDeadline';

// S3-01 — Dentista acepta una oferta concreta (comparativo anónimo)
export async function acceptProposalAction(caseId: string, invitationId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.orgId) return { success: false, error: 'No autorizado' };

  try {
    const [cCase] = await db
      .select()
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    if (!cCase) return { success: false, error: 'Caso no encontrado' };
    if (cCase.doctorId !== identity.id && !identity.isSystemAdmin) {
      return { success: false, error: 'Solo el dentista del caso puede aceptar una oferta' };
    }
    if (cCase.status !== 'propuestaLista') {
      return { success: false, error: 'No hay ofertas en revisión para este caso' };
    }
    if (cCase.proposalExpiresAt && new Date(cCase.proposalExpiresAt) < new Date()) {
      return { success: false, error: 'La ventana para elegir una oferta ha vencido.' };
    }

    const [inv] = await db
      .select()
      .from(caseAssignment)
      .where(and(eq(caseAssignment.id, invitationId), eq(caseAssignment.clinicalCaseId, caseId)))
      .limit(1);

    if (!inv || inv.status !== 'quoted') {
      return { success: false, error: 'Esta oferta ya no está disponible.' };
    }

    const { getConfigForCase } = await import('./fauchard');
    const cfg = await getConfigForCase(caseId);
    const fee = parseFloat(String(cfg.platformFee));

    // proposedPrice aplica el fee de plataforma al total cotizado.
    const quotedTotal = inv.compensation ?? 0;
    const proposedPrice = quotedTotal * (1 + fee);

    return await db.transaction(async (tx) => {
      // Solo losers aún activos (pending/quoted). Los ya 'rejected' —rechazo manual del
      // dentista (OFERTA_RECHAZADA) o del propio técnico (OFERTA_RECHAZADA_POR_TECNICO)—
      // ya recibieron su evento de cierre + notificación; re-emitir OFERTA_NO_SELECCIONADA
      // aquí les duplicaría el aviso en el UCH ("Otra oferta fue elegida" dos veces).
      const losers = await tx
        .select({
          id: caseAssignment.id,
          technicianId: caseAssignment.technicianId,
          compensation: caseAssignment.compensation,
          deadlineDays: caseAssignment.deadlineDays,
          deadlineHours: caseAssignment.deadlineHours,
        })
        .from(caseAssignment)
        .where(and(
          eq(caseAssignment.clinicalCaseId, caseId),
          inArray(caseAssignment.status, ['pending', 'quoted']),
          ne(caseAssignment.id, invitationId),
        ));

      await tx
        .update(caseAssignment)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(and(
          eq(caseAssignment.clinicalCaseId, caseId),
          inArray(caseAssignment.status, ['pending', 'quoted']),
          ne(caseAssignment.id, invitationId),
        ));

      await tx
        .update(caseAssignment)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(and(eq(caseAssignment.clinicalCaseId, caseId), eq(caseAssignment.id, invitationId)));

      await tx.update(clinicalCase).set({
        assignedTechnicianId: inv.technicianId,
        assignedAt: new Date(),
        proposedPrice,
        proposedDeliveryDays: inv.deadlineDays ?? null,
        proposedDeliveryHours: inv.deadlineHours ?? null,
        platformFee: String(fee),
        status: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
        internalStatus: INTERNAL_CASE_STATUSES.ACEPTADA_CONFIGURANDO,
        currentResponsibility: 'tecnico',
        updatedAt: new Date(),
      }).where(eq(clinicalCase.id, caseId));

      await tx
        .update(user)
        .set({ consecutiveNoResponse: 0 })
        .where(eq(user.id, inv.technicianId));

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.OFERTA_ACEPTADA,
        content: 'He aceptado una oferta. Esperando que el laboratorio confirme el inicio del trabajo.',
        payload: {
          visibleTo: 'dentista',
          invitationId: inv.id,
        },
        stateChange: { from: CASE_STATUSES.PROPUESTA_LISTA, to: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO },
        skipActivityUpdate: true,
      }, tx);

      await logCaseEvent({
        caseId,
        userId: inv.technicianId,
        type: 'sistema',
        action: CASE_EVENTS.OFERTA_GANADORA,
        content:
          '¡Tu oferta fue seleccionada! El solicitante aceptó tu propuesta. Confirma el inicio cuando estés listo.',
        payload: { visibleTo: 'tecnico', invitationId: inv.id, ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
        skipActivityUpdate: true,
      }, tx);

      for (const loser of losers) {
        const qp = loser.compensation != null ? Number(loser.compensation) : NaN;
        const qd = loser.deadlineDays != null ? Math.trunc(Number(loser.deadlineDays)) : NaN;
        const qh = loser.deadlineHours != null ? Math.trunc(Number(loser.deadlineHours)) : NaN;
        const compensationPayload = Number.isFinite(qp) && qp >= 0 ? qp : null;
        const deadlineDaysPayload = Number.isFinite(qd) && qd > 0 ? qd : null;
        const deadlineHoursPayload = Number.isFinite(qh) && qh > 0 ? qh : null;

        await logCaseEvent({
          caseId,
          userId: loser.technicianId,
          type: 'sistema',
          action: CASE_EVENTS.OFERTA_NO_SELECCIONADA,
          content: 'Este caso fue asignado a otro laboratorio. ¡Gracias por tu oferta!',
          payload: {
            visibleTo: 'tecnico',
            invitationId: loser.id,
            compensation: compensationPayload,
            deadlineDays: deadlineDaysPayload,
            deadlineHours: deadlineHoursPayload,
            ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
          },
          skipActivityUpdate: true,
        }, tx);

        await logCaseEvent({
          caseId,
          userId: identity.id as string,
          type: 'sistema',
          action: CASE_EVENTS.OFERTA_NO_SELECCIONADA,
          content: 'Esta oferta quedó fuera al elegir otra propuesta para el caso.',
          payload: {
            visibleTo: 'dentista',
            invitationId: loser.id,
            compensation: compensationPayload,
            deadlineDays: deadlineDaysPayload,
            deadlineHours: deadlineHoursPayload,
          },
          skipActivityUpdate: true,
        }, tx);

        await notifyUser(loser.technicianId, 'CASO_ASIGNADO_OTRO', { caseId, caseNumber: cCase.caseNumber });
      }

      // Un solo UPDATE de lastActivityAt tras todos los eventos del loop de aceptación
      await tx.update(clinicalCase).set({ lastActivityAt: new Date() }).where(eq(clinicalCase.id, caseId));

      await notifyUser(inv.technicianId, 'TRABAJO_CONFIRMADO', { caseId, caseNumber: cCase.caseNumber });

      return { success: true };
    });
  } catch (error) {
    console.error('[acceptProposalAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

/** Dentista rechaza una cotización puntual dentro del comparativo */
export async function rejectInvitationOfferAction(
  caseId: string,
  invitationId: string,
  feedback: string
): Promise<ActionResult<{ closedCase?: boolean }>> {
  const identity = await getServerIdentity();
  if (!identity?.orgId) return { success: false, error: 'No autorizado' };

  const fb = (feedback ?? '').trim();
  if (fb.length < 3) {
    return { success: false, error: 'El comentario para el laboratorio es obligatorio (mín. 3 caracteres).' };
  }

  const guarded = await guardTextOrFail({
    actionName: 'rejectInvitationOfferAction',
    caseId,
    identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
    fields: [{ text: fb, field: 'dentistRejectionFeedback' }],
  });
  if (!guarded.ok) return { success: false, error: guarded.error };

  try {
    const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    if (!cCase) return { success: false, error: 'Caso no encontrado' };
    if (cCase.doctorId !== identity.id && !identity.isSystemAdmin) {
      return { success: false, error: 'Solo el dentista del caso puede rechazar ofertas' };
    }
    if (cCase.status !== CASE_STATUSES.PROPUESTA_LISTA) {
      return { success: false, error: 'No hay comparativo activo' };
    }
    if (cCase.proposalExpiresAt && new Date(cCase.proposalExpiresAt) < new Date()) {
      return { success: false, error: 'La ventana comparativa ya venció.' };
    }

    const [inv] = await db
      .select()
      .from(caseAssignment)
      .where(and(eq(caseAssignment.id, invitationId), eq(caseAssignment.clinicalCaseId, caseId)))
      .limit(1);

    if (!inv || inv.status !== 'quoted') {
      return { success: false, error: 'Solo pueden rechazarse ofertas activas.' };
    }

    const result = await db.transaction(async (tx) => {
      await tx
        .update(caseAssignment)
        .set({
          status: 'rejected',
          rejectionComment: fb,
          updatedAt: new Date(),
        })
        .where(eq(caseAssignment.id, invitationId));

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.OFERTA_RECHAZADA,
        content: `Rechazaste una oferta. Tu comentario fue enviado al laboratorio.`,
        payload: {
          visibleTo: 'dentista',
          invitationId: inv.id,
          feedback: fb,
          compensation:
            inv.compensation != null && Number.isFinite(Number(inv.compensation))
              ? Number(inv.compensation)
              : null,
          deadlineDays:
            inv.deadlineDays != null && Number.isFinite(Number(inv.deadlineDays))
              ? Math.trunc(Number(inv.deadlineDays))
              : null,
        },
      }, tx);

      await logCaseEvent({
        caseId,
        userId: inv.technicianId,
        type: 'sistema',
        action: CASE_EVENTS.OFERTA_RECHAZADA,
        content: `Tu oferta no fue seleccionada en esta ocasión.`,
        payload: {
          visibleTo: 'tecnico',
          invitationId: inv.id,
          feedbackDentista: fb,
          ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
        },
      }, tx);

      await notifyUser(inv.technicianId, 'PROPUESTA_RECHAZADA_DENTISTA', { caseId, caseNumber: cCase.caseNumber });

      const stillQuoted = await tx
        .select({ id: caseAssignment.id })
        .from(caseAssignment)
        .where(and(eq(caseAssignment.clinicalCaseId, caseId), eq(caseAssignment.status, 'quoted')));

      if (stillQuoted.length === 0) {
        await tx.update(clinicalCase).set({
          status: CASE_STATUSES.CERRADO,
          internalStatus: INTERNAL_CASE_STATUSES.RECHAZADO_TODAS_OFERTAS,
          currentResponsibility: null,
          updatedAt: new Date(),
        }).where(eq(clinicalCase.id, caseId));

        await logCaseEvent({
          caseId,
          userId: identity.id as string,
          type: 'sistema',
          action: CASE_EVENTS.CASO_OFERTAS_TODAS_RECHAZADAS,
          content:
            'He rechazado todas las ofertas disponibles. El caso quedó cerrado. Puedes crear un nuevo caso si lo necesitas.',
          payload: { visibleTo: 'dentista' },
        }, tx);

        return { success: true as const, closedCase: true };
      }

      return { success: true as const, closedCase: false };
    });

    if (result.success && result.closedCase) {
      await archiveCaseFilesBestEffort(caseId);
    }

    return result;
  } catch (error) {
    console.error('[rejectInvitationOfferAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

/** @deprecated — el modelo comparativo fue reemplazado por asignación directa. */
export async function withdrawQuoteAction(_invitationId: string): Promise<ActionResult> {
  return { success: false, error: 'Las cotizaciones ya no están disponibles; usa aceptar o rechazar la asignación.' };
}

/** Expira la vista comparativa: sin técnico asignado, todas las cotizaciones activas pasan a retiradas */
export async function expireDentistComparativeWindowAction(caseId: string): Promise<ActionResult> {
  const now = new Date();
  try {
    const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    if (!cCase || cCase.status !== CASE_STATUSES.PROPUESTA_LISTA) return { success: true };
    if (!cCase.proposalExpiresAt || new Date(cCase.proposalExpiresAt) > now) return { success: true };

    await db.transaction(async (tx) => {
      const affected = await tx
        .select({ id: caseAssignment.id, technicianId: caseAssignment.technicianId })
        .from(caseAssignment)
        .where(and(eq(caseAssignment.clinicalCaseId, caseId), eq(caseAssignment.status, 'quoted')));

      await tx
        .update(caseAssignment)
        .set({ status: 'withdrawn', updatedAt: now })
        .where(and(eq(caseAssignment.clinicalCaseId, caseId), eq(caseAssignment.status, 'quoted')));

      await tx
        .update(caseAssignment)
        .set({ status: 'withdrawn', updatedAt: now })
        .where(and(eq(caseAssignment.clinicalCaseId, caseId), eq(caseAssignment.status, 'pending')));

      await tx
        .update(clinicalCase)
        .set({
          status: CASE_STATUSES.CERRADO,
          internalStatus: INTERNAL_CASE_STATUSES.PROPUESTA_EXPIRADA,
          currentResponsibility: null,
          updatedAt: now,
        })
        .where(eq(clinicalCase.id, caseId));

      await logCaseEvent({
        caseId,
        userId: 'sistema',
        type: 'sistema',
        action: CASE_EVENTS.PROPUESTA_EXPIRADA,
        content:
          'Venció el plazo para elegir una oferta. El caso se cerró automáticamente. Puedes publicar uno nuevo si corresponde.',
        payload: { visibleTo: 'dentista' },
      }, tx);

      for (const row of affected) {
        await notifyUser(row.technicianId, 'PROPUESTA_RECHAZADA_DENTISTA', { caseId, caseNumber: cCase.caseNumber });
      }

      if (cCase.doctorId) {
        await notifyUser(cCase.doctorId, 'COMPARATIVO_EXPIRADO_DENTISTA', { caseId });
      }
    });

    // Caso cerrado por vencimiento del comparativo → marca archivos para lifecycle.
    await archiveCaseFilesBestEffort(caseId);

    return { success: true };
  } catch (error) {
    console.error('[expireDentistComparativeWindowAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// Legacy: compat tests / llamadas indirectas previas — redirige a expiración del comparativo
export async function rejectProposalAction(caseId: string, _reason?: string): Promise<ActionResult> {
  return expireDentistComparativeWindowAction(caseId);
}

// S3-04 — Técnico inicia el trabajo
export async function startWorkAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.orgId) return { success: false, error: 'No autorizado' };

  try {
    const [cCase] = await db
      .select()
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    if (!cCase) return { success: false, error: 'Caso no encontrado' };
    if (cCase.assignedTechnicianId !== identity.id && !identity.isSystemAdmin) {
      return { success: false, error: 'Solo el técnico asignado puede iniciar el trabajo' };
    }
    if (cCase.status !== CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO) {
      return { success: false, error: 'El caso no está esperando inicio de trabajo' };
    }
    if (cCase.workStartedAt) {
      return { success: false, error: 'El trabajo ya fue iniciado' };
    }

    const now = new Date();

    const [acceptedAssignment] = await db
      .select({ deadlineDays: caseAssignment.deadlineDays })
      .from(caseAssignment)
      .where(
        and(
          eq(caseAssignment.clinicalCaseId, caseId),
          eq(caseAssignment.technicianId, identity.id as string),
          eq(caseAssignment.status, 'accepted'),
        ),
      )
      .limit(1);

    const workDeadline = resolveWorkDeadline({
      desiredDeliveryAt: cCase.desiredDeliveryAt,
      publishedAt: cCase.publishedAt,
      deadlineDays: acceptedAssignment?.deadlineDays ?? cCase.proposedDeliveryDays,
    });

    const [winnerInv] = await db
      .select({ id: caseAssignment.id })
      .from(caseAssignment)
      .where(
        and(eq(caseAssignment.clinicalCaseId, caseId), eq(caseAssignment.status, 'accepted')),
      )
      .limit(1);

    await db.update(clinicalCase)
      .set({
        status: CASE_STATUSES.EN_EJECUCION,
        internalStatus: INTERNAL_CASE_STATUSES.EN_EJECUCION_DISENO,
        currentResponsibility: 'tecnico',
        workStartedAt: now,
        workDeadline,
        updatedAt: now,
      })
      .where(eq(clinicalCase.id, caseId));

    // Compuerta de Calidad: asignar revisor con reparto equitativo (best-effort, inerte con flag off).
    try {
      await assignQualityReviewerAction(caseId);
    } catch (e) {
      console.warn('[startWorkAction] No se pudo asignar revisor de Calidad:', e);
    }

    const deadlineLabel = workDeadline.toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const deadlineTime = workDeadline.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: CASE_EVENTS.TRABAJO_INICIADO,
      content: 'He confirmado el inicio del trabajo.',
      payload: {
        visibleTo: 'tecnico',
        invitationId: winnerInv?.id,
        workDeadline: workDeadline.toISOString(),
        workStartedAt: now.toISOString(),
      },
      stateChange: { from: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO, to: CASE_STATUSES.EN_EJECUCION },
    });

    if (cCase.doctorId) {
      await logCaseEvent({
        caseId,
        userId: cCase.doctorId,
        type: 'sistema',
        action: CASE_EVENTS.TRABAJO_INICIADO,
        content: `El laboratorio asignado confirmó el inicio. Entrega máxima: ${deadlineLabel} a las ${deadlineTime}.`,
        payload: {
          visibleTo: 'dentista',
          workDeadline: workDeadline.toISOString(),
          ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
        },
        stateChange: { from: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO, to: CASE_STATUSES.EN_EJECUCION },
      });

      await notifyUser(cCase.doctorId, 'FAUCHARD_INICIO_PLAZO_DENTISTA', {
        caseId,
        caseNumber: cCase.caseNumber,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('[startWorkAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

export async function checkProposalExpiryAction(caseId: string): Promise<{ expired: boolean }> {
  const [cCase] = await db
    .select()
    .from(clinicalCase)
    .where(eq(clinicalCase.id, caseId))
    .limit(1);

  if (!cCase || cCase.status !== CASE_STATUSES.PROPUESTA_LISTA) return { expired: false };
  if (!cCase.proposalExpiresAt || new Date(cCase.proposalExpiresAt) > new Date()) return { expired: false };

  const res = await expireDentistComparativeWindowAction(caseId);
  return { expired: res.success };
}
