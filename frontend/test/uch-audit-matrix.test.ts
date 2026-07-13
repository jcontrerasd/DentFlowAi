import { describe, expect, it } from 'vitest';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_AUDIT_MATRIX } from '@/lib/constants/uchAuditMatrix';
import { buildUchTimelineRows, primaryUchActionId } from '@/components/cases/uch/buildUchTimelineRows';

describe('UCH audit matrix', () => {
  it('cataloga cancelación del dentista y retiro del técnico', () => {
    const actions = UCH_AUDIT_MATRIX.map((r) => r.action);
    expect(actions).toContain(CASE_EVENTS.CASO_CANCELADO);
    expect(actions).toContain(CASE_EVENTS.ASIGNACION_ANULADA);
    expect(actions).toContain(CASE_EVENTS.RETIRO_TECNICO);
    expect(actions).toContain(CASE_EVENTS.REASIGNACION_REQUERIDA);
    expect(actions).toContain(CASE_EVENTS.REASIGNACION_CONTINUADA);
    expect(actions).toContain(CASE_EVENTS.FECHA_FIRME_ACTUALIZADA);
  });

  it('primaryUchActionId respeta prioridad delivery > case_actions', () => {
    expect(
      primaryUchActionId({ includeDelivery: true, includeCaseActions: true }),
    ).toBe('delivery');
    expect(
      primaryUchActionId({ includeDelivery: false, includeCaseActions: true }),
    ).toBe('case_actions');
    expect(
      primaryUchActionId({ includeDelivery: false, includeCaseActions: false }),
    ).toBe(null);
  });

  it('buildUchTimelineRows incluye fila case_actions cuando aplica', () => {
    const rows = buildUchTimelineRows({
      events: [],
      includeContext: false,
      includeCaseActions: true,
      includeDelivery: false,
      pinActionId: 'case_actions',
    });
    expect(rows.some((r) => r.kind === 'action' && r.id === 'case_actions')).toBe(true);
  });
});
