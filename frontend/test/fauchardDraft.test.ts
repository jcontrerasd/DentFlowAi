import { describe, it, expect } from 'vitest';
import { computeDraftErrors, type Draft } from '@/components/admin/fauchard/FauchardDraftContext';
import { isDraftKeyDirty } from '@/lib/fauchard/alphaWeightNormalize';

function baseDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    alphaQuality: 0.20,
    alphaPunctuality: 0.15,
    alphaExperience: 0.15,
    alphaBonus: 0.10,
    alphaLoad: 0.15,
    alphaNoResponse: 0.25,
    wQualityDays: 90,
    dBonusMaxDays: 30,
    loadReferenceMin: 5,
    tCooldownMinutes: 60,
    dInactivityDays: 14,
    maxAssignmentAttempts: 3,
    tQuoteMinutes: 30,
    tDentistReviewHours: 48,
    tNoEligiblePoolHours: 24,
    maxPoolCycles: 3,
    replacementCutoffMinutes: 15,
    noResponseWindowDays: 14,
    noResponseRehabilitationDays: 30,
    level1Threshold: 2,
    level2Threshold: 4,
    level3Threshold: 6,
    inactivityAutoOffDays: 30,
    inactivityReminderDays: 14,
    ...overrides,
  };
}

describe('computeDraftErrors — 6 pesos α', () => {
  it('acepta suma exacta 1.0 con 6 factores', () => {
    expect(computeDraftErrors(baseDraft())).toEqual([]);
  });

  it('rechaza suma distinta de 1.0', () => {
    const errs = computeDraftErrors(baseDraft({ alphaQuality: 0.5 }));
    expect(errs.some((e) => e.rule === 'weights')).toBe(true);
    expect(errs[0].message).toContain('6 pesos');
  });

  it('rechaza maxAssignmentAttempts fuera de rango', () => {
    const errs = computeDraftErrors(baseDraft({ maxAssignmentAttempts: 0 }));
    expect(errs.some((e) => e.rule === 'assignment')).toBe(true);
  });

  it('isDraftKeyDirty no marca cambio por ruido de float del slider', () => {
    expect(isDraftKeyDirty('alphaQuality', 0.2, 0.2000001)).toBe(false);
    expect(isDraftKeyDirty('alphaQuality', 0.26, 0.25)).toBe(true);
  });
});
