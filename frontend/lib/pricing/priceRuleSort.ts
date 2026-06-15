import type { PriceRuleDisplay } from '@/lib/db/actions/priceRules';

export type PriceRuleSortField =
  | 'code'
  | 'restoration'
  | 'material'
  | 'shade'
  | 'urgency'
  | 'cost'
  | 'fee'
  | 'sale'
  | 'status';

export type PriceRuleSortDirection = 'asc' | 'desc';

export type PriceRuleSortState = {
  field: PriceRuleSortField;
  direction: PriceRuleSortDirection;
};

export const DEFAULT_PRICE_RULE_SORT: PriceRuleSortState = {
  field: 'code',
  direction: 'asc',
};

function dimSortValue(label: string | null): string {
  return label ?? '*';
}

function codeSortKey(code: string): number {
  const m = code.match(/^prc_(\d+)$/i);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
}

export function sortPriceRules(
  rules: PriceRuleDisplay[],
  sort: PriceRuleSortState,
): PriceRuleDisplay[] {
  const dir = sort.direction === 'asc' ? 1 : -1;
  const sorted = [...rules];

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (sort.field) {
      case 'code':
        cmp = compareValues(codeSortKey(a.code), codeSortKey(b.code));
        if (cmp === 0) cmp = compareValues(a.code, b.code);
        break;
      case 'restoration':
        cmp = compareValues(dimSortValue(a.restorationLabel), dimSortValue(b.restorationLabel));
        break;
      case 'material':
        cmp = compareValues(dimSortValue(a.materialLabel), dimSortValue(b.materialLabel));
        break;
      case 'shade':
        cmp = compareValues(dimSortValue(a.shadeLabel), dimSortValue(b.shadeLabel));
        break;
      case 'urgency':
        cmp = compareValues(dimSortValue(a.urgencyLabel), dimSortValue(b.urgencyLabel));
        break;
      case 'cost':
        cmp = compareValues(a.cost, b.cost);
        break;
      case 'fee':
        cmp = compareValues(a.feePercent, b.feePercent);
        break;
      case 'sale':
        cmp = compareValues(a.salePrice, b.salePrice);
        break;
      case 'status':
        cmp = compareValues(a.isActive ? 0 : 1, b.isActive ? 0 : 1);
        break;
      default:
        cmp = 0;
    }
    return cmp * dir;
  });

  return sorted;
}

export function togglePriceRuleSort(
  current: PriceRuleSortState,
  field: PriceRuleSortField,
): PriceRuleSortState {
  if (current.field === field) {
    return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { field, direction: 'asc' };
}
