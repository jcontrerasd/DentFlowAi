import {
  computeSalePrice,
  priceRuleSignature,
  resolveListPriceFromRules,
  type PriceDimensionIds,
  type PriceRuleRow,
} from '@/lib/pricing/resolveListPrice';

export type PriceCatalogItem = { id: string; label: string };

export type PriceCatalogs = {
  restorations: PriceCatalogItem[];
  materials: PriceCatalogItem[];
  shades: PriceCatalogItem[];
  urgencies: PriceCatalogItem[];
};

export type MissingBaseRule = {
  restorationTypeId: string;
  urgencyId: string;
  restorationLabel: string;
  urgencyLabel: string;
};

export type ProposedBaseRulePricing = {
  cost: number;
  feePercent: number;
  salePrice: number;
  source: 'inherit_normal' | 'inherit_sibling' | 'seed_default';
};

export type UnresolvedWizardCombination = {
  restorationTypeId: string;
  materialId: string;
  shadeId: string;
  urgencyId: string;
  restorationLabel: string;
  materialLabel: string;
  shadeLabel: string;
  urgencyLabel: string;
};

/** Regla base R·U·*·* (material y color comodín). */
export function isBaseRule(rule: Pick<PriceRuleRow, 'restorationTypeId' | 'urgencyId' | 'materialId' | 'shadeId'>): boolean {
  return (
    rule.restorationTypeId != null &&
    rule.urgencyId != null &&
    rule.materialId == null &&
    rule.shadeId == null
  );
}

export function baseRuleSignature(restorationTypeId: string, urgencyId: string): string {
  return priceRuleSignature({
    restorationTypeId,
    urgencyId,
    materialId: null,
    shadeId: null,
  });
}

const SEED_DEFAULT_COST = 5000;
const SEED_DEFAULT_FEE = 0.15;

function activeRules(rules: PriceRuleRow[]): PriceRuleRow[] {
  return rules.filter((r) => r.isActive);
}

function parseNum(v: string | number): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Pares restauración × urgencia sin regla activa R·U·*·*. */
export function findMissingBaseRules(
  catalogs: PriceCatalogs,
  rules: PriceRuleRow[],
): MissingBaseRule[] {
  const active = activeRules(rules);
  const covered = new Set(
    active
      .filter(isBaseRule)
      .map((r) => baseRuleSignature(r.restorationTypeId!, r.urgencyId!)),
  );

  const missing: MissingBaseRule[] = [];
  for (const rest of catalogs.restorations) {
    for (const urg of catalogs.urgencies) {
      const sig = baseRuleSignature(rest.id, urg.id);
      if (!covered.has(sig)) {
        missing.push({
          restorationTypeId: rest.id,
          urgencyId: urg.id,
          restorationLabel: rest.label,
          urgencyLabel: urg.label,
        });
      }
    }
  }
  return missing;
}

/** Propone costo/fee para una regla base nueva. */
export function proposeBaseRulePricing(
  missing: Pick<MissingBaseRule, 'restorationTypeId' | 'urgencyId'>,
  catalogs: PriceCatalogs,
  rules: PriceRuleRow[],
): ProposedBaseRulePricing {
  const active = activeRules(rules);
  const restId = missing.restorationTypeId;
  const normalUrg = catalogs.urgencies.find((u) => u.label === 'Normal');

  if (normalUrg) {
    const normalBase = active.find(
      (r) => isBaseRule(r) && r.restorationTypeId === restId && r.urgencyId === normalUrg.id,
    );
    if (normalBase) {
      const cost = parseNum(normalBase.cost);
      const feePercent = parseNum(normalBase.feePercent);
      return {
        cost,
        feePercent,
        salePrice: parseNum(normalBase.salePrice) || computeSalePrice(cost, feePercent),
        source: 'inherit_normal',
      };
    }
  }

  const siblingBase = active.find((r) => isBaseRule(r) && r.restorationTypeId === restId);
  if (siblingBase) {
    const cost = parseNum(siblingBase.cost);
    const feePercent = parseNum(siblingBase.feePercent);
    return {
      cost,
      feePercent,
      salePrice: parseNum(siblingBase.salePrice) || computeSalePrice(cost, feePercent),
      source: 'inherit_sibling',
    };
  }

  return {
    cost: SEED_DEFAULT_COST,
    feePercent: SEED_DEFAULT_FEE,
    salePrice: computeSalePrice(SEED_DEFAULT_COST, SEED_DEFAULT_FEE),
    source: 'seed_default',
  };
}

/** Combinaciones wizard R×U×M×S que no resuelven precio con las reglas actuales. */
export function findUnresolvedWizardCombinations(
  catalogs: PriceCatalogs,
  rules: PriceRuleRow[],
): UnresolvedWizardCombination[] {
  const active = activeRules(rules);
  const unresolved: UnresolvedWizardCombination[] = [];

  for (const rest of catalogs.restorations) {
    for (const urg of catalogs.urgencies) {
      for (const mat of catalogs.materials) {
        for (const shade of catalogs.shades) {
          const dims: PriceDimensionIds = {
            restorationTypeId: rest.id,
            materialId: mat.id,
            shadeId: shade.id,
            urgencyId: urg.id,
          };
          if (resolveListPriceFromRules(active, dims) == null) {
            unresolved.push({
              restorationTypeId: rest.id,
              materialId: mat.id,
              shadeId: shade.id,
              urgencyId: urg.id,
              restorationLabel: rest.label,
              materialLabel: mat.label,
              shadeLabel: shade.label,
              urgencyLabel: urg.label,
            });
          }
        }
      }
    }
  }
  return unresolved;
}

export const PRICE_RULE_SEED_DEFAULTS = {
  cost: SEED_DEFAULT_COST,
  feePercent: SEED_DEFAULT_FEE,
  salePrice: computeSalePrice(SEED_DEFAULT_COST, SEED_DEFAULT_FEE),
} as const;
