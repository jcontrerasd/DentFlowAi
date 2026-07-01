import { describe, expect, it } from 'vitest';
import { filterCaseEventsForUchViewer } from '@/lib/caseEventsUchFilter';
import { resolveUchThreadLane } from '@/lib/uchThreadLane';
import { shouldPresentUchEventAsFauchard, sanitizeUchPayloadForViewer } from '@/lib/uchPresentation';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';

const target = { assignedTechnicianId: 'u-tech', doctorId: 'u-dent' };

function ev(action: string, userId: string, payload: Record<string, unknown>) {
  return { type: 'sistema', action, userId, payload };
}

describe('Calidad — visibilidad de eventos (anonimato)', () => {
  it('el dentista NO ve los eventos de la etapa de Calidad', () => {
    const events = [
      ev(CASE_EVENTS.REVISION_ENVIADA_CALIDAD, 'u-tech', { visibleTo: 'tecnico', qualityScoped: true }),
      ev(CASE_EVENTS.REVISION_SOLICITADA_CALIDAD, 'u-cal', { visibleTo: 'tecnico', qualityScoped: true }),
      ev(CASE_EVENTS.CALIDAD_CERTIFICADA, 'u-cal', { visibleTo: 'tecnico', qualityScoped: true }),
      ev(CASE_EVENTS.ASIGNACION_CALIDAD, 'u-cal', { visibleTo: 'calidad' }),
      ev(CASE_EVENTS.CASO_DERIVADO_CALIDAD, 'u-cal', { visibleTo: 'calidad' }),
    ];
    const visible = filterCaseEventsForUchViewer(events, { id: 'u-dent', role: 'dentista' }, target, null);
    expect(visible).toHaveLength(0);
  });

  it('el técnico asignado SÍ ve los eventos de Calidad (qualityScoped) aunque los emita Calidad', () => {
    const events = [
      ev(CASE_EVENTS.REVISION_SOLICITADA_CALIDAD, 'u-cal', { visibleTo: 'tecnico', qualityScoped: true }),
      ev(CASE_EVENTS.CALIDAD_CERTIFICADA, 'u-cal', { visibleTo: 'tecnico', qualityScoped: true }),
    ];
    const visible = filterCaseEventsForUchViewer(events, { id: 'u-tech', role: 'tecnico' }, target, null);
    expect(visible).toHaveLength(2);
  });

  it('un técnico distinto del asignado NO ve los eventos de Calidad', () => {
    const events = [ev(CASE_EVENTS.CALIDAD_CERTIFICADA, 'u-cal', { visibleTo: 'tecnico', qualityScoped: true })];
    const visible = filterCaseEventsForUchViewer(events, { id: 'u-other', role: 'tecnico' }, target, null);
    expect(visible).toHaveLength(0);
  });

  it('Calidad ve todos los eventos de su caso (excepto derivaciones de otros)', () => {
    const events = [
      ev(CASE_EVENTS.REVISION_ENVIADA_CALIDAD, 'u-tech', { visibleTo: 'tecnico', qualityScoped: true }),
      ev(CASE_EVENTS.REVISION_SOLICITADA, 'u-dent', { visibleTo: 'ambos' }),
      ev(CASE_EVENTS.ASIGNACION_CALIDAD, 'u-cal', { visibleTo: 'calidad' }),
    ];
    const visible = filterCaseEventsForUchViewer(events, { id: 'u-cal', role: 'calidad' }, target, null);
    expect(visible).toHaveLength(3);
  });
});

