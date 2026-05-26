import { describe, expect, it } from 'vitest';
import { caseNumberLabel, formatCaseIdAndPac } from '@/lib/cases/caseDisplay';

describe('caseDisplay', () => {
  it('formatCaseIdAndPac: DF antes de PAC', () => {
    const line = formatCaseIdAndPac('DF-1247', 'FICHA 8');
    expect(line).toBe('DF-1247 · PAC: FICHA 8');
    expect(line.indexOf('DF-1247')).toBeLessThan(line.indexOf('PAC:'));
  });

  it('formatCaseIdAndPac: sin DF solo PAC', () => {
    expect(formatCaseIdAndPac(null, 'FICHA 8')).toBe('PAC: FICHA 8');
    expect(formatCaseIdAndPac('', 'FICHA 8')).toBe('PAC: FICHA 8');
  });

  it('caseNumberLabel: trim y null', () => {
    expect(caseNumberLabel('  DF-1  ')).toBe('DF-1');
    expect(caseNumberLabel(null)).toBeNull();
  });
});
