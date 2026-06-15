'use server';

/**
 * Reasignación automática tras rechazo o expiración de asignación.
 * Siguiente candidato en el ranking (excluye técnicos ya intentados).
 */

import { db } from '@/lib/db';
import { caseAssignment, clinicalCase } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { logCaseEvent } from './cases';
import { getConfigForCase } from './fauchard';
import { assignCaseAction, rankAssignmentCandidates } from './assignment';
import type { ActionResult } from '@/lib/types/actions';

export async function tryReplaceAfterRejectAction(
  assignmentId: string,
): Promise<ActionResult<{ replaced: boolean; reason?: string }>> {
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
    if (prior.length >= maxAttempts) {
      return { success: true, replaced: false, reason: 'max_attempts' };
    }

    const tried = new Set(prior.map((r) => r.technicianId));
    const ranked = await rankAssignmentCandidates(caseId);
    const next = ranked.find((r) => !tried.has(r.technicianId));
    if (!next) {
      return { success: true, replaced: false, reason: 'no_candidate' };
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
