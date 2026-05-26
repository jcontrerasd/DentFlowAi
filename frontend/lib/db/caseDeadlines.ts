/**
 * Ventanas temporales Fauchard (countdowns independientes por etapa).
 *
 * - QuoteWindow (etapa 1): técnicos invitados cotizan — `case_invitation.expires_at`, config `tQuoteMinutes`.
 * - ComparativeWindow (etapa 2): dentista elige oferta — `clinical_case.proposal_expires_at`, config `tProposalHours`.
 *
 * Ninguna lectura HTTP debe recalcular estos valores; solo las acciones de transición los fijan.
 */

import { db } from '@/lib/db';
import { caseInvitation, clinicalCase } from '@/lib/db/schema';
import { eq, and, inArray, max } from 'drizzle-orm';

/** Etapa 1 — plazo para que invitados envíen cotización (`enEvaluacion`). */
export type QuoteWindow = {
  kind: 'quote';
  /** Instantáneo límite agregado (max expires_at de invitaciones activas en cotización). */
  deadlineAt: Date | null;
};

/** Etapa 2 — plazo para que el dentista acepte/rechace en comparativo (`propuestaLista`). */
export type ComparativeWindow = {
  kind: 'comparative';
  deadlineAt: Date | null;
};

const QUOTE_ACTIVE_STATUSES = ['pending', 'quoted'] as const;

/**
 * Deadline de cotización para un caso: máximo `expires_at` entre invitaciones
 * `pending` o `quoted` (ventana aún relevante para la ronda en evaluación).
 */
export async function getCaseQuoteDeadlineAt(caseId: string): Promise<Date | null> {
  const [row] = await db
    .select({ deadline: max(caseInvitation.expiresAt) })
    .from(caseInvitation)
    .where(
      and(
        eq(caseInvitation.clinicalCaseId, caseId),
        inArray(caseInvitation.status, [...QUOTE_ACTIVE_STATUSES]),
      ),
    );

  const d = row?.deadline;
  return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
}

/** Batch: `caseId` → deadline cotización (solo casos pasados en `caseIds`). */
export async function getCaseQuoteDeadlineAtBatch(
  caseIds: string[],
): Promise<Map<string, Date | null>> {
  const map = new Map<string, Date | null>();
  if (caseIds.length === 0) return map;

  const rows = await db
    .select({
      caseId: caseInvitation.clinicalCaseId,
      deadline: max(caseInvitation.expiresAt),
    })
    .from(caseInvitation)
    .where(
      and(
        inArray(caseInvitation.clinicalCaseId, caseIds),
        inArray(caseInvitation.status, [...QUOTE_ACTIVE_STATUSES]),
      ),
    )
    .groupBy(caseInvitation.clinicalCaseId);

  for (const id of caseIds) map.set(id, null);
  for (const r of rows) {
    const d = r.deadline;
    map.set(
      r.caseId,
      d instanceof Date && Number.isFinite(d.getTime()) ? d : null,
    );
  }
  return map;
}

/** Deadline comparativo ya persistido (no recalcula desde config). */
export function getCaseProposalDeadlineAt(
  cCase: { proposalExpiresAt?: Date | string | null },
): Date | null {
  const raw = cCase.proposalExpiresAt;
  if (raw == null) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}
