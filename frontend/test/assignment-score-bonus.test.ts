import { describe, it, expect } from 'vitest';
import {
  normalizeUnderutilization,
  computeAssignmentScore,
  type AssignmentScoreInput,
  type AssignmentScoreWeights,
} from '@/lib/fauchard/assignmentScore';

const baseWeights: AssignmentScoreWeights = {
  alphaQuality: 0.20,
  alphaPunctuality: 0.15,
  alphaExperience: 0.15,
  alphaBonus: 0.10,
  alphaLoad: 0.15,
  alphaNoResponse: 0.25,
};

const baseInput: AssignmentScoreInput = {
  avgRating: 4.0,
  onTimeRate: 0.9,
  designLevel: 5,
  activeLoad: 0,
  maxActiveLoad: 5,
  sanctionLevel: 0,
  daysSinceAssignment: 0,
  dBonusMaxDays: 30,
};

describe('normalizeUnderutilization', () => {
  it('0 días → B = 0', () => {
    expect(normalizeUnderutilization(0, 30)).toBe(0);
  });

  it('15 días con ventana 30 → B = 0.5', () => {
    expect(normalizeUnderutilization(15, 30)).toBeCloseTo(0.5, 3);
  });

  it('≥ ventana → B = 1.0', () => {
    expect(normalizeUnderutilization(30, 30)).toBe(1);
    expect(normalizeUnderutilization(999, 30)).toBe(1);
  });

  it('ventana mínima 1 día evita división por cero', () => {
    expect(normalizeUnderutilization(1, 0)).toBe(1);
  });
});

describe('computeAssignmentScore — bono B', () => {
  it('score sube cuando B es alto (mismos Q/P/E/L/N)', () => {
    const lowB = computeAssignmentScore(
      { ...baseInput, daysSinceAssignment: 0 },
      baseWeights,
    );
    const highB = computeAssignmentScore(
      { ...baseInput, daysSinceAssignment: 30 },
      baseWeights,
    );
    expect(highB.components.B).toBe(1);
    expect(lowB.components.B).toBe(0);
    expect(highB.score).toBeGreaterThan(lowB.score);
    expect(highB.score - lowB.score).toBeCloseTo(baseWeights.alphaBonus, 3);
  });

  it('expone componente B en desglose', () => {
    const { components } = computeAssignmentScore(
      { ...baseInput, daysSinceAssignment: 15 },
      baseWeights,
    );
    expect(components).toHaveProperty('B');
    expect(components.B).toBeCloseTo(0.5, 3);
  });
});
