import { describe, expect, it } from 'vitest';
import { leagueMatches } from '@/lib/fauchard/leagueMatch';

describe('leagueMatches strict-first semantics', () => {
  it('strict mode requires exact league match', () => {
    expect(leagueMatches('oro', 'oro', 'strict')).toBe(true);
    expect(leagueMatches('plata', 'oro', 'strict')).toBe(false);
  });

  it('expand mode allows one level below case league', () => {
    expect(leagueMatches('plata', 'oro', 'expand')).toBe(true);
    expect(leagueMatches('bronce', 'oro', 'expand')).toBe(false);
  });
});
