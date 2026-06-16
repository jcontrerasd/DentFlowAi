/**
 * Score de asignación directa — Q/P/E/B suman; L/N restan.
 * score = αQ·Q + αP·P + αE·E + αB·B − αL·L − αN·N
 */

import { levelToScoreN, type SanctionLevel } from '@/lib/availabilityScore';

export type AssignmentScoreComponents = {
  Q: number;
  P: number;
  E: number;
  B: number;
  L: number;
  N: number;
};

export type AssignmentScoreInput = {
  avgRating: number | null;
  onTimeRate: number | null;
  designLevel: number;
  activeLoad: number;
  maxActiveLoad: number;
  sanctionLevel: SanctionLevel;
  /** Días desde última asignación (`user.lastInvitedAt`). Usar valor alto si nunca asignado. */
  daysSinceAssignment: number;
  dBonusMaxDays: number;
};

export type AssignmentScoreWeights = {
  alphaQuality: number;
  alphaPunctuality: number;
  alphaExperience: number;
  alphaBonus: number;
  alphaLoad: number;
  alphaNoResponse: number;
};

export function normalizeQuality(avgRating: number | null): number {
  return avgRating !== null ? avgRating / 5 : 0.5;
}

export function normalizePunctuality(onTimeRate: number | null): number {
  return onTimeRate !== null ? onTimeRate : 0.8;
}

export function normalizeExperience(designLevel: number): number {
  return Math.min(Math.max(designLevel, 0), 7) / 7;
}

/** Carga activa normalizada 0–1 (más casos activos → L más alto). */
export function normalizeLoad(activeLoad: number, maxActiveLoad = 5): number {
  if (maxActiveLoad <= 0) return 0;
  return Math.min(activeLoad / maxActiveLoad, 1);
}

/**
 * Bono de infrautilización: crece linealmente con días sin asignación hasta 1.0.
 * `daysSinceAssignment` alto (p. ej. nunca asignado) → B = 1.0.
 */
export function normalizeUnderutilization(daysSinceAssignment: number, dBonusMaxDays: number): number {
  const maxDays = Math.max(1, dBonusMaxDays);
  if (daysSinceAssignment >= maxDays) return 1.0;
  if (daysSinceAssignment <= 0) return 0;
  return Math.min(daysSinceAssignment / maxDays, 1.0);
}

export function computeAssignmentScore(
  input: AssignmentScoreInput,
  weights: AssignmentScoreWeights,
): { score: number; components: AssignmentScoreComponents } {
  const Q = normalizeQuality(input.avgRating);
  const P = normalizePunctuality(input.onTimeRate);
  const E = normalizeExperience(input.designLevel);
  const B = normalizeUnderutilization(input.daysSinceAssignment, input.dBonusMaxDays);
  const L = normalizeLoad(input.activeLoad, input.maxActiveLoad);
  const N = levelToScoreN(input.sanctionLevel);

  const score = Math.max(
    0,
    weights.alphaQuality * Q +
      weights.alphaPunctuality * P +
      weights.alphaExperience * E +
      weights.alphaBonus * B -
      weights.alphaLoad * L -
      weights.alphaNoResponse * N,
  );

  return { score, components: { Q, P, E, B, L, N } };
}

export function parseAssignmentWeights(config: {
  alphaQuality: string | number;
  alphaPunctuality: string | number;
  alphaExperience: string | number;
  alphaLoad?: string | number;
  alphaBonus?: string | number;
  alphaNoResponse?: string | number | null;
}): AssignmentScoreWeights {
  return {
    alphaQuality: parseFloat(String(config.alphaQuality)),
    alphaPunctuality: parseFloat(String(config.alphaPunctuality)),
    alphaExperience: parseFloat(String(config.alphaExperience)),
    alphaLoad: parseFloat(String(config.alphaLoad ?? '0.15')),
    alphaBonus: parseFloat(String(config.alphaBonus ?? '0.10')),
    alphaNoResponse: parseFloat(String(config.alphaNoResponse ?? '0.25')),
  };
}
