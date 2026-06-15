import { describe, expect, it } from 'vitest';
import {
  buildCreatedFieldEntries,
  diffPriceRuleFields,
  rowToAuditSnapshot,
  validateChangeReason,
} from '@/lib/pricing/priceRuleAudit';

const baseSnapshot = () =>
  rowToAuditSnapshot({
    restorationTypeId: 'rest-1',
    materialId: 'mat-1',
    shadeId: 'shade-1',
    urgencyId: 'urg-1',
    cost: '10000',
    feePercent: '0.15',
    salePrice: '11500',
    isActive: true,
    sortOrder: 0,
  });

describe('validateChangeReason', () => {
  it('rechaza vacío o solo espacios', () => {
    expect(validateChangeReason('')).toMatch(/motivo/i);
    expect(validateChangeReason('   ')).toMatch(/motivo/i);
    expect(validateChangeReason(null)).toMatch(/motivo/i);
  });

  it('acepta texto con contenido', () => {
    expect(validateChangeReason('Ajuste de tarifa Q2')).toBeNull();
  });
});

describe('diffPriceRuleFields', () => {
  it('no detecta cambios si los valores son iguales', () => {
    const snap = baseSnapshot();
    expect(diffPriceRuleFields(snap, { ...snap })).toEqual([]);
  });

  it('detecta cambio de costo sin duplicar sale_price derivado', () => {
    const before = baseSnapshot();
    const after = { ...before, cost: '12000', salePrice: '13800' };
    const diff = diffPriceRuleFields(before, after);
    expect(diff.map((d) => d.fieldKey)).toEqual(['cost']);
    expect(diff.find((d) => d.fieldKey === 'cost')).toEqual({
      fieldKey: 'cost',
      oldValue: '10000',
      newValue: '12000',
    });
  });

  it('detecta cambio de fee sin duplicar sale_price derivado', () => {
    const before = baseSnapshot();
    const after = { ...before, feePercent: '0.20', salePrice: '12000' };
    const diff = diffPriceRuleFields(before, after);
    expect(diff.map((d) => d.fieldKey)).toEqual(['fee_percent']);
  });

  it('detecta cambio de dimensión', () => {
    const before = baseSnapshot();
    const after = { ...before, materialId: 'mat-2' };
    const diff = diffPriceRuleFields(before, after);
    expect(diff).toEqual([
      { fieldKey: 'material_id', oldValue: 'mat-1', newValue: 'mat-2' },
    ]);
  });

  it('tolera diferencia numérica mínima en fee', () => {
    const before = baseSnapshot();
    const after = { ...before, feePercent: '0.1500' };
    expect(diffPriceRuleFields(before, after)).toEqual([]);
  });
});

describe('buildCreatedFieldEntries', () => {
  it('genera una entrada por campo auditable (sin sale_price derivado)', () => {
    const entries = buildCreatedFieldEntries(baseSnapshot());
    expect(entries.length).toBe(8);
    expect(entries.every((e) => e.oldValue === null)).toBe(true);
    expect(entries.find((e) => e.fieldKey === 'is_active')?.newValue).toBe('true');
    expect(entries.find((e) => e.fieldKey === 'sale_price')).toBeUndefined();
  });
});