describe('Calidad — visibilidad de derivaciones (aislamiento entre revisores)', () => {
  const QA1 = 'u-qa1';
  const QA2 = 'u-qa2';
  const QA3 = 'u-qa3';

  it('el técnico asignado NO ve CASO_DERIVADO_CALIDAD', () => {
    const events = [ev(CASE_EVENTS.CASO_DERIVADO_CALIDAD, QA1, { visibleTo: 'calidad', fromCalidadId: QA1, toCalidadId: QA2 })];
    const visible = filterCaseEventsForUchViewer(events, { id: 'u-tech', role: 'tecnico' }, target, null);
    expect(visible).toHaveLength(0);
  });

  it('el dentista NO ve CASO_DERIVADO_CALIDAD', () => {
    const events = [ev(CASE_EVENTS.CASO_DERIVADO_CALIDAD, QA1, { visibleTo: 'calidad', fromCalidadId: QA1, toCalidadId: QA2 })];
    const visible = filterCaseEventsForUchViewer(events, { id: 'u-dent', role: 'dentista' }, target, null);
    expect(visible).toHaveLength(0);
  });

  it('QA1 (origen) SÍ ve la derivación que él inició a QA2', () => {
    const events = [ev(CASE_EVENTS.CASO_DERIVADO_CALIDAD, QA1, { visibleTo: 'calidad', fromCalidadId: QA1, toCalidadId: QA2 })];
    const visible = filterCaseEventsForUchViewer(events, { id: QA1, role: 'calidad' }, target, null);
    expect(visible).toHaveLength(1);
  });

  it('QA2 (destino) SÍ ve la derivación recibida de QA1', () => {
    const events = [ev(CASE_EVENTS.CASO_DERIVADO_CALIDAD, QA1, { visibleTo: 'calidad', fromCalidadId: QA1, toCalidadId: QA2 })];
    const visible = filterCaseEventsForUchViewer(events, { id: QA2, role: 'calidad' }, target, null);
    expect(visible).toHaveLength(1);
  });

  it('QA3 (no participante) NO ve el intercambio QA1↔QA2', () => {
    const events = [
      ev(CASE_EVENTS.CASO_DERIVADO_CALIDAD, QA1, { visibleTo: 'calidad', fromCalidadId: QA1, toCalidadId: QA2 }),
      ev(CASE_EVENTS.DERIVACION_CALIDAD_RECHAZADA, QA2, { visibleTo: 'calidad', fromCalidadId: QA2, toCalidadId: QA1 }),
    ];
    const visible = filterCaseEventsForUchViewer(events, { id: QA3, role: 'calidad' }, target, null);
    expect(visible).toHaveLength(0);
  });

  it('QA1 SÍ ve el rechazo de QA2 (toCalidadId = QA1)', () => {
    const events = [ev(CASE_EVENTS.DERIVACION_CALIDAD_RECHAZADA, QA2, { visibleTo: 'calidad', fromCalidadId: QA2, toCalidadId: QA1 })];
    const visible = filterCaseEventsForUchViewer(events, { id: QA1, role: 'calidad' }, target, null);
    expect(visible).toHaveLength(1);
  });

  it('QA2 que rechazó SÍ ve el registro de su propio rechazo (fromCalidadId = QA2)', () => {
    const events = [ev(CASE_EVENTS.DERIVACION_CALIDAD_RECHAZADA, QA2, { visibleTo: 'calidad', fromCalidadId: QA2, toCalidadId: QA1 })];
    const visible = filterCaseEventsForUchViewer(events, { id: QA2, role: 'calidad' }, target, null);
    expect(visible).toHaveLength(1);
  });

  it('QA1 y QA3 (nueva derivación) SÍ ven DERIVACION_CALIDAD_ACEPTADA entre ellos', () => {
    const events = [ev(CASE_EVENTS.DERIVACION_CALIDAD_ACEPTADA, QA3, { visibleTo: 'calidad', fromCalidadId: QA1, toCalidadId: QA3 })];
    const visibleQA1 = filterCaseEventsForUchViewer(events, { id: QA1, role: 'calidad' }, target, null);
    const visibleQA3 = filterCaseEventsForUchViewer(events, { id: QA3, role: 'calidad' }, target, null);
    const visibleQA2 = filterCaseEventsForUchViewer(events, { id: QA2, role: 'calidad' }, target, null);
    expect(visibleQA1).toHaveLength(1);
    expect(visibleQA3).toHaveLength(1);
    expect(visibleQA2).toHaveLength(0);
  });
});

describe('Calidad — carril y voz Fauchard hacia el técnico', () => {
  const techViewer = { actingAsDentista: false, actingAsTecnico: true, currentUserId: 'u-tech' };

  it('la solicitud de ajustes de Calidad se muestra al técnico como hilo + Fauchard', () => {
    const lane = resolveUchThreadLane(
      { userId: 'u-cal', type: 'sistema', action: CASE_EVENTS.REVISION_SOLICITADA_CALIDAD, payload: { visibleTo: 'tecnico', qualityScoped: true }, user: { id: 'u-cal', role: 'calidad' } },
      techViewer,
    );
    expect(lane.lane).toBe('thread');
    expect(lane.showAsFauchard).toBe(true);
  });

  it('la propia entrega del técnico a Calidad va a su carril (self)', () => {
    const lane = resolveUchThreadLane(
      { userId: 'u-tech', type: 'tecnico', action: CASE_EVENTS.REVISION_ENVIADA_CALIDAD, payload: { visibleTo: 'tecnico', qualityScoped: true }, user: { id: 'u-tech', role: 'tecnico' } },
      techViewer,
    );
    expect(lane.lane).toBe('self');
    expect(lane.showAsFauchard).toBe(false);
  });
});

describe('Calidad — enmascarado y saneo de payload', () => {
  it('los eventos de Calidad se enmascaran como Fauchard ante el técnico', () => {
    const masked = shouldPresentUchEventAsFauchard(
      { userId: 'u-cal', user: { id: 'u-cal', fullName: 'Ana QA', role: 'calidad' }, payload: { visibleTo: 'tecnico', qualityScoped: true } },
      { id: 'u-tech', role: 'tecnico' },
      'u-dent',
    );
    expect(masked).toBe(true);
  });

  it('la identidad del revisor de Calidad se elimina del payload para dentista y técnico', () => {
    const payload = { calidadUserId: 'u-cal', fromCalidadId: 'u-cal', toCalidadId: 'u-cal2', qualityReviewerId: 'u-cal', reasonId: 'qdr_001' };
    expect(sanitizeUchPayloadForViewer(payload, 'tecnico')).not.toHaveProperty('calidadUserId');
    expect(sanitizeUchPayloadForViewer(payload, 'dentista')).not.toHaveProperty('toCalidadId');
    // Calidad y admin sí conservan la identidad
    expect(sanitizeUchPayloadForViewer(payload, 'calidad')).toHaveProperty('calidadUserId', 'u-cal');
  });
});
