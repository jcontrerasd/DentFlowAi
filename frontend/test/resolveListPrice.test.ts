import { describe, it, expect } from 'vitest';
import {
  resolveListPriceFromRules,
  computeSalePrice,
  priceRuleSignature,
  type PriceRuleRow,
} from '@/lib/pricing/resolveListPrice';

const DIMS = {
  restorationTypeId: 'rest-1',
  materialId: 'mat-1',
  shadeId: 'shade-1',
  urgencyId: 'urg-1',
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

describe('resolveListPriceFromRules', () => {
  it('elige la regla más específica (regresivo)', () => {
    const rules: PriceRuleRow[] = [
      rule({ id: 'broad', cost: 10000, feePercent: 0.1, salePrice: 11000 }),
      rule({
        id: 'specific',
        restorationTypeId: 'rest-1',
        materialId: 'mat-1',
        cost: 20000,
        feePercent: 0.15,
        salePrice: 23000,
      }),
    ];
    const result = resolveListPriceFromRules(rules, DIMS);
    expect(result?.ruleId).toBe('specific');
    expect(result?.salePrice).toBe(23000);
  });

  it('cae a regla con wildcards cuando no hay match exacto', () => {
    const rules: PriceRuleRow[] = [
      rule({ id: 'wildcard-mat', materialId: 'mat-1', cost: 15000, feePercent: 0.1, salePrice: 16500 }),
      rule({ id: 'wildcard-all', cost: 5000, feePercent: 0.1, salePrice: 5500 }),
    ];
    const result = resolveListPriceFromRules(rules, DIMS);
    expect(result?.ruleId).toBe('wildcard-mat');
  });

  it('desempata por sort_order con igual especificidad', () => {
    const rules: PriceRuleRow[] = [
      rule({ id: 'second', materialId: 'mat-1', sortOrder: 10, cost: 10000, feePercent: 0.1, salePrice: 11000 }),
      rule({ id: 'first', materialId: 'mat-1', sortOrder: 1, cost: 12000, feePercent: 0.1, salePrice: 13200 }),
    ];
    const result = resolveListPriceFromRules(rules, DIMS);
    expect(result?.ruleId).toBe('first');
  });

  it('retorna null si ninguna regla coincide', () => {
    const rules: PriceRuleRow[] = [
      rule({ id: 'other', materialId: 'mat-other', cost: 10000, feePercent: 0.1, salePrice: 11000 }),
    ];
    expect(resolveListPriceFromRules(rules, DIMS)).toBeNull();
  });

  it('ignora reglas inactivas', () => {
    const rules: PriceRuleRow[] = [
      rule({ id: 'inactive', materialId: 'mat-1', isActive: false, cost: 10000, feePercent: 0.1, salePrice: 11000 }),
    ];
    expect(resolveListPriceFromRules(rules, DIMS)).toBeNull();
  });
});

describe('computeSalePrice', () => {
  it('calcula venta = costo × (1 + fee)', () => {
    expect(computeSalePrice(100000, 0.15)).toBe(115000);
  });
});

describe('priceRuleSignature', () => {
  it('normaliza NULL a sentinel para comparar firmas', () => {
    const a = priceRuleSignature({ restorationTypeId: null, materialId: 'mat-1' });
    const b = priceRuleSignature({ materialId: 'mat-1' });
    expect(a).toBe(b);
  });
});

describe('validateDesiredDeliveryAt', () => {
  it('rechaza fechas pasadas', async () => {
    const { validateDesiredDeliveryAt } = await import('@/lib/pricing/resolveListPrice');
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(validateDesiredDeliveryAt(past)).toBeNull();
  });

  it('acepta fechas futuras', async () => {
    const { validateDesiredDeliveryAt } = await import('@/lib/pricing/resolveListPrice');
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const result = validateDesiredDeliveryAt(future);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(Date.now());
  });
});
