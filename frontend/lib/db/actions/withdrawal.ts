'use server';

/**
 * Retiro unilateral del técnico de un caso ya aceptado (v5.32). Solo posible
 * mientras tiene la "posta" (`currentResponsibility === 'tecnico'`). El caso
 * NO se reasigna de inmediato: vuelve a `enEvaluacion` con
 * `internalStatus: 'retiro_pendiente'` hasta que el dentista decida continuar
 * (nueva fecha estimada, re-anclada al aceptar el reemplazo) o cancelar sin
 * costo. El técnico pierde su compensación y recibe 1 evento de no-respuesta
 * (misma sanción rolling 14d que el resto del motor).
 */

import { db } from '@/lib/db';
import { clinicalCase, caseAssignment, withdrawalReason, fauchardConfig } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { CASE_STATUSES, INTERNAL_CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { computeProposedDeliveryDays } from '@/lib/cases/workDeadline';
import { notifyUser } from '../../services/notifications';
import { getServerIdentity } from './impersonation';
import { logCaseEvent, closeCaseQualityAssignment } from './cases';
import { recordNoResponseEventAction } from './noResponseEvents';
import { tryReplaceAfterRejectAction } from './replacement';
import { cancelCaseAction } from './cancellation';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';
import type { ActionResult } from '@/lib/types/actions';

export async function withdrawFromCaseAction(
  caseId: string,
  input: { reasonId: string; comment?: string },
): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };

  try {
    const [cCase] = await db
      .select({
        id: clinicalCase.id,
        status: clinicalCase.status,
        assignedTechnicianId: clinicalCase.assignedTechnicianId,
        currentResponsibility: clinicalCase.currentResponsibility,
        publishedAt: clinicalCase.publishedAt,
        desiredDeliveryAt: clinicalCase.desiredDeliveryAt,
      })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);
    if (!cCase) return { success: false, error: 'Caso no encontrado' };

    if (cCase.assignedTechnicianId !== identity.id) {
      return { success: false, error: 'No autorizado' };
    }
    if (cCase.currentResponsibility !== 'tecnico') {
      return { success: false, error: 'No puedes retirarte mientras el caso está en manos de Calidad o del dentista' };
    }

    const [assignment] = await db
      .select({ id: caseAssignment.id })
      .from(caseAssignment)
      .where(and(
        eq(caseAssignment.clinicalCaseId, caseId),
        eq(caseAssignment.technicianId, identity.id as string),
        eq(caseAssignment.status, 'accepted'),
      ))
      .limit(1);
    if (!assignment) return { success: false, error: 'No tienes una asignación activa en este caso' };

    const [reason] = await db
      .select({ id: withdrawalReason.id, label: withdrawalReason.label, isActive: withdrawalReason.isActive })
      .from(withdrawalReason)
      .where(and(eq(withdrawalReason.id, input.reasonId), eq(withdrawalReason.isActive, true)))
      .limit(1);
    if (!reason) return { success: false, error: 'Motivo de retiro inválido' };

    const isOtro = reason.label.trim().toLowerCase() === 'otro';
    const commentTrim = (input.comment ?? '').trim();
    if (isOtro && commentTrim.length < 3) {
      return { success: false, error: 'Indica un motivo (mín. 3 caracteres).' };
    }
    if (commentTrim) {
      const guarded = await guardTextOrFail({
        actionName: 'withdrawFromCaseAction',
        caseId,
        identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
        fields: [{ text: commentTrim, field: 'withdrawalComment' }],
      });
      if (!guarded.ok) return { success: false, error: guarded.error };
    }

    const now = new Date();
    const pactDays = computeProposedDeliveryDays(cCase.publishedAt, cCase.desiredDeliveryAt);

    await db
      .update(caseAssignment)
      .set({
        status: 'withdrawn',
        withdrawalReasonId: reason.id,
        withdrawalComment: commentTrim || null,
        withdrawnAt: now,
        updatedAt: now,
      })
      .where(eq(caseAssignment.id, assignment.id));

    await db
      .update(clinicalCase)
      .set({
        status: CASE_STATUSES.EN_EVALUACION,
        internalStatus: INTERNAL_CASE_STATUSES.RETIRO_PENDIENTE,
        assignedTechnicianId: null,
        currentResponsibility: 'dentista',
        workStartedAt: null,
        withdrawalPendingSince: now,
        pactDaysSnapshot: pactDays,
        updatedAt: now,
        lastActivityAt: now,
      })
      .where(eq(clinicalCase.id, caseId));

    await closeCaseQualityAssignment(db, caseId);

    await recordNoResponseEventAction(identity.id as string, assignment.id);

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'tecnico',
      action: CASE_EVENTS.RETIRO_TECNICO,
      content: 'Me retiré del caso.',
      payload: { visibleTo: 'tecnico', assignmentId: assignment.id, reasonId: reason.id },
    });

    const estimatedDate = new Date(now.getTime() + pactDays * 86_400_000);
    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: CASE_EVENTS.REASIGNACION_REQUERIDA,
      content: 'El caso requiere reasignación producto de una contingencia técnica.',
      payload: { visibleTo: 'dentista', estimatedDate, ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
    });

    const doctorId = (await db.select({ doctorId: clinicalCase.doctorId }).from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1))[0]?.doctorId;
    if (doctorId) {
      await notifyUser(doctorId, 'RETIRO_DECISION_REQUERIDA', {
        caseId,
        estimatedDate: estimatedDate.toLocaleDateString('es-CL'),
      });
    }

    return { success: true };
  } catch (error) {
    console.error('[withdrawFromCaseAction]', error);
    return { success: false, error: 'Fallo al retirarse del caso' };
  }
}

