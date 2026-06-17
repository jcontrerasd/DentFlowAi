/**
 * Ventanas temporales Fauchard (countdowns independientes por etapa).
 *
 * - QuoteWindow (etapa 1): técnicos invitados cotizan — `case_invitation.expires_at`, config `tQuoteMinutes`.
 * - ComparativeWindow (etapa 2): dentista elige oferta — `clinical_case.proposal_expires_at`, config `tProposalHours`.
 *
 * Ninguna lectura HTTP debe recalcular estos valores; solo las acciones de transición los fijan.
 */

import { db } from '@/lib/db';
import { caseAssignment, clinicalCase, fauchardConfig } from '@/lib/db/schema';
import { eq, and, inArray, max } from 'drizzle-orm';
import { isAvailabilityEnabled } from '@/lib/constants/availabilityFlags';
import { isQualityGateEnabled } from '@/lib/constants/qualityFlags';

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
    .select({ deadline: max(caseAssignment.expiresAt) })
    .from(caseAssignment)
    .where(
      and(
        eq(caseAssignment.clinicalCaseId, caseId),
        inArray(caseAssignment.status, [...QUOTE_ACTIVE_STATUSES]),
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
      caseId: caseAssignment.clinicalCaseId,
      deadline: max(caseAssignment.expiresAt),
    })
    .from(caseAssignment)
    .where(
      and(
        inArray(caseAssignment.clinicalCaseId, caseIds),
        inArray(caseAssignment.status, [...QUOTE_ACTIVE_STATUSES]),
      ),
    )
    .groupBy(caseAssignment.clinicalCaseId);

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

/**
 * Etapa 3 (v5.0) — plazo del dentista para revisar una entrega del técnico
 * (`enRevision`). Wall-clock: `last_revision_submitted_at + tDentistReviewHours`.
 * Cada nueva entrega reinicia `last_revision_submitted_at` (§4.2), así que el
 * countdown se recalcula solo. Devuelve null si el modelo está apagado o no hay
 * entrega registrada. Self-contained: lee la config anclada al caso o la activa.
 */
export async function getCaseReviewDeadlineAt(caseId: string): Promise<Date | null> {
  if (!isAvailabilityEnabled()) return null;

  const [row] = await db
    .select({
      submittedAt: clinicalCase.lastRevisionSubmittedAt,
      anchoredHours: fauchardConfig.tDentistReviewHours,
    })
    .from(clinicalCase)
    .leftJoin(fauchardConfig, eq(fauchardConfig.id, clinicalCase.fauchardConfigId))
    .where(eq(clinicalCase.id, caseId))
    .limit(1);

  if (!row?.submittedAt) return null;

  let hours = row.anchoredHours ?? null;
  if (hours == null) {
    const [active] = await db
      .select({ hours: fauchardConfig.tDentistReviewHours })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .limit(1);
    hours = active?.hours ?? 48;
  }

  const deadline = new Date(new Date(row.submittedAt).getTime() + hours * 3_600_000);
  return Number.isFinite(deadline.getTime()) ? deadline : null;
}

/**
 * Etapa de Calidad (v5.19) — plazo de Calidad para certificar una entrega
 * (`enRevisionCalidad`). Wall-clock: `last_quality_submitted_at + tQualityReviewHours`.
 * Cada entrega del técnico a Calidad reinicia `last_quality_submitted_at`. Devuelve null
 * si el flag de Calidad está off o no hay entrega registrada. Lee config anclada o activa.
 */
export async function getCaseQualityReviewDeadlineAt(caseId: string): Promise<Date | null> {
  if (!isQualityGateEnabled()) return null;

  const [row] = await db
    .select({
      submittedAt: clinicalCase.lastQualitySubmittedAt,
      anchoredHours: fauchardConfig.tQualityReviewHours,
    })
    .from(clinicalCase)
    .leftJoin(fauchardConfig, eq(fauchardConfig.id, clinicalCase.fauchardConfigId))
    .where(eq(clinicalCase.id, caseId))
    .limit(1);

  if (!row?.submittedAt) return null;

  let hours = row.anchoredHours ?? null;
  if (hours == null) {
    const [active] = await db
      .select({ hours: fauchardConfig.tQualityReviewHours })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .limit(1);
    hours = active?.hours ?? 24;
  }

  const deadline = new Date(new Date(row.submittedAt).getTime() + hours * 3_600_000);
  return Number.isFinite(deadline.getTime()) ? deadline : null;
}
