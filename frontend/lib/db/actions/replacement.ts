'use server';

/**
 * Reemplazo automático tras rechazo explícito (v5.0, §3.3). Cuando una invitación
 * pasa a `rejected`, intenta invitar al siguiente técnico elegible del pool scoreado
 * que aún no fue invitado en el caso, respetando el cutoff temporal de la ronda.
 *
 * NO se dispara por no-respuesta (expired) — eso alimenta la sanción, no genera
 * reemplazo. El gating por feature flag lo hace el caller (rejection.ts).
 */

import { db } from '@/lib/db';
import { caseInvitation, clinicalCase } from '@/lib/db/schema';
import { and, eq, inArray, max } from 'drizzle-orm';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { logCaseEvent } from './cases';
import { getConfigForCase, selectReplacementCandidateAction } from './fauchard';
import { notifyUser } from '../../services/notifications';
import type { ActionResult } from '@/lib/types/actions';

const LIVE_STATUSES = ['pending', 'quoted'] as const;

export async function tryReplaceAfterRejectAction(invitationId: string): Promise<ActionResult<{ replaced: boolean; reason?: string }>> {
  try {
    const [rejected] = await db.select().from(caseInvitation).where(eq(caseInvitation.id, invitationId)).limit(1);
    if (!rejected) return { success: false, error: 'Invitación no encontrada' };
    const caseId = rejected.clinicalCaseId;

    const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    if (!cCase) return { success: false, error: 'Caso no encontrado' };
    if (cCase.status !== CASE_STATUSES.EN_EVALUACION) {
      return { success: true, replaced: false, reason: 'not_en_evaluacion' };
    }

    const config = await getConfigForCase(caseId);

    // Invitaciones vivas (pending + quoted) — para el deadline y el conteo del pool.
    const live = await db
      .select({ expiresAt: caseInvitation.expiresAt })
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), inArray(caseInvitation.status, [...LIVE_STATUSES])));

    if (live.length >= config.nInvited) {
      return { success: true, replaced: false, reason: 'pool_full' };
    }

    // Deadline efectivo del caso = max(expiresAt) de las vivas.
    const deadlineMs = live.reduce<number>((acc, r) => {
      const t = r.expiresAt ? new Date(r.expiresAt).getTime() : 0;
      return t > acc ? t : acc;
    }, 0);
    if (deadlineMs === 0) {
      return { success: true, replaced: false, reason: 'no_active_deadline' };
    }

    const now = Date.now();
    const remainingMs = deadlineMs - now;
    if (remainingMs <= config.replacementCutoffMinutes * 60_000) {
      return { success: true, replaced: false, reason: 'cutoff' };
    }

    // Técnicos ya invitados en este caso (cualquier estado) — se excluyen.
    const invited = await db
      .select({ technicianId: caseInvitation.technicianId })
      .from(caseInvitation)
      .where(eq(caseInvitation.clinicalCaseId, caseId));
    const excludeTechIds = Array.from(new Set(invited.map((r) => r.technicianId)));

    const candidate = await selectReplacementCandidateAction(caseId, excludeTechIds);
    if (!candidate.success || !candidate.technicianId) {
      return { success: true, replaced: false, reason: 'no_candidate' };
    }

    // expiresAt = min(now + tQuoteMinutes, deadline_caso).
    const expiresAt = new Date(Math.min(now + config.tQuoteMinutes * 60_000, deadlineMs));

    await db.insert(caseInvitation).values({
      clinicalCaseId: caseId,
      technicianId: candidate.technicianId,
      status: 'pending',
      invitedAt: new Date(),
      expiresAt,
      workType: rejected.workType ?? null,
      isReplacement: true,
    });

    await logCaseEvent({
      caseId,
      userId: candidate.technicianId,
      type: 'sistema',
      action: CASE_EVENTS.INVITACION_RECIBIDA,
      content: 'Nueva invitación para cotizar (reemplazo).',
      payload: { visibleTo: 'tecnico', isReplacement: true, ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
    });

    await notifyUser(candidate.technicianId, 'NUEVA_INVITACION', {
      caseId,
      deadline: expiresAt.toLocaleString('es-CL'),
    });

    return { success: true, replaced: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
