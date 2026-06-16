/**
 * Predicados puros por etapa del embudo (sin DB). Alineados a checkTechnicianPassesFilters.
 */

import { leagueMatches } from '@/lib/fauchard/leagueMatch';

export function passesLeague(techLeague: string | null | undefined, caseLeague: string): boolean {
  return leagueMatches(techLeague, caseLeague, 'strict')
    || leagueMatches(techLeague, caseLeague, 'expand');
}

/** Liga con el modo efectivo del pool (strict-first). Usar en embudo alineado a producción. */
export function passesLeagueForMode(
  techLeague: string | null | undefined,
  caseLeague: string,
  mode: 'strict' | 'expand',
): boolean {
  return leagueMatches(techLeague, caseLeague, mode);
}

export function passesNotAvailable(isAvailable: boolean | null | undefined): boolean {
  return isAvailable === true;
}

export function passesSuspended(suspendedUntil: Date | string | null | undefined, now: Date): boolean {
  if (!suspendedUntil) return true;
  return new Date(suspendedUntil) <= now;
}

export function passesInactive(
  lastLoginAt: Date | string | null | undefined,
  inactivityThreshold: Date,
): boolean {
  if (!lastLoginAt) return true;
  return new Date(lastLoginAt) >= inactivityThreshold;
}

export function passesExcludedManually(techId: string, exclude: Set<string>): boolean {
  return !exclude.has(techId);
}

export function passesCooldown(techId: string, cooldownTechIds: Set<string>): boolean {
  return !cooldownTechIds.has(techId);
}

export function passesSkill(
  techId: string,
  skillByUser: Map<string, number>,
  minSkill: number,
): boolean {
  const level = skillByUser.get(techId);
  return level != null && level >= minSkill;
}
