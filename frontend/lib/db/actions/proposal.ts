'use server';

import { db } from '@/lib/db';
import { clinicalCase, caseInvitation, user } from '@/lib/db/schema';
import { eq, and, inArray, ne } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { notifyUser } from '../../services/notifications';
import { INTERNAL_CASE_STATUSES, CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import type { ActionResult } from '@/lib/types/actions';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { archiveCaseFilesBestEffort } from '@/lib/db/archiveCaseFiles';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';

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
      .from(caseInvitation)
      .where(and(eq(caseInvitation.id, invitationId), eq(caseInvitation.clinicalCaseId, caseId)))
      .limit(1);

    if (!inv || inv.status !== 'quoted') {
      return { success: false, error: 'Esta oferta ya no está disponible.' };
    }

    const { getConfigForCase } = await import('./fauchard');
    const cfg = await getConfigForCase(caseId);
    const fee = parseFloat(String(cfg.platformFee));
    const proposedPrice = (inv.quotedPrice ?? 0) * (1 + fee);

    return await db.transaction(async (tx) => {
      // Incluye invitaciones ya rejected para técnico (evento + notificación CASO_ASIGNADO_OTRO).
      // UCH dentista: no duplicar "quedó fuera al elegir otra" si esa oferta ya tenía rechazo manual (status rejected).
      const losers = await tx
        .select({
          id: caseInvitation.id,
          technicianId: caseInvitation.technicianId,
          quotedPrice: caseInvitation.quotedPrice,
          quotedDays: caseInvitation.quotedDays,
          techNotes: caseInvitation.techNotes,
          status: caseInvitation.status,
        })
        .from(caseInvitation)
        .where(and(
          eq(caseInvitation.clinicalCaseId, caseId),
          inArray(caseInvitation.status, ['pending', 'quoted', 'rejected']),
          ne(caseInvitation.id, invitationId),
        ));

      await tx
        .update(caseInvitation)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(and(
          eq(caseInvitation.clinicalCaseId, caseId),
          inArray(caseInvitation.status, ['pending', 'quoted']),
          ne(caseInvitation.id, invitationId),
        ));

      await tx
        .update(caseInvitation)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.id, invitationId)));

      await tx.update(clinicalCase).set({
        assignedTechnicianId: inv.technicianId,
        assignedAt: new Date(),
        proposedPrice,
        proposedDeliveryDays: inv.quotedDays ?? 5,
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
      }, tx);

      await logCaseEvent({
        caseId,
        userId: inv.technicianId,
        type: 'sistema',
        action: CASE_EVENTS.OFERTA_GANADORA,
        content:
          '¡Tu oferta fue seleccionada! El solicitante aceptó tu propuesta. Confirma el inicio cuando estés listo.',
        payload: { visibleTo: 'tecnico', invitationId: inv.id, ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
      }, tx);

      for (const loser of losers) {
        const qp = loser.quotedPrice != null ? Number(loser.quotedPrice) : NaN;
        const qd = loser.quotedDays != null ? Math.trunc(Number(loser.quotedDays)) : NaN;
        const techNotesPayload = loser.techNotes?.trim() ? loser.techNotes.trim().slice(0, 200) : null;
        const quotedPricePayload = Number.isFinite(qp) && qp >= 0 ? qp : null;
        const quotedDaysPayload = Number.isFinite(qd) && qd > 0 ? qd : null;

        await logCaseEvent({
          caseId,
          userId: loser.technicianId,
          type: 'sistema',
          action: CASE_EVENTS.OFERTA_NO_SELECCIONADA,
          content: 'Este caso fue asignado a otro laboratorio. ¡Gracias por tu oferta!',
          payload: {
            visibleTo: 'tecnico',
            invitationId: loser.id,
            quotedPrice: quotedPricePayload,
            quotedDays: quotedDaysPayload,
            techNotes: techNotesPayload,
            ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
          },
        }, tx);

        if (loser.status !== 'rejected') {
          await logCaseEvent({
            caseId,
            userId: identity.id as string,
            type: 'sistema',
            action: CASE_EVENTS.OFERTA_NO_SELECCIONADA,
            content: 'Esta oferta quedó fuera al elegir otra propuesta para el caso.',
            payload: {
              visibleTo: 'dentista',
              invitationId: loser.id,
              quotedPrice: quotedPricePayload,
              quotedDays: quotedDaysPayload,
              techNotes: techNotesPayload,
            },
          }, tx);
        }

        await notifyUser(loser.technicianId, 'CASO_ASIGNADO_OTRO', { caseId, caseNumber: cCase.caseNumber });
      }

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
      .from(caseInvitation)
      .where(and(eq(caseInvitation.id, invitationId), eq(caseInvitation.clinicalCaseId, caseId)))
      .limit(1);

    if (!inv || inv.status !== 'quoted') {
      return { success: false, error: 'Solo pueden rechazarse ofertas activas.' };
    }

    const result = await db.transaction(async (tx) => {
      await tx
        .update(caseInvitation)
        .set({
          status: 'rejected',
          dentistRejectionFeedback: fb,
          updatedAt: new Date(),
        })
        .where(eq(caseInvitation.id, invitationId));

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
          quotedPrice:
            inv.quotedPrice != null && Number.isFinite(Number(inv.quotedPrice))
              ? Number(inv.quotedPrice)
              : null,
          quotedDays:
            inv.quotedDays != null && Number.isFinite(Number(inv.quotedDays))
              ? Math.trunc(Number(inv.quotedDays))
              : null,
          quotedDesignPrice: inv.quotedDesignPrice,
          quotedDesignDays: inv.quotedDesignDays,
          quotedFabricationPrice: inv.quotedFabricationPrice,
          quotedFabricationDays: inv.quotedFabricationDays,
          techNotes: inv.techNotes?.trim() ? inv.techNotes.trim() : null,
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
        .select({ id: caseInvitation.id })
        .from(caseInvitation)
        .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted')));

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

/** Técnico retira su cotización antes de aceptación del dentista; la invitación vuelve a pending para recotizar. */
export async function withdrawQuoteAction(invitationId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };

  try {
    const [inv] = await db
      .select()
      .from(caseInvitation)
      .where(eq(caseInvitation.id, invitationId))
      .limit(1);

    if (!inv) return { success: false, error: 'Invitación no encontrada' };
    if (inv.technicianId !== identity.id) return { success: false, error: 'No autorizado' };
    if (inv.status !== 'quoted') {
      return { success: false, error: 'Solo puedes retirar una oferta que ya enviaste y sigue activa.' };
    }

    const [cCase] = await db
      .select()
      .from(clinicalCase)
      .where(eq(clinicalCase.id, inv.clinicalCaseId))
      .limit(1);

    if (!cCase) return { success: false, error: 'Caso no encontrado' };

    const allowedCaseStatuses = [CASE_STATUSES.EN_EVALUACION, CASE_STATUSES.PROPUESTA_LISTA] as string[];
    if (!allowedCaseStatuses.includes(cCase.status)) {
      return { success: false, error: 'Este caso ya no permite retirar la oferta.' };
    }

    if (cCase.status === CASE_STATUSES.PROPUESTA_LISTA) {
      if (cCase.proposalExpiresAt && new Date(cCase.proposalExpiresAt) < new Date()) {
        return { success: false, error: 'La ventana comparativa ya venció.' };
      }
    }

    if (inv.expiresAt && new Date(inv.expiresAt) < new Date()) {
      return { success: false, error: 'El plazo para cotizar en esta invitación ya venció.' };
    }

    const snapshot = {
      quotedPrice: inv.quotedPrice,
      quotedDays: inv.quotedDays,
      quotedDesignPrice: inv.quotedDesignPrice,
      quotedDesignDays: inv.quotedDesignDays,
      quotedFabricationPrice: inv.quotedFabricationPrice,
      quotedFabricationDays: inv.quotedFabricationDays,
      techNotes: inv.techNotes?.trim() ? inv.techNotes.trim().slice(0, 200) : null,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(caseInvitation)
        .set({
          status: 'pending',
          quotedPrice: null,
          quotedDays: null,
          quotedDesignPrice: null,
          quotedDesignDays: null,
          quotedFabricationPrice: null,
          quotedFabricationDays: null,
          techNotes: null,
          respondedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(caseInvitation.id, invitationId));

      await logCaseEvent({
        caseId: inv.clinicalCaseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.OFERTA_RETIRADA,
        content: 'He retirado mi oferta. Puedo enviar una nueva mientras no venza el plazo de cotización.',
        payload: {
          visibleTo: 'tecnico',
          invitationId: inv.id,
          ...snapshot,
        },
      }, tx);
    });

    return { success: true };
  } catch (error) {
    console.error('[withdrawQuoteAction] Error:', error);
    return { success: false, error: String(error) };
  }
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
        .select({ id: caseInvitation.id, technicianId: caseInvitation.technicianId })
        .from(caseInvitation)
        .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted')));

      await tx
        .update(caseInvitation)
        .set({ status: 'withdrawn', updatedAt: now })
        .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted')));

      await tx
        .update(caseInvitation)
        .set({ status: 'withdrawn', updatedAt: now })
        .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending')));

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
    const workDeadline = addBusinessDays(now, cCase.proposedDeliveryDays ?? 5);

    const [winnerInv] = await db
      .select({ id: caseInvitation.id })
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'confirmed')))
      .limit(1);

    // Solo fabricación: el flujo salta diseño/revisión y va directo a `enFabricacion`.
    // Para los otros tipos (solo_diseno / integral) se mantiene la transición a `enEjecucion`.
    const isSoloFabrication = cCase.serviceType === 'solo_fabricacion';
    const nextStatus = isSoloFabrication ? CASE_STATUSES.EN_FABRICACION : CASE_STATUSES.EN_EJECUCION;
    const nextInternal = isSoloFabrication
      ? INTERNAL_CASE_STATUSES.EN_EJECUCION_DISENO // reutilizamos el estado interno como "ejecución en curso"
      : INTERNAL_CASE_STATUSES.EN_EJECUCION_DISENO;

    await db.update(clinicalCase)
      .set({
        status: nextStatus,
        internalStatus: nextInternal,
        currentResponsibility: 'tecnico',
        workStartedAt: now,
        workDeadline,
        updatedAt: now,
      })
      .where(eq(clinicalCase.id, caseId));

    const deadlineLabel = workDeadline.toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const deadlineTime = workDeadline.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    const techAction = isSoloFabrication ? CASE_EVENTS.FABRICACION_INICIADA : CASE_EVENTS.TRABAJO_INICIADO;
    const techContent = isSoloFabrication
      ? 'He iniciado la fabricación del caso.'
      : 'He confirmado el inicio del trabajo.';

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: techAction,
      content: techContent,
      payload: {
        visibleTo: 'tecnico',
        invitationId: winnerInv?.id,
        workDeadline: workDeadline.toISOString(),
        workStartedAt: now.toISOString(),
      },
      stateChange: { from: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO, to: nextStatus },
    });

    if (cCase.doctorId) {
      const dentistContent = isSoloFabrication
        ? `El laboratorio asignado inició la fabricación. Entrega máxima: ${deadlineLabel} a las ${deadlineTime}.`
        : `El laboratorio asignado confirmó el inicio. Entrega máxima: ${deadlineLabel} a las ${deadlineTime}.`;

      await logCaseEvent({
        caseId,
        userId: cCase.doctorId,
        type: 'sistema',
        action: techAction,
        content: dentistContent,
        payload: {
          visibleTo: 'dentista',
          workDeadline: workDeadline.toISOString(),
          ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
        },
        stateChange: { from: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO, to: nextStatus },
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

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  result.setHours(18, 0, 0, 0);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
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
