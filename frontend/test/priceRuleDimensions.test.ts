import { describe, it, expect } from 'vitest';
import {
  validatePriceRuleDimensions,
  normalizeDimensionsOnChange,
  isLegacyInvalidRule,
  getPriceRuleHierarchyHints,
  cascadeFieldState,
  toDimensionVector,
} from '@/lib/pricing/priceRuleDimensions';

const R = 'rest-1';
const U = 'urg-1';
const M = 'mat-1';
const S = 'shade-1';

describe('validatePriceRuleDimensions', () => {
  it('acepta R·*·*·*', () => {
    expect(validatePriceRuleDimensions({ restorationTypeId: R })).toEqual({ ok: true });
  });

  it('acepta R·U·*·* (patrón seed)', () => {
    expect(validatePriceRuleDimensions({ restorationTypeId: R, urgencyId: U })).toEqual({ ok: true });
  });

  it('acepta R·U·M·*', () => {
    expect(
      validatePriceRuleDimensions({ restorationTypeId: R, urgencyId: U, materialId: M }),
    ).toEqual({ ok: true });
  });

  it('acepta R·U·M·S', () => {
    expect(
      validatePriceRuleDimensions({
        restorationTypeId: R,
        urgencyId: U,
        materialId: M,
        shadeId: S,
      }),
    ).toEqual({ ok: true });
  });

  it('rechaza sin restauración', () => {
    const res = validatePriceRuleDimensions({ materialId: M });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('restauración');
  });

  it('rechaza hueco R·*·M·*', () => {
    const res = validatePriceRuleDimensions({ restorationTypeId: R, materialId: M });
    expect(res.ok).toBe(false);
  });

  it('rechaza hueco R·*·*·S', () => {
    const res = validatePriceRuleDimensions({ restorationTypeId: R, shadeId: S });
    expect(res.ok).toBe(false);
  });

  it('rechaza *·M·*·*', () => {
    const res = validatePriceRuleDimensions({ materialId: M });
    expect(res.ok).toBe(false);
  });
});

describe('toDimensionVector', () => {
  it('marca dimensiones fijadas', () => {
    expect(toDimensionVector({ restorationTypeId: R, urgencyId: U })).toEqual([true, true, false, false]);
  });
});

describe('normalizeDimensionsOnChange', () => {
  const base = {
    restorationTypeId: R,
    urgencyId: U,
    materialId: M,
    shadeId: S,
  };

  it('limpia downstream al quitar urgencia', () => {
    const next = normalizeDimensionsOnChange('urgencyId', '', base);
    expect(next.urgencyId).toBe('');
    expect(next.materialId).toBe('');
    expect(next.shadeId).toBe('');
    expect(next.restorationTypeId).toBe(R);
  });

  it('limpiza material y color al quitar material', () => {
    const next = normalizeDimensionsOnChange('materialId', '', base);
    expect(next.materialId).toBe('');
    expect(next.shadeId).toBe('');
    expect(next.urgencyId).toBe(U);
  });
});

describe('isLegacyInvalidRule', () => {
  it('detecta regla legacy con hueco', () => {
    expect(isLegacyInvalidRule({ restorationTypeId: R, materialId: M })).toBe(true);
  });

  it('no marca regla válida', () => {
    expect(isLegacyInvalidRule({ restorationTypeId: R, urgencyId: U })).toBe(false);
  });
});

describe('getPriceRuleHierarchyHints', () => {
  const rules = [
    {
      id: '1',
      code: 'prc_001',
      restorationTypeId: R,
      urgencyId: U,
      materialId: null,
      shadeId: null,
      isActive: true,
    },
    {
      id: '2',
      code: 'prc_002',
      restorationTypeId: R,
      urgencyId: U,
      materialId: M,
      shadeId: null,
      isActive: true,
    },
    {
      id: '3',
      code: 'prc_003',
      restorationTypeId: R,
      urgencyId: null,
      materialId: null,
      shadeId: null,
      isActive: true,
    },
  ];

  it('encuentra más específicas y menos específicas', () => {
    const hints = getPriceRuleHierarchyHints(
      { restorationTypeId: R, urgencyId: U },
      rules,
    );
    expect(hints.lessSpecific.map((h) => h.code)).toContain('prc_003');
    expect(hints.moreSpecific.map((h) => h.code)).toContain('prc_002');
  });

  it('excluye la regla en edición', () => {
    const hints = getPriceRuleHierarchyHints(
      { restorationTypeId: R, urgencyId: U },
      rules,
      '1',
    );
    expect(hints.lessSpecific.map((h) => h.code)).not.toContain('prc_001');
  });
});

describe('cascadeFieldState', () => {
  it('bloquea urgencia sin restauración', () => {
    expect(cascadeFieldState({ restorationTypeId: '', urgencyId: '', materialId: '', shadeId: '' }).urgency.disabled).toBe(true);
  });

  it('bloquea material sin urgencia', () => {
    expect(
      cascadeFieldState({ restorationTypeId: R, urgencyId: '', materialId: '', shadeId: '' }).material.disabled,
    ).toBe(true);
  });

  it('habilita material con R y U', () => {
    expect(
      cascadeFieldState({ restorationTypeId: R, urgencyId: U, materialId: '', shadeId: '' }).material.disabled,
    ).toBe(false);
  });
});
