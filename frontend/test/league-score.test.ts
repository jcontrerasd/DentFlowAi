/**
 * Unit — penalización de transición de liga sobre el score (Fase 2, Sprint 2).
 * No requiere DB.
 */
import { describe, it, expect } from 'vitest';
import { applyLeagueTransitionPenalty } from '@/lib/leagueScore';

describe('applyLeagueTransitionPenalty', () => {
  it('no altera el score fuera de transición', () => {
    expect(applyLeagueTransitionPenalty(0.8, false, 0.2)).toBe(0.8);
  });

  it('reduce por (1 - penalización) en transición', () => {
    expect(applyLeagueTransitionPenalty(0.8, true, 0.2)).toBeCloseTo(0.64, 6);
    expect(applyLeagueTransitionPenalty(1.0, true, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('penalización 0 deja el score intacto aun en transición', () => {
    expect(applyLeagueTransitionPenalty(0.9, true, 0)).toBe(0.9);
  });

  it('penalización ≥ 1 no produce score negativo', () => {
    expect(applyLeagueTransitionPenalty(0.9, true, 1)).toBe(0);
    expect(applyLeagueTransitionPenalty(0.9, true, 1.5)).toBe(0);
  });
});
