import { LEAGUE_ORDER } from '@/lib/fauchard/caseWorkType';

export type LeagueMatchMode = 'strict' | 'expand';

/** Alineado con buildEligiblePoolForScenario — expand solo si strict no produce pool. */
export function leagueMatches(
  techLeague: string | null | undefined,
  caseLeague: string,
  mode: LeagueMatchMode,
): boolean {
  const t = (techLeague ?? 'bronce').toLowerCase();
  const c = caseLeague.toLowerCase();
  if (mode === 'strict') return t === c;
  const idx = LEAGUE_ORDER.indexOf(c as (typeof LEAGUE_ORDER)[number]);
  const expanded = LEAGUE_ORDER.slice(Math.max(0, idx - 1));
  return expanded.includes(t as (typeof LEAGUE_ORDER)[number]);
}
