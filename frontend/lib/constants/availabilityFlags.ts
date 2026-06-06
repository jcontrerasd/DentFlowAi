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

/** Master switch — habilita filtro AND triple en Fauchard, score con αN y cola pendiente_pool. */
export function isAvailabilityEnabled(): boolean {
  return flag('AVAILABILITY_MODEL_ENABLED');
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
