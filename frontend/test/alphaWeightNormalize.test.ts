import { describe, it, expect } from 'vitest';
import {
  sumActiveAlphas,
  renormalizeActiveAlphas,
  configValuesDiffer,
  isDraftKeyDirty,
} from '@/lib/fauchard/alphaWeightNormalize';

const DEFAULT_SIX = {
  alphaQuality: 0.2,
  alphaPunctuality: 0.15,
  alphaExperience: 0.15,
  alphaBonus: 0.10,
  alphaLoad: 0.15,
  alphaNoResponse: 0.25,
};

describe('alphaWeightNormalize', () => {
  it('suma los 6 α activos', () => {
    expect(sumActiveAlphas(DEFAULT_SIX)).toBeCloseTo(1.0, 3);
  });

  it('detecta Σ5=0.900 del esquema post-v5.14 (bonus oculto en UI)', () => {
    const legacyVisible = {
      alphaQuality: 0.2,
      alphaPunctuality: 0.15,
      alphaExperience: 0.15,
      alphaLoad: 0.15,
      alphaNoResponse: 0.25,
    };
    expect(sumActiveAlphas(legacyVisible)).toBeCloseTo(0.9, 3);
  });

  it('renormaliza proporcionalmente a Σ6=1.000', () => {
    const normalized = renormalizeActiveAlphas({
      alphaQuality: 0.2,
      alphaPunctuality: 0.15,
      alphaExperience: 0.15,
      alphaBonus: 0,
      alphaLoad: 0.15,
      alphaNoResponse: 0.25,
    });
    expect(sumActiveAlphas(normalized)).toBeCloseTo(1.0, 3);
    expect(normalized.alphaBonus).toBe(0);
    expect(normalized.alphaQuality).toBeCloseTo(0.222, 3);
    expect(normalized.alphaNoResponse).toBeGreaterThan(0.27);
  });

  it('configValuesDiffer usa tolerancia 0.001', () => {
    expect(configValuesDiffer('0.200', 0.2)).toBe(false);
    expect(configValuesDiffer('0.200', 0.201)).toBe(false);
    expect(configValuesDiffer('0.200', 0.202)).toBe(true);
  });

  it('isDraftKeyDirty ignora diferencias dentro de epsilon', () => {
    expect(isDraftKeyDirty('alphaQuality', 0.2, 0.2000004)).toBe(false);
    expect(isDraftKeyDirty('alphaQuality', 0.21, 0.2)).toBe(true);
  });
});
