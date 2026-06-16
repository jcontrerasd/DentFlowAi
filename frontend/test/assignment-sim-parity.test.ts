import { describe, expect, it } from 'vitest';
import { leagueMatches } from '@/lib/fauchard/leagueMatch';

/**
 * Contrato: el pool de ranking usa strict-first; evaluateTechniciansForScenario
 * debe exponer exactamente ese pool como eligible (verificado en assignment.ts).
 */
describe('assignment sim parity contract', () => {
  it('expand-only tech fails strict when case is oro', () => {
    expect(leagueMatches('plata', 'oro', 'strict')).toBe(false);
    expect(leagueMatches('plata', 'oro', 'expand')).toBe(true);
  });

  it('when strict pool is non-empty, expand-only techs must not pass strict filter', () => {
    const caseLeague = 'oro';
    const strictTech = 'oro';
    const expandOnlyTech = 'plata';
    expect(leagueMatches(strictTech, caseLeague, 'strict')).toBe(true);
    expect(leagueMatches(expandOnlyTech, caseLeague, 'strict')).toBe(false);
  });
});
