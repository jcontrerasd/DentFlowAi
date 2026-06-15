import type { PriceRuleDisplay } from '@/lib/db/actions/priceRules';

export type PriceRuleSearchQuery = {
  text?: string;
  restorationLabel?: string;
  materialLabel?: string;
  shadeLabel?: string;
  urgencyLabel?: string;
};

const WILDCARD_FILTER = '__wildcard__';

export { WILDCARD_FILTER };

function displayDim(label: string | null): string {
  return label ?? '*';
}

function matchesText(rule: PriceRuleDisplay, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  const fields = [
    rule.code,
    displayDim(rule.restorationLabel),
    displayDim(rule.materialLabel),
    displayDim(rule.shadeLabel),
    displayDim(rule.urgencyLabel),
  ];
  return fields.some((f) => f.toLowerCase().includes(q));
}

function matchesDimFilter(ruleLabel: string | null, filter: string | undefined): boolean {
  if (!filter || filter === '') return true;
  if (filter === WILDCARD_FILTER) return ruleLabel == null;
  return ruleLabel === filter;
}

export function filterPriceRules(
  rules: PriceRuleDisplay[],
  query: PriceRuleSearchQuery,
): PriceRuleDisplay[] {
  return rules.filter((rule) => {
    if (!matchesText(rule, query.text ?? '')) return false;
    if (!matchesDimFilter(rule.restorationLabel, query.restorationLabel)) return false;
    if (!matchesDimFilter(rule.materialLabel, query.materialLabel)) return false;
    if (!matchesDimFilter(rule.shadeLabel, query.shadeLabel)) return false;
    if (!matchesDimFilter(rule.urgencyLabel, query.urgencyLabel)) return false;
    return true;
  });
}
