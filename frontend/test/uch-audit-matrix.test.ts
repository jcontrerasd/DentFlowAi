import { describe, expect, it } from 'vitest';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_AUDIT_MATRIX } from '@/lib/constants/uchAuditMatrix';
import { buildUchTimelineRows, primaryUchActionId } from '@/components/cases/uch/buildUchTimelineRows';

describe('UCH audit matrix', () => {
  it('cataloga solicitudes de flujo y cierres por acuerdo', () => {
    const actions = UCH_AUDIT_MATRIX.map((r) => r.action);
    expect(actions).toContain(CASE_EVENTS.SOLICITUD_CAMBIO_FLUJO);
    expect(actions).toContain(CASE_EVENTS.SOLICITUD_CAMBIO_FLUJO_RECHAZADA);
    expect(actions).toContain(CASE_EVENTS.CASO_PAUSADO);
    expect(actions).toContain(CASE_EVENTS.CASO_CANCELADO);
  });

  it('primaryUchActionId respeta prioridad review > delivery > case_actions', () => {
    expect(
      primaryUchActionId({ includeDentistReview: true, includeDelivery: true, includeCaseActions: true }),
    ).toBe('dentist_review');
    expect(
      primaryUchActionId({ includeDentistReview: false, includeDelivery: true, includeCaseActions: true }),
    ).toBe('delivery');
    expect(
      primaryUchActionId({ includeDentistReview: false, includeDelivery: false, includeCaseActions: true }),
    ).toBe('case_actions');
  });

  it('buildUchTimelineRows incluye fila case_actions cuando aplica', () => {
    const rows = buildUchTimelineRows({
      events: [],
      includeContext: false,
      includeDentistReview: false,
      includeCaseActions: true,
      includeDelivery: false,
      pinActionId: 'case_actions',
    });
    expect(rows.some((r) => r.kind === 'action' && r.id === 'case_actions')).toBe(true);
  });
});
