/**
 * Visibilidad de CALIFICACION_ENVIADA y CALIFICACION_ENVIADA_CALIDAD en el UCH.
 * Ambos eventos solo llegan al técnico ganador (reviewee), al dentista y a calidad.
 * Nunca a técnicos perdedores/rechazados.
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

function qualityRatingEvent(extra?: Record<string, unknown>) {
  return {
    type: 'sistema',
    action: 'CALIFICACION_ENVIADA_CALIDAD',
    userId: 'calidad-1',
    payload: { dimension: 'quality', rating: 4, comment: 'Buen trabajo', visibleTo: 'ambos', revieweeId: WINNER, ...extra },
  };
}

describe('CALIFICACION_ENVIADA_CALIDAD — visibilidad por reviewee', () => {
  it('el técnico ganador (reviewee) ve la calificación de Calidad', () => {
    const out = filterCaseEventsForUchViewer([qualityRatingEvent()], { id: WINNER, role: 'tecnico' }, targetCase, null);
    expect(out).toHaveLength(1);
  });

  it('un técnico perdedor NO ve la calificación de Calidad del ganador', () => {
    const out = filterCaseEventsForUchViewer([qualityRatingEvent()], { id: LOSER, role: 'tecnico' }, targetCase, null);
    expect(out).toHaveLength(0);
  });

  it('el dentista sí ve la calificación de Calidad', () => {
    const out = filterCaseEventsForUchViewer([qualityRatingEvent()], { id: DENTIST, role: 'dentista' }, targetCase, null);
    expect(out).toHaveLength(1);
  });

  it('un revisor de calidad ve la calificación de Calidad', () => {
    const out = filterCaseEventsForUchViewer([qualityRatingEvent()], { id: 'calidad-1', role: 'calidad' }, targetCase, null);
    expect(out).toHaveLength(1);
  });

  it('el admin ve la calificación de Calidad', () => {
    const out = filterCaseEventsForUchViewer([qualityRatingEvent()], { id: 'admin-1', role: 'admin' }, targetCase, null);
    expect(out).toHaveLength(1);
  });
});
