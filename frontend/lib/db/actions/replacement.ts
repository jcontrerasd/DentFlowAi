'use server';

/**
 * Reasignación automática tras rechazo o expiración de asignación.
 * Siguiente candidato en el ranking (excluye técnicos ya intentados).
 * Si no hay candidato o se alcanza maxAttempts, entra a pendiente_pool o falla.
 */

import { db } from '@/lib/db';
import { caseAssignment, clinicalCase } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { CASE_STATUSES, INTERNAL_CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { logCaseEvent } from './cases';
import { getConfigForCase } from './fauchard';
import { assignCaseAction, rankAssignmentCandidates } from './assignment';
import { enterPendingPoolAction } from './poolQueue';
import { isPoolPendienteEnabled } from '@/lib/constants/availabilityFlags';
import { POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import type { ActionResult } from '@/lib/types/actions';

export async function tryReplaceAfterRejectAction(
  assignmentId: string,
): Promise<ActionResult<{ replaced: boolean; reason?: string; pooled?: boolean }>> {
  try {
    const [rejected] = await db
      .select()
      .from(caseAssignment)
      .where(eq(caseAssignment.id, assignmentId))
      .limit(1);
    if (!rejected) return { success: false, error: 'Asignación no encontrada' };

    const caseId = rejected.clinicalCaseId;
    const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    if (!cCase) return { success: false, error: 'Caso no encontrado' };
    if (cCase.status !== CASE_STATUSES.EN_EVALUACION) {
      return { success: true, replaced: false, reason: 'not_en_evaluacion' };
    }

    const config = await getConfigForCase(caseId);
    const maxAttempts = (config as { maxAssignmentAttempts?: number }).maxAssignmentAttempts ?? 3;

    const prior = await db
      .select({ technicianId: caseAssignment.technicianId })
      .from(caseAssignment)
      .where(eq(caseAssignment.clinicalCaseId, caseId));

    const tried = new Set(prior.map((r) => r.technicianId));
    const ranked = await rankAssignmentCandidates(caseId);
    const next = prior.length < maxAttempts ? ranked.find((r) => !tried.has(r.technicianId)) : undefined;

    if (!next) {
      const reason = prior.length >= maxAttempts ? 'max_attempts' : 'no_candidate';
      if (await isPoolPendienteEnabled()) {
        const [cCase] = await db.select({ internalStatus: clinicalCase.internalStatus })
          .from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
        if (cCase && cCase.internalStatus !== POOL_INTERNAL_STATUS) {
          await enterPendingPoolAction(caseId);
        }
        return { success: true, replaced: false, reason, pooled: true };
      }
      await db.update(clinicalCase)
        .set({ internalStatus: INTERNAL_CASE_STATUSES.SIN_ASIGNACION_FALLO })
        .where(eq(clinicalCase.id, caseId));
      return { success: true, replaced: false, reason };
    }

    const res = await assignCaseAction(caseId, next.technicianId, {
      isReassignment: true,
      score: next.score,
      fauchardConfigId: config.id,
    });
    if (!res.success) {
      return { success: true, replaced: false, reason: res.error ?? 'assign_failed' };
    }

    await logCaseEvent({
      caseId,
      userId: next.technicianId,
      type: 'sistema',
      action: CASE_EVENTS.ASIGNACION_REASIGNADA,
      content: 'Nueva asignación tras rechazo o expiración.',
      payload: {
        visibleTo: 'tecnico',
        assignmentId: res.assignmentId,
        isReassignment: true,
        ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
      },
    });

    return { success: true, replaced: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
