import { describe, it, expect } from 'vitest';
import {
  findMissingBaseRules,
  findUnresolvedWizardCombinations,
  isBaseRule,
  proposeBaseRulePricing,
  type PriceCatalogs,
} from '@/lib/pricing/priceRuleCoverage';
import { resolveListPriceFromRules, type PriceRuleRow } from '@/lib/pricing/resolveListPrice';

const REST_CORONA = 'rest-corona';
const REST_INLAY = 'rest-inlay';
const MAT_MONO = 'mat-mono';
const MAT_PREMIUM = 'mat-premium';
const SHADE_A35 = 'shade-a35';
const URG_BAJA = 'urg-baja';
const URG_NORMAL = 'urg-normal';
const URG_ALTA = 'urg-alta';

const catalogs: PriceCatalogs = {
  restorations: [
    { id: REST_CORONA, label: 'Corona Unitaria' },
    { id: REST_INLAY, label: 'Inlay' },
  ],
  materials: [
    { id: MAT_MONO, label: 'Zirconio Monolítico' },
    { id: MAT_PREMIUM, label: 'Zirconio Multicapa (Premium)' },
  ],
  shades: [{ id: SHADE_A35, label: 'A3.5' }],
  urgencies: [
    { id: URG_BAJA, label: 'Baja' },
    { id: URG_NORMAL, label: 'Normal' },
    { id: URG_ALTA, label: 'Alta' },
  ],
};

function rule(partial: Partial<PriceRuleRow> & Pick<PriceRuleRow, 'id' | 'cost' | 'feePercent' | 'salePrice'>): PriceRuleRow {
  return {
    restorationTypeId: null,
    materialId: null,
    shadeId: null,
    urgencyId: null,
    sortOrder: 0,
    isActive: true,
    ...partial,
  };
}

describe('isBaseRule', () => {
  it('identifica R·U·*·*', () => {
    expect(
      isBaseRule({
        restorationTypeId: REST_CORONA,
        urgencyId: URG_ALTA,
        materialId: null,
        shadeId: null,
      }),
    ).toBe(true);
  });

  it('rechaza override R·U·M·*', () => {
    expect(
      isBaseRule({
        restorationTypeId: REST_CORONA,
        urgencyId: URG_ALTA,
        materialId: MAT_PREMIUM,
        shadeId: null,
      }),
    ).toBe(false);
  });
});

describe('findMissingBaseRules', () => {
  it('detecta hueco Corona·Alta con 26 reglas base de 2×3', () => {
    const rules: PriceRuleRow[] = [];
    for (const rest of catalogs.restorations) {
      for (const urg of catalogs.urgencies) {
        if (rest.id === REST_CORONA && urg.id === URG_ALTA) continue;
        rules.push(
          rule({
            id: `${rest.id}-${urg.id}`,
            restorationTypeId: rest.id,
            urgencyId: urg.id,
            cost: 10000,
            feePercent: 0.15,
            salePrice: 11500,
          }),
        );
      }
    }
    const missing = findMissingBaseRules(catalogs, rules);
    expect(missing).toHaveLength(1);
    expect(missing[0].restorationLabel).toBe('Corona Unitaria');
    expect(missing[0].urgencyLabel).toBe('Alta');
  });

  it('R·Alta·Premium·* no cubre el par base R·Alta', () => {
    const rules: PriceRuleRow[] = [
      rule({
        id: 'premium-alta',
        restorationTypeId: REST_CORONA,
        urgencyId: URG_ALTA,
        materialId: MAT_PREMIUM,
        cost: 88000,
        feePercent: 0.15,
        salePrice: 101200,
      }),
      rule({
        id: 'corona-normal',
        restorationTypeId: REST_CORONA,
        urgencyId: URG_NORMAL,
        cost: 10000,
        feePercent: 0.15,
        salePrice: 11500,
      }),
    ];
    const missing = findMissingBaseRules(catalogs, rules);
    expect(missing.some((m) => m.restorationTypeId === REST_CORONA && m.urgencyId === URG_ALTA)).toBe(true);
  });
});

describe('findUnresolvedWizardCombinations', () => {
  it('Monolítico+Alta resuelve con R·Alta·*·* aunque exista Premium override', () => {
    const rules: PriceRuleRow[] = [];
    for (const rest of catalogs.restorations) {
      for (const urg of catalogs.urgencies) {
        rules.push(
          rule({
            id: `base-${rest.id}-${urg.id}`,
            restorationTypeId: rest.id,
            urgencyId: urg.id,
            cost: 10000,
            feePercent: 0.15,
            salePrice: 11500,
          }),
        );
      }
    }
    rules.push(
      rule({
        id: 'premium-alta',
        restorationTypeId: REST_CORONA,
        urgencyId: URG_ALTA,
        materialId: MAT_PREMIUM,
        cost: 88000,
        feePercent: 0.15,
        salePrice: 101200,
      }),
    );
    const unresolved = findUnresolvedWizardCombinations(catalogs, rules);
    expect(unresolved).toHaveLength(0);

    const monoAlta = resolveListPriceFromRules(rules, {
      restorationTypeId: REST_CORONA,
      materialId: MAT_MONO,
      shadeId: SHADE_A35,
      urgencyId: URG_ALTA,
    });
    expect(monoAlta?.ruleId).toBe(`base-${REST_CORONA}-${URG_ALTA}`);
    expect(monoAlta?.salePrice).toBe(11500);

    const premiumAlta = resolveListPriceFromRules(rules, {
      restorationTypeId: REST_CORONA,
      materialId: MAT_PREMIUM,
      shadeId: SHADE_A35,
      urgencyId: URG_ALTA,
    });
    expect(premiumAlta?.ruleId).toBe('premium-alta');
    expect(premiumAlta?.salePrice).toBe(101200);
  });

  it('sin R·Alta·*·* deja Monolítico+Alta sin resolver', () => {
    const rules: PriceRuleRow[] = [
      rule({
        id: 'premium-alta',
        restorationTypeId: REST_CORONA,
        urgencyId: URG_ALTA,
        materialId: MAT_PREMIUM,
        cost: 88000,
        feePercent: 0.15,
        salePrice: 101200,
      }),
      rule({
        id: 'corona-normal',
        restorationTypeId: REST_CORONA,
        urgencyId: URG_NORMAL,
        cost: 10000,
        feePercent: 0.15,
        salePrice: 11500,
      }),
    ];
    const unresolved = findUnresolvedWizardCombinations(catalogs, rules);
    expect(unresolved.some(
      (u) =>
        u.materialLabel === 'Zirconio Monolítico' &&
        u.urgencyLabel === 'Alta' &&
        u.restorationLabel === 'Corona Unitaria',
    )).toBe(true);
  });
});

describe('proposeBaseRulePricing', () => {
  it('hereda de Normal de la misma restauración', () => {
    const rules: PriceRuleRow[] = [
      rule({
        id: 'corona-normal',
        restorationTypeId: REST_CORONA,
        urgencyId: URG_NORMAL,
        cost: 10000,
        feePercent: 0.15,
        salePrice: 11500,
      }),
    ];
    const proposed = proposeBaseRulePricing(
      { restorationTypeId: REST_CORONA, urgencyId: URG_ALTA },
      catalogs,
      rules,
    );
    expect(proposed.source).toBe('inherit_normal');
    expect(proposed.cost).toBe(10000);
    expect(proposed.salePrice).toBe(11500);
  });
});