/**
 * El dentista (o el sistema, al vencer el plazo de decisión) opta por seguir
 * buscando reemplazo. Reusa la cascada de reemplazo existente.
 */
export async function continueAfterWithdrawalAction(
  caseId: string,
  opts?: { systemActorId?: string },
): Promise<ActionResult<{ replaced: boolean }>> {
  const identity = opts?.systemActorId ? null : await getServerIdentity();
  if (!opts?.systemActorId) {
    if (!identity?.id) return { success: false, error: 'No autenticado' };
    const [cCase] = await db.select({ doctorId: clinicalCase.doctorId }).from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    const isAdmin = identity.role === 'admin' || identity.isSystemAdmin;
    if (!isAdmin && cCase?.doctorId !== identity.id) return { success: false, error: 'No autorizado' };
  }

  try {
    // CAS: solo continúa si el caso sigue efectivamente en retiro_pendiente.
    const cleared = await db
      .update(clinicalCase)
      .set({ withdrawalPendingSince: null, updatedAt: new Date() })
      .where(and(
        eq(clinicalCase.id, caseId),
        eq(clinicalCase.internalStatus, INTERNAL_CASE_STATUSES.RETIRO_PENDIENTE),
        sql`${clinicalCase.withdrawalPendingSince} IS NOT NULL`,
      ))
      .returning({ id: clinicalCase.id });
    if (cleared.length === 0) {
      return { success: true, replaced: false };
    }

    const [withdrawnAssignment] = await db
      .select({ id: caseAssignment.id })
      .from(caseAssignment)
      .where(and(eq(caseAssignment.clinicalCaseId, caseId), eq(caseAssignment.status, 'withdrawn')))
      .orderBy(sql`${caseAssignment.withdrawnAt} DESC`)
      .limit(1);
    if (!withdrawnAssignment) return { success: false, error: 'No se encontró la asignación retirada' };

    const actorId = opts?.systemActorId ?? (identity?.id as string);
    await logCaseEvent({
      caseId,
      userId: actorId,
      type: 'sistema',
      action: CASE_EVENTS.REASIGNACION_CONTINUADA,
      content: opts?.systemActorId
        ? 'Venció el plazo de decisión; seguimos buscando reemplazo.'
        : 'El dentista decidió continuar buscando reemplazo.',
      payload: { visibleTo: 'dentista', ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
    });

    const res = await tryReplaceAfterRejectAction(withdrawnAssignment.id);
    return { success: true, replaced: res.success ? !!(res as { replaced?: boolean }).replaced : false };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** El dentista cancela el caso mientras espera decidir tras el retiro del técnico. Gratis. */
export async function cancelAfterWithdrawalAction(
  caseId: string,
  input: { reasonId: string; comment?: string },
): Promise<ActionResult<{ moment: 'A' | 'B' }>> {
  const res = await cancelCaseAction(caseId, input);
  if (!res.success) return res;
  await db.update(clinicalCase).set({ closureCause: 'cancelacion_post_retiro' }).where(eq(clinicalCase.id, caseId));
  return res;
}

/** Cron (process-pool-queue, 2 min): continúa por defecto los casos cuyo plazo de decisión venció. */
export async function processWithdrawalDecisionTimeoutsAction(): Promise<ActionResult<{ processed: number }>> {
  try {
    const [cases, activeConfigRows] = await Promise.all([
      db
        .select({
          id: clinicalCase.id,
          startedAt: clinicalCase.withdrawalPendingSince,
          anchoredHours: fauchardConfig.tWithdrawalDecisionHours,
        })
        .from(clinicalCase)
        .leftJoin(fauchardConfig, eq(fauchardConfig.id, clinicalCase.fauchardConfigId))
        .where(and(
          eq(clinicalCase.internalStatus, INTERNAL_CASE_STATUSES.RETIRO_PENDIENTE),
          sql`${clinicalCase.withdrawalPendingSince} IS NOT NULL`,
        )),
      db.select({ hours: fauchardConfig.tWithdrawalDecisionHours })
        .from(fauchardConfig)
        .where(eq(fauchardConfig.isActive, true))
        .limit(1),
    ]);
    const activeHours = activeConfigRows[0]?.hours ?? 24;

    const now = Date.now();
    let processed = 0;
    for (const c of cases) {
      const hours = c.anchoredHours ?? activeHours;
      if (!c.startedAt || now - new Date(c.startedAt).getTime() < hours * 3_600_000) continue;
      const doctorId = (await db.select({ doctorId: clinicalCase.doctorId, caseNumber: clinicalCase.caseNumber }).from(clinicalCase).where(eq(clinicalCase.id, c.id)).limit(1))[0];
      await continueAfterWithdrawalAction(c.id, { systemActorId: 'system' });
      if (doctorId?.doctorId) {
        await notifyUser(doctorId.doctorId, 'REASIGNACION_CONTINUADA_TIMEOUT', { caseId: c.id, caseNumber: doctorId.caseNumber });
      }
      processed++;
    }

    return { success: true, processed };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
