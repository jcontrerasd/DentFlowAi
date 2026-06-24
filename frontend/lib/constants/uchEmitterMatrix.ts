/**
 * Matriz UCH: qué eventos nunca deben mostrarse como píldora sistema gris (sin cabecera).
 * Mantener alineado con producto: hitos visibles siempre con burbuja completa.
 * Ver también `UCH_AUDIT_MATRIX` y `PHASE_ACTIONS` en UnifiedCaseHub.
 *
 * Inventario emisor (acción × rol viewer): debe coincidir con `resolveUchThreadLane` en
 * `uchThreadLane.ts` y con `presentationAuthor` / payloads en `logCaseEvent` (cases, fauchard, proposal).
 */


/** Fila de referencia producto; no sustituye la lógica en runtime (ver `resolveUchThreadLane`). */
export type UchEmitterMatrixRow = {
  action: string;
  /** `*` = cualquier visibleTo o N/A */
  visibleTo?: 'dentista' | 'tecnico' | '*';
  viewer: 'dentista' | 'tecnico';
  lane: 'thread' | 'self';
  header: 'yo' | 'fauchard';
  /** Si false, puede aplicarse píldora neutra solo si está en `UCH_NEUTRAL_SYSTEM_PILL_ALLOWLIST`. */
  fullBubble: boolean;
  notes?: string;
};


/** Píldora compacta solo para ruido interno legacy (pestaña "Todos"). */
export const UCH_NEUTRAL_SYSTEM_PILL_ALLOWLIST = new Set<string>([
  'CASO_CLASIFICADO',
  'SELECCION_FALLIDA',
  'REINTENTO_SELECCION',
  'FAUCHARD_PRESENTACION_CERRADA',
  'COTIZACION_RECIBIDA',
  'PROPUESTA_GENERADA',
]);

/** `true` = fila tipo píldora gris pequeña (timestamp arriba, sin avatar). */
export function shouldUseUchNeutralSystemPill(params: {
  eventType: string;
  eventAction: string;
  isOutcomeNotice: boolean;
}): boolean {
  const { eventType, eventAction, isOutcomeNotice } = params;
  if (eventType !== 'sistema') return false;
  if (isOutcomeNotice) return false;
  return UCH_NEUTRAL_SYSTEM_PILL_ALLOWLIST.has(eventAction);
}
