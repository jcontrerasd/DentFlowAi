/**
 * Motor de resolución de precio de lista (lookup regresivo por especificidad).
 * NULL en una dimensión de la regla = comodín (cualquier valor).
 */

export type PriceDimensionIds = {
  restorationTypeId: string;
  materialId: string;
  shadeId: string;
  urgencyId: string;
};

export type PriceRuleRow = {
  id: string;
  code?: string | null;
  restorationTypeId: string | null;
  materialId: string | null;
  shadeId: string | null;
  urgencyId: string | null;
  cost: string | number;
  feePercent: string | number;
  salePrice: string | number;
  sortOrder: number;
  isActive: boolean;
};

export type ResolvedListPrice = {
  ruleId: string;
  ruleCode?: string;
  cost: number;
  feePercent: number;
  salePrice: number;
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Firma estable para anti-solapamiento (NULL → sentinel). */
export function priceRuleSignature(rule: {
  restorationTypeId?: string | null;
  materialId?: string | null;
  shadeId?: string | null;
  urgencyId?: string | null;
}): string {
  return [
    rule.restorationTypeId ?? NIL_UUID,
    rule.materialId ?? NIL_UUID,
    rule.shadeId ?? NIL_UUID,
    rule.urgencyId ?? NIL_UUID,
  ].join('|');
}

export function computeSalePrice(cost: number, feePercent: number): number {
  return Math.round(cost * (1 + feePercent) * 100) / 100;
}

function parseNum(v: string | number): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function ruleSpecificity(rule: PriceRuleRow): number {
  let n = 0;
  if (rule.restorationTypeId) n++;
  if (rule.materialId) n++;
  if (rule.shadeId) n++;
  if (rule.urgencyId) n++;
  return n;
}

function ruleMatches(rule: PriceRuleRow, dims: PriceDimensionIds): boolean {
  if (!rule.isActive) return false;
  if (rule.restorationTypeId && rule.restorationTypeId !== dims.restorationTypeId) return false;
  if (rule.materialId && rule.materialId !== dims.materialId) return false;
  if (rule.shadeId && rule.shadeId !== dims.shadeId) return false;
  if (rule.urgencyId && rule.urgencyId !== dims.urgencyId) return false;
  return true;
}

/**
 * Selecciona la regla más específica que coincida con las dimensiones del caso.
 */
export function resolveListPriceFromRules(
  rules: PriceRuleRow[],
  dims: PriceDimensionIds,
): ResolvedListPrice | null {
  const matching = rules.filter((r) => ruleMatches(r, dims));
  if (matching.length === 0) return null;

  matching.sort((a, b) => {
    const specDiff = ruleSpecificity(b) - ruleSpecificity(a);
    if (specDiff !== 0) return specDiff;
    return a.sortOrder - b.sortOrder;
  });

  const best = matching[0];
  const cost = parseNum(best.cost);
  const feePercent = parseNum(best.feePercent);
  const salePrice = parseNum(best.salePrice) || computeSalePrice(cost, feePercent);

  return {
    ruleId: best.id,
    ruleCode: best.code ?? undefined,
    cost,
    feePercent,
    salePrice,
  };
}

/** Valida fecha/hora de entrega deseada (obligatoria y futura). */
export function validateDesiredDeliveryAt(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() <= Date.now()) return null;
  return d;
}
