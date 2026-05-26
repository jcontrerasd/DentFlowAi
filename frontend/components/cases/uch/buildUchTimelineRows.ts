import type { UchActionRowId, UchCaseEventLite, UchTimelineRow } from './uchTimelineTypes';
import { compareTimelineRowsNewestFirst } from './uchTimelineTypes';

/** Acción primaria anclada justo por encima de los eventos más recientes (formulario pendiente). */
export type UchPinActionId = UchActionRowId | null;

function ts(d: string | Date | null | undefined): number {
  if (!d) return 0;
  const n = new Date(d).getTime();
  return Number.isFinite(n) ? n : 0;
}

export type BuildUchTimelineRowsInput = {
  events: UchCaseEventLite[];
  /** Tarjeta colapsable con ex-Resumen (acuerdo, plazos, ZIP, avisos). */
  includeContext: boolean;
  includeDentistReview: boolean;
  includeCaseActions: boolean;
  includeDelivery: boolean;
  proposalExpiresAt?: string | Date | null;
  clinicalUpdatedAt?: string | Date | null;
  workDeadline?: string | Date | null;
  /** Fila de acción que debe quedar visible junto a lo más reciente; el resto baja bajo los eventos. */
  pinActionId?: UchPinActionId;
};

export function buildUchTimelineRows(input: BuildUchTimelineRowsInput): UchTimelineRow[] {
  const { events, includeContext, includeDentistReview, includeCaseActions, includeDelivery, pinActionId } = input;
  const maxEventTs = events.reduce((acc, e) => Math.max(acc, ts(e.createdAt)), 0);
  const minEventTs = events.reduce((acc, e) => Math.min(acc, ts(e.createdAt)), Number.POSITIVE_INFINITY);
  const eventFloor = Number.isFinite(minEventTs) ? minEventTs : 0;

  const rows: UchTimelineRow[] = [];

  if (includeContext) {
    rows.push({
      kind: 'context',
      id: 'context',
      sortAt: Math.min(eventFloor, ts(input.clinicalUpdatedAt)) - 86_400_000,
    });
  }

  const pinnedTs = maxEventTs + 10_000;
  const sunkBase = maxEventTs - 500;
  const actionSortAt = (id: UchActionRowId, priority: number) =>
    pinActionId === id ? pinnedTs : sunkBase - priority;

  if (includeDentistReview) {
    rows.push({
      kind: 'action',
      id: 'dentist_review',
      sortAt: actionSortAt('dentist_review', 100),
      priority: 100,
    });
  }

  if (includeDelivery) {
    rows.push({
      kind: 'action',
      id: 'delivery',
      sortAt: actionSortAt('delivery', 80),
      priority: 80,
    });
  }

  if (includeCaseActions) {
    rows.push({
      kind: 'action',
      id: 'case_actions',
      sortAt: actionSortAt('case_actions', 60),
      priority: 60,
    });
  }

  for (const event of events) {
    rows.push({
      kind: 'event',
      id: event.id,
      sortAt: ts(event.createdAt),
      event,
    });
  }

  return rows.sort(compareTimelineRowsNewestFirst);
}

export function primaryUchActionId(params: {
  includeDentistReview: boolean;
  includeDelivery: boolean;
  includeCaseActions: boolean;
}): UchActionRowId | null {
  if (params.includeDentistReview) return 'dentist_review';
  if (params.includeDelivery) return 'delivery';
  if (params.includeCaseActions) return 'case_actions';
  return null;
}
