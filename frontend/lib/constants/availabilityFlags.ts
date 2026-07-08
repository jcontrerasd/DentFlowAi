/**
 * Feature flags del modelo de disponibilidad del técnico (v5.0).
 *
 * Gobiernan el rollout incremental del sistema descrito en
 * [Doc Servicio Orquestado/flujo_tiempos.md](../../../Doc Servicio Orquestado/flujo_tiempos.md)
 * y [Doc Servicio Orquestado/plan_flujo_tiempos.md](../../../Doc Servicio Orquestado/plan_flujo_tiempos.md).
 *
 * Patrón: cada helper lee `process.env.X === 'true'`. Default: `false` (apagado).
 *
 * Cambiar un flag requiere reiniciar el proceso (no es hot reload).
 */

function flag(name: string): boolean {
  return process.env[name] === 'true';
}

/** Muestra badge global en header y panel de disponibilidad al técnico. */
export function isAvailabilityUiTecnicoEnabled(): boolean {
  return flag('AVAILABILITY_UI_TECNICO_ENABLED');
}

/** Habilita panel admin Fauchard "Plazos y sanciones" + dashboard observabilidad. */
export function isAvailabilityAdminPanelEnabled(): boolean {
  return flag('AVAILABILITY_ADMIN_PANEL_ENABLED');
}

/** Habilita acción "Rechazar invitación" en UCH del técnico. */
export function isRejectionIndividualEnabled(): boolean {
  return flag('REJECTION_INDIVIDUAL_ENABLED');
}

/** Activa cola pendiente_pool cuando Fauchard encuentra 0 elegibles. */
export function isPoolPendienteEnabled(): boolean {
  return flag('POOL_PENDIENTE_ENABLED');
}

/**
 * Motor de ligas (Fase 2) — habilita el cómputo automático de ascenso, transición y
 * descenso de categoría del técnico (cron diario `process-league`) y la penalización de
 * score durante el período de transición. Con el flag off el `league_level` queda fijo y el
 * gating de selección por liga se comporta como hoy.
 * Ver [Doc/DentFlowAI_Diseño_Funcional_Liga.md](../../../Doc/DentFlowAI_Diseño_Funcional_Liga.md).
 */
export function isLeagueEngineEnabled(): boolean {
  return flag('LEAGUE_ENGINE_ENABLED');
}
