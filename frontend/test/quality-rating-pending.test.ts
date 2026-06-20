import { describe, expect, it } from 'vitest';
import { isQualityRatingPending } from '@/lib/cases/qualityRatingPending';

const base = {
  status: 'completado',
  qualityReviewerId: 'rev-1',
  viewerId: 'rev-1',
  hasQualityReview: false,
};

describe('isQualityRatingPending', () => {
  it('es true cuando el caso está completado, soy el revisor y no he calificado', () => {
    expect(isQualityRatingPending(base)).toBe(true);
  });

  it('es false una vez que existe la calificación', () => {
    expect(isQualityRatingPending({ ...base, hasQualityReview: true })).toBe(false);
  });

  it('es false si el caso aún no está completado', () => {
    expect(isQualityRatingPending({ ...base, status: 'enRevisionCalidad' })).toBe(false);
  });

  it('es false si el viewer no es el revisor asignado', () => {
    expect(isQualityRatingPending({ ...base, viewerId: 'otro' })).toBe(false);
  });

  it('es false si el caso no tiene revisor de Calidad', () => {
    expect(isQualityRatingPending({ ...base, qualityReviewerId: null })).toBe(false);
  });
});
