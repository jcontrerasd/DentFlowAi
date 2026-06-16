import { describe, it, expect } from 'vitest';
import {
  resolveWorkType,
  resolveCategory,
  resolveCaseComplexity,
  resolveScenario,
  resolvePonticFlag,
} from '@/lib/fauchard/caseWorkType';
import { CASE_COMPLEXITY } from '@/lib/constants/dental';

describe('caseWorkType taxonomy v5.13', () => {
  it('corona 1 pieza sin póntico → coronas / corona_unitaria', () => {
    const wt = resolveWorkType({
      restorationLabel: 'Corona Unitaria',
      teeth: [36],
      replacesMissingTeeth: false,
    });
    expect(wt).toBe('corona_unitaria');
    expect(resolveCategory(wt)).toBe('coronas');
  });

  it('corona 6 piezas sin póntico → corona_multiple_larga', () => {
    const teeth = [11, 12, 13, 14, 15, 16];
    const wt = resolveWorkType({
      restorationLabel: 'Corona Unitaria',
      teeth,
      replacesMissingTeeth: false,
    });
    expect(wt).toBe('corona_multiple_larga');
    expect(resolveCategory(wt)).toBe('coronas');
  });

  it('corona 10 piezas sin póntico → full_arch_corona / full_arch', () => {
    const teeth = Array.from({ length: 10 }, (_, i) => i + 11);
    const wt = resolveWorkType({
      restorationLabel: 'Corona Unitaria',
      teeth,
      replacesMissingTeeth: false,
    });
    expect(wt).toBe('full_arch_corona');
    expect(resolveCategory(wt)).toBe('full_arch');
  });

  it('puente 3 piezas con póntico → puente_corto / puentes', () => {
    const wt = resolveWorkType({
      restorationLabel: 'Puente',
      teeth: [11, 12, 13],
      replacesMissingTeeth: true,
    });
    expect(wt).toBe('puente_corto');
    expect(resolveCategory(wt)).toBe('puentes');
  });

  it('carilla 4 sin póntico → carilla_multiple / carillas', () => {
    const wt = resolveWorkType({
      restorationLabel: 'Carilla',
      teeth: [11, 12, 13, 14],
      replacesMissingTeeth: false,
    });
    expect(wt).toBe('carilla_multiple');
    expect(resolveCategory(wt)).toBe('carillas');
  });

  it('inlay cualquier cantidad → inlays', () => {
    const wt = resolveWorkType({
      restorationLabel: 'Inlay',
      teeth: [36, 37],
      replacesMissingTeeth: false,
    });
    expect(wt).toBe('inlay_onlay');
    expect(resolveCategory(wt)).toBe('inlays');
  });

  it('notas estéticas largas no elevan complejidad (4 piezas corona → intermedio)', () => {
    const cx = resolveCaseComplexity({
      restorationLabel: 'Corona Unitaria',
      teeth: [11, 12, 13, 14],
      replacesMissingTeeth: false,
    });
    expect(cx).toBe(CASE_COMPLEXITY.INTERMEDIO);
  });

  it('guía quirúrgica → crítico', () => {
    const scenario = resolveScenario({
      restorationLabel: 'Guía Quirúrgica',
      teeth: [11],
      replacesMissingTeeth: false,
    });
    expect(scenario.caseComplexity).toBe(CASE_COMPLEXITY.CRITICO);
    expect(scenario.caseLeague).toBe('elite');
  });

  it('legacy null póntico en Puente infiere true', () => {
    expect(resolvePonticFlag(null, 'Puente')).toBe(true);
    expect(resolvePonticFlag(null, 'Corona Unitaria')).toBe(false);
  });

  it('≥10 unidades con póntico → full_arch', () => {
    const teeth = Array.from({ length: 10 }, (_, i) => i + 11);
    const wt = resolveWorkType({
      restorationLabel: 'Puente',
      teeth,
      replacesMissingTeeth: true,
    });
    expect(wt).toBe('full_arch');
    expect(resolveCategory(wt)).toBe('full_arch');
  });
});
