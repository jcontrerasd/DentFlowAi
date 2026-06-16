/**
 * Utilidades puras del modelo de disponibilidad / sanción (v5.0).
 * Módulo plano (no 'use server') para poder exportar funciones sincrónicas
 * reutilizables por el motor Fauchard y por tests. Ver flujo_tiempos.md §2.5.
 */

/** Marca interna del caso (clinical_case.internalStatus) mientras espera técnicos. */
export const POOL_INTERNAL_STATUS = 'pendiente_pool';

export type SanctionLevel = 0 | 1 | 2 | 3;

/**
 * Factor N del término de score `−αN·N` según el nivel de sanción.
 * Nivel 0/1 → 0.0 · Nivel 2 → 0.5 · Nivel 3 → 1.0.
 */
export function levelToScoreN(level: SanctionLevel): number {
  if (level >= 3) return 1.0;
  if (level === 2) return 0.5;
  return 0.0;
}

/**
 * @deprecated Solo referencia histórica del modelo de invitaciones. El motor activo
 * usa pesos de `fauchard_config` vía `parseAssignmentWeights` (Q/P/E/L/N en assignmentScore.ts).
 */
export const RENORMALIZED_ALPHAS = {
  quality: 0.25,
  punctuality: 0.20,
  experience: 0.20,
  load: 0.15,
  noResponse: 0.20,
} as const;
