/**
 * Utilidades puras del score de disponibilidad (v5.0). Sin DB ni mocks.
 */
import { describe, it, expect } from 'vitest';
import { levelToScoreN, RENORMALIZED_ALPHAS } from '@/lib/availabilityScore';

describe('levelToScoreN', () => {
  it('mapea nivel → N: 0/1 → 0.0, 2 → 0.5, 3 → 1.0', () => {
    expect(levelToScoreN(0)).toBe(0);
    expect(levelToScoreN(1)).toBe(0);
    expect(levelToScoreN(2)).toBe(0.5);
    expect(levelToScoreN(3)).toBe(1);
  });
});

describe('RENORMALIZED_ALPHAS', () => {
  it('mantiene |Σα| = 1.00 incluyendo αN (§2.5)', () => {
    const sumAbs =
      Math.abs(RENORMALIZED_ALPHAS.quality) +
      Math.abs(RENORMALIZED_ALPHAS.punctuality) +
      Math.abs(RENORMALIZED_ALPHAS.experience) +
      Math.abs(RENORMALIZED_ALPHAS.load) +
      Math.abs(RENORMALIZED_ALPHAS.noResponse);
    expect(sumAbs).toBeCloseTo(1.0, 5);
  });

  it('αN es el segundo coeficiente tras calidad', () => {
    expect(RENORMALIZED_ALPHAS.noResponse).toBe(0.2);
    expect(RENORMALIZED_ALPHAS.quality).toBe(0.25);
    const others = [
      RENORMALIZED_ALPHAS.punctuality,
      RENORMALIZED_ALPHAS.experience,
      RENORMALIZED_ALPHAS.load,
    ];
    for (const a of others) expect(RENORMALIZED_ALPHAS.quality).toBeGreaterThanOrEqual(a);
  });
});
