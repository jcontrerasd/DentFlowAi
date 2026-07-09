/**
 * Feature flags del rol de Calidad (compuerta de certificación técnico → dentista).
 *
 * v5.28: la fuente de verdad es la tabla `feature_flag` (editable en
 * /dashboard/admin/feature-flags, efecto en ≤30 s sin redeploy); `process.env`
 * queda como seed inicial y fallback. Ver `lib/featureFlags.ts`.
 */

import { getFlag } from '@/lib/featureFlags';

/**
 * Master switch — inserta la etapa de Calidad entre el técnico y el dentista:
 * `submitReviewAction` enruta a `enRevisionCalidad`, Calidad certifica/pide ajustes, y
 * solo tras `sendToDentistAction` (acción explícita del técnico) la entrega llega al dentista.
 * Con el flag off, todo el comportamiento es el legacy (entrega directa al dentista).
 */
export function isQualityGateEnabled(): Promise<boolean> {
  return getFlag('QUALITY_GATE_ENABLED');
}
