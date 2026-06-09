/**
 * Tipos y helpers puros del motor de ligas (Fase 2).
 *
 * Sin `'use server'` ni dependencias de DB: las constantes, tipos y funciones
 * sincrónicas viven aquí para poder exportarse libremente (un módulo de Server
 * Actions solo puede exportar funciones async). La lógica con DB vive en
 * `lib/db/actions/league.ts`.
 */

/** Orden ascendente de categorías. El motor mueve de a un nivel. */
export const LEAGUE_ORDER = ['bronce', 'plata', 'oro', 'elite'] as const;
export type League = (typeof LEAGUE_ORDER)[number];

/** Liga inmediatamente superior, o null si ya es la máxima. */
export function nextLeagueUp(league: string): League | null {
  const idx = LEAGUE_ORDER.indexOf(league.toLowerCase() as League);
  if (idx < 0 || idx >= LEAGUE_ORDER.length - 1) return null;
  return LEAGUE_ORDER[idx + 1];
}

/** Liga inmediatamente inferior, o null si ya es la mínima. */
export function nextLeagueDown(league: string): League | null {
  const idx = LEAGUE_ORDER.indexOf(league.toLowerCase() as League);
  if (idx <= 0) return null;
  return LEAGUE_ORDER[idx - 1];
}

export interface LeagueMetrics {
  /** Liga actual del técnico (normalizada en minúsculas). */
  league: League;
  /** Rating promedio (1–5) de las reviews de los casos en la ventana; null si no hay. */
  avgRating: number | null;
  /** Fracción de entregas a tiempo (0–1) en la ventana; null si no hay casos con plazo. */
  punctuality: number | null;
  /** Nº de casos completados en la liga actual considerados en la ventana. */
  casesInWindow: number;
  /** Total de casos completados en la liga actual (condición absoluta de ascenso). */
  completedTotal: number;
}

export type AscentResult =
  | { action: 'skipped' }
  | { action: 'ninguno' }
  | { action: 'ascenso'; from: League; to: League }
  | { action: 'consolidado'; league: League };

export type DescentResult =
  | { action: 'skipped' }
  | { action: 'ninguno' }
  | { action: 'watch_armado' }
  | { action: 'watch_limpiado' }
  | { action: 'descenso'; from: League; to: League };
