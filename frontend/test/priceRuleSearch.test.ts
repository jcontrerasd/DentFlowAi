import { describe, it, expect } from 'vitest';
import { filterPriceRules, WILDCARD_FILTER } from '@/lib/pricing/priceRuleSearch';
import type { PriceRuleDisplay } from '@/lib/db/actions/priceRules';

function rule(partial: Partial<PriceRuleDisplay> & { code: string }): PriceRuleDisplay {
  return {
    id: 'id-1',
    restorationTypeId: null,
    materialId: null,
    shadeId: null,
    urgencyId: null,
    restorationLabel: null,
    materialLabel: null,
    shadeLabel: null,
    urgencyLabel: null,
    cost: 10000,
    feePercent: 0.15,
    salePrice: 11500,
    sortOrder: 0,
    isActive: true,
    linkedCaseCount: 0,
    ...partial,
  };
}

describe('filterPriceRules', () => {
  const rules = [
    rule({ id: '1', code: 'prc_001', restorationLabel: 'Corona Unitaria', materialLabel: null, urgencyLabel: 'Normal' }),
    rule({ id: '2', code: 'prc_002', restorationLabel: 'Inlay', materialLabel: 'Zirconio', shadeLabel: 'A1', urgencyLabel: 'Alta' }),
  ];

  it('filtra por código', () => {
    expect(filterPriceRules(rules, { text: 'prc_002' })).toHaveLength(1);
    expect(filterPriceRules(rules, { text: 'prc_002' })[0].code).toBe('prc_002');
  });

  it('filtra por label de restauración en texto libre', () => {
    expect(filterPriceRules(rules, { text: 'corona' })).toHaveLength(1);
  });

  it('filtra comodín material con WILDCARD_FILTER', () => {
    expect(filterPriceRules(rules, { materialLabel: WILDCARD_FILTER })).toHaveLength(1);
    expect(filterPriceRules(rules, { materialLabel: WILDCARD_FILTER })[0].code).toBe('prc_001');
  });

  it('combina texto y dimensión con AND', () => {
    const res = filterPriceRules(rules, { text: 'prc', urgencyLabel: 'Normal' });
    expect(res).toHaveLength(1);
    expect(res[0].code).toBe('prc_001');
  });
});
