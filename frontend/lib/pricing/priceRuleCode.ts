/** Código opaco system-generated para reglas de precio (prc_001, prc_002, …). */

export const PRICE_RULE_CODE_PREFIX = 'prc';

const CODE_RE = /^prc_(\d+)$/;

export function nextPriceRuleCode(existingCodes: string[]): string {
  let maxN = 0;
  for (const c of existingCodes) {
    const m = c.match(CODE_RE);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return `${PRICE_RULE_CODE_PREFIX}_${String(maxN + 1).padStart(3, '0')}`;
}
