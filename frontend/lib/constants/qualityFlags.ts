/**
 * Feature flags del rol de Calidad (compuerta de certificación técnico → dentista).
 *
 * Patrón idéntico a `availabilityFlags.ts`: cada helper lee `process.env.X === 'true'`.
 * Default: `false` (apagado). Con el flag off, el flujo de entrega/revisión se comporta
 * exactamente como hoy (la entrega del técnico va directo al dentista, sin etapa de Calidad).
 *
 * Cambiar el flag requiere reiniciar el proceso (no es hot reload).
 */

function flag(name: string): boolean {
  return process.env[name] === 'true';
}

/**
 * Master switch — inserta la etapa de Calidad entre el técnico y el dentista:
 * `submitReviewAction` enruta a `enRevisionCalidad`, Calidad certifica/pide ajustes, y
 * solo tras `sendToDentistAction` (acción explícita del técnico) la entrega llega al dentista.
 * Con el flag off, todo el comportamiento es el legacy (entrega directa al dentista).
 */
export function isQualityGateEnabled(): boolean {
  return flag('QUALITY_GATE_ENABLED');
}
