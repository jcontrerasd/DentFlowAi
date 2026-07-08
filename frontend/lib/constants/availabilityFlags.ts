/**
 * Feature flags del modelo de disponibilidad del técnico (v5.0).
 *
 * Gobiernan el rollout incremental del sistema descrito en
 * [Doc Servicio Orquestado/flujo_tiempos.md](../../../Doc Servicio Orquestado/flujo_tiempos.md)
 * y [Doc Servicio Orquestado/plan_flujo_tiempos.md](../../../Doc Servicio Orquestado/plan_flujo_tiempos.md).
 *
 * v5.28: la fuente de verdad es la tabla `feature_flag` (editable en
 * /dashboard/admin/feature-flags, efecto en ≤30 s sin redeploy); `process.env`
 * queda como seed inicial y fallback. Ver `lib/featureFlags.ts`.
 */

import { getFlag } from '@/lib/featureFlags';

/** Muestra badge global en header y panel de disponibilidad al técnico. */
export function isAvailabilityUiTecnicoEnabled(): Promise<boolean> {
  return getFlag('AVAILABILITY_UI_TECNICO_ENABLED');
}

/** Habilita panel admin Fauchard "Plazos y sanciones" + dashboard observabilidad. */
export function isAvailabilityAdminPanelEnabled(): Promise<boolean> {
  return getFlag('AVAILABILITY_ADMIN_PANEL_ENABLED');
}

/** Habilita acción "Rechazar invitación" en UCH del técnico. */
export function isRejectionIndividualEnabled(): Promise<boolean> {
  return getFlag('REJECTION_INDIVIDUAL_ENABLED');
}

/** Activa cola pendiente_pool cuando Fauchard encuentra 0 elegibles. */
export function isPoolPendienteEnabled(): Promise<boolean> {
  return getFlag('POOL_PENDIENTE_ENABLED');
}

/**
 * Motor de ligas (Fase 2) — habilita el cómputo automático de ascenso, transición y
 * descenso de categoría del técnico (cron diario `process-league`) y la penalización de
 * score durante el período de transición. Con el flag off el `league_level` queda fijo y el
 * gating de selección por liga se comporta como hoy.
 * Ver [Doc/DentFlowAI_Diseño_Funcional_Liga.md](../../../Doc/DentFlowAI_Diseño_Funcional_Liga.md).
 */
export function isLeagueEngineEnabled(): Promise<boolean> {
  return getFlag('LEAGUE_ENGINE_ENABLED');
}
