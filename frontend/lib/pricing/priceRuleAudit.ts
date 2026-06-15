export type PriceRuleAuditSnapshot = {
  restorationTypeId: string | null;
  materialId: string | null;
  shadeId: string | null;
  urgencyId: string | null;
  cost: string | number;
  feePercent: string | number;
  salePrice: string | number;
  isActive: boolean;
  sortOrder: number;
};

export type PriceRuleChangeEntry = {
  fieldKey: string;
  oldValue: string | null;
  newValue: string | null;
};

export type PriceRuleAuditAction =
  | 'created'
  | 'updated'
  | 'activated'
  | 'deactivated'
  | 'resolved_from_pending'
  | 'deleted';

const FIELD_SPECS: { key: string; pick: (s: PriceRuleAuditSnapshot) => unknown }[] = [
  { key: 'restoration_type_id', pick: (s) => s.restorationTypeId },
  { key: 'material_id', pick: (s) => s.materialId },
  { key: 'shade_id', pick: (s) => s.shadeId },
  { key: 'urgency_id', pick: (s) => s.urgencyId },
  { key: 'cost', pick: (s) => s.cost },
  { key: 'fee_percent', pick: (s) => s.feePercent },
  { key: 'is_active', pick: (s) => s.isActive },
  { key: 'sort_order', pick: (s) => s.sortOrder },
];
// sale_price se omite: siempre derivado de cost + fee_percent (evita duplicar filas en historial).

export function validateChangeReason(reason: string | undefined | null): string | null {
  if (!reason?.trim()) return 'Debes indicar el motivo del cambio';
  return null;
}

function serializeValue(fieldKey: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (fieldKey === 'is_active') return value ? 'true' : 'false';
  return String(value);
}

function valuesEqual(fieldKey: string, a: unknown, b: unknown): boolean {
  if (fieldKey === 'cost' || fieldKey === 'fee_percent' || fieldKey === 'sale_price') {
    const na = parseFloat(String(a));
    const nb = parseFloat(String(b));
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return String(a) === String(b);
    return Math.abs(na - nb) < 0.0001;
  }
  if (fieldKey === 'is_active') return Boolean(a) === Boolean(b);
  if (fieldKey === 'sort_order') return Number(a) === Number(b);
  return String(a ?? '') === String(b ?? '');
}

export function rowToAuditSnapshot(row: {
  restorationTypeId?: string | null;
  materialId?: string | null;
  shadeId?: string | null;
  urgencyId?: string | null;
  cost: string | number;
  feePercent: string | number;
  salePrice: string | number;
  isActive: boolean;
  sortOrder?: number;
}): PriceRuleAuditSnapshot {
  return {
    restorationTypeId: row.restorationTypeId ?? null,
    materialId: row.materialId ?? null,
    shadeId: row.shadeId ?? null,
    urgencyId: row.urgencyId ?? null,
    cost: row.cost,
    feePercent: row.feePercent,
    salePrice: row.salePrice,
    isActive: row.isActive,
    sortOrder: row.sortOrder ?? 0,
  };
}

export function diffPriceRuleFields(
  before: PriceRuleAuditSnapshot,
  after: PriceRuleAuditSnapshot,
): PriceRuleChangeEntry[] {
  const entries: PriceRuleChangeEntry[] = [];
  for (const spec of FIELD_SPECS) {
    const oldRaw = spec.pick(before);
    const newRaw = spec.pick(after);
    if (!valuesEqual(spec.key, oldRaw, newRaw)) {
      entries.push({
        fieldKey: spec.key,
        oldValue: serializeValue(spec.key, oldRaw),
        newValue: serializeValue(spec.key, newRaw),
      });
    }
  }
  return entries;
}

export function buildCreatedFieldEntries(snapshot: PriceRuleAuditSnapshot): PriceRuleChangeEntry[] {
  return FIELD_SPECS.map((spec) => ({
    fieldKey: spec.key,
    oldValue: null,
    newValue: serializeValue(spec.key, spec.pick(snapshot)),
  }));
}

export const PRICE_RULE_FIELD_LABELS: Record<string, string> = {
  cost: 'Costo',
  fee_percent: 'Fee',
  sale_price: 'Precio venta',
  restoration_type_id: 'Restauración',
  material_id: 'Material',
  shade_id: 'Color',
  urgency_id: 'Urgencia',
  is_active: 'Estado',
  sort_order: 'Orden',
};

export const PRICE_RULE_ACTION_LABELS: Record<PriceRuleAuditAction, string> = {
  created: 'Creada',
  updated: 'Actualizada',
  activated: 'Desbloqueada',
  deactivated: 'Bloqueada',
  resolved_from_pending: 'Creada desde cola',
  deleted: 'Eliminada',
};
