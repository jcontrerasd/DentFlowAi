/**
 * Visibilidad de CALIFICACION_ENVIADA en el UCH: la nota del dentista al técnico
 * ganador NO debe filtrarse a otros técnicos del caso (perdedores / rechazados).
 */
import { describe, expect, it } from 'vitest';
import { filterCaseEventsForUchViewer } from '@/lib/caseEventsUchFilter';

const WINNER = 'tech-winner';
const LOSER = 'tech-loser';
const DENTIST = 'doc-1';

const targetCase = { assignedTechnicianId: WINNER, doctorId: DENTIST };

function ratingEvent(extra?: Record<string, unknown>) {
  return {
    type: 'negociacion',
    action: 'CALIFICACION_ENVIADA',
    userId: DENTIST,
    payload: { dimension: 'design', rating: 4, visibleTo: 'ambos', ...extra },
  };
}

describe('CALIFICACION_ENVIADA — visibilidad por reviewee', () => {
  it('el técnico ganador (reviewee) ve su calificación', () => {
    const out = filterCaseEventsForUchViewer([ratingEvent({ revieweeId: WINNER })], { id: WINNER, role: 'tecnico' }, targetCase, null);
    expect(out).toHaveLength(1);
  });

  it('un técnico perdedor NO ve la calificación del ganador', () => {
    const out = filterCaseEventsForUchViewer([ratingEvent({ revieweeId: WINNER })], { id: LOSER, role: 'tecnico' }, targetCase, null);
    expect(out).toHaveLength(0);
  });

  it('eventos antiguos sin revieweeId caen al técnico asignado del caso', () => {
    const evt = ratingEvent(); // sin revieweeId
    expect(filterCaseEventsForUchViewer([evt], { id: WINNER, role: 'tecnico' }, targetCase, null)).toHaveLength(1);
    expect(filterCaseEventsForUchViewer([evt], { id: LOSER, role: 'tecnico' }, targetCase, null)).toHaveLength(0);
  });

  it('el dentista autor sí ve la calificación; el admin también', () => {
    expect(filterCaseEventsForUchViewer([ratingEvent({ revieweeId: WINNER })], { id: DENTIST, role: 'dentista' }, targetCase, null)).toHaveLength(1);
    expect(filterCaseEventsForUchViewer([ratingEvent({ revieweeId: WINNER })], { id: 'admin-1', role: 'admin' }, targetCase, null)).toHaveLength(1);
  });
});
