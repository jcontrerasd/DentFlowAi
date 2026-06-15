import { describe, it, expect } from 'vitest';
import { nextPriceRuleCode, PRICE_RULE_CODE_PREFIX } from '@/lib/pricing/priceRuleCode';

describe('nextPriceRuleCode', () => {
  it('genera prc_001 cuando no hay códigos', () => {
    expect(nextPriceRuleCode([])).toBe('prc_001');
  });

  it('incrementa desde el máximo existente', () => {
    expect(nextPriceRuleCode(['prc_001', 'prc_003', 'prc_002'])).toBe('prc_004');
  });

  it('ignora códigos con formato distinto', () => {
    expect(nextPriceRuleCode(['legacy', 'prc_005'])).toBe('prc_006');
  });

  it('usa prefijo prc', () => {
    expect(PRICE_RULE_CODE_PREFIX).toBe('prc');
  });
});
