import { describe, expect, it } from 'vitest';
import { computeGroupDisplayLevel } from '@/lib/profile/skillGroupLevel';

describe('computeGroupDisplayLevel', () => {
  it('returns 0 for empty array', () => {
    expect(computeGroupDisplayLevel([])).toBe(0);
  });

  it('returns 0 when all levels are 0', () => {
    expect(computeGroupDisplayLevel([0, 0, 0, 0, 0, 0, 0])).toBe(0);
  });

  it('rounds average including zeros (1 at 6, 6 at 0 → 1)', () => {
    expect(computeGroupDisplayLevel([0, 0, 0, 0, 0, 6, 0])).toBe(1);
  });

  it('returns the level when all are equal', () => {
    expect(computeGroupDisplayLevel([5, 5, 5, 5])).toBe(5);
  });

  it('rounds mixed levels', () => {
    expect(computeGroupDisplayLevel([4, 4, 4, 6, 6, 6, 6])).toBe(5);
  });

  it('clamps to 0–7', () => {
    expect(computeGroupDisplayLevel([7, 7, 7])).toBe(7);
    expect(computeGroupDisplayLevel([0])).toBe(0);
  });
});
