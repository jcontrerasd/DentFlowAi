import { describe, it, expect } from 'vitest';
import {
  sortPriceRules,
  togglePriceRuleSort,
  DEFAULT_PRICE_RULE_SORT,
} from '@/lib/pricing/priceRuleSort';
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

describe('sortPriceRules', () => {
  const rules = [
    rule({ id: '1', code: 'prc_003', cost: 30000, isActive: false }),
    rule({ id: '2', code: 'prc_001', cost: 10000, isActive: true }),
    rule({ id: '3', code: 'prc_002', cost: 20000, isActive: true }),
  ];

  it('ordena por código asc por defecto', () => {
    const sorted = sortPriceRules(rules, DEFAULT_PRICE_RULE_SORT);
    expect(sorted.map((r) => r.code)).toEqual(['prc_001', 'prc_002', 'prc_003']);
  });

  it('ordena por código desc', () => {
    const sorted = sortPriceRules(rules, { field: 'code', direction: 'desc' });
    expect(sorted.map((r) => r.code)).toEqual(['prc_003', 'prc_002', 'prc_001']);
  });

  it('ordena por costo asc', () => {
    const sorted = sortPriceRules(rules, { field: 'cost', direction: 'asc' });
    expect(sorted.map((r) => r.cost)).toEqual([10000, 20000, 30000]);
  });

  it('ordena por estado (activas primero en asc)', () => {
    const sorted = sortPriceRules(rules, { field: 'status', direction: 'asc' });
    expect(sorted[0].isActive).toBe(true);
    expect(sorted[sorted.length - 1].isActive).toBe(false);
  });
});

describe('togglePriceRuleSort', () => {
  it('cambia a asc al seleccionar columna nueva', () => {
    expect(togglePriceRuleSort(DEFAULT_PRICE_RULE_SORT, 'cost')).toEqual({
      field: 'cost',
      direction: 'asc',
    });
  });

  it('alterna dirección en la misma columna', () => {
    expect(togglePriceRuleSort(DEFAULT_PRICE_RULE_SORT, 'code')).toEqual({
      field: 'code',
      direction: 'desc',
    });
  });
});
