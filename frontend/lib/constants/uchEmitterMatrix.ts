/**
 * Matriz UCH: qué eventos nunca deben mostrarse como píldora sistema gris (sin cabecera).
 * Mantener alineado con producto: hitos visibles siempre con burbuja completa.
 * Ver también `UCH_AUDIT_MATRIX` y `PHASE_ACTIONS` en UnifiedCaseHub.
 *
 * Inventario emisor (acción × rol viewer): debe coincidir con `resolveUchThreadLane` en
 * `uchThreadLane.ts` y con `presentationAuthor` / payloads en `logCaseEvent` (cases, fauchard, proposal).
 */

import { CASE_EVENTS } from '@/lib/constants/caseEvents';

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

/** Subconjunto representativo; ampliar cuando cambie producto. */
export const UCH_EMITTER_MATRIX: readonly UchEmitterMatrixRow[] = [
  {
    action: CASE_EVENTS.CASO_CREADO,
    viewer: 'dentista',
    lane: 'self',
    header: 'yo',
    fullBubble: true,
    notes: 'Borrador; sin presentationAuthor en payload',
  },
  {
    action: CASE_EVENTS.CASO_PUBLICADO,
    visibleTo: 'dentista',
    viewer: 'dentista',
    lane: 'thread',
    header: 'fauchard',
    fullBubble: true,
    notes: 'Orquestación publicar+búsqueda; payload presentationAuthor fauchard',
  },
  {
    action: CASE_EVENTS.INVITACION_RECIBIDA,
    visibleTo: 'tecnico',
    viewer: 'tecnico',
    lane: 'thread',
    header: 'fauchard',
    fullBubble: true,
    notes: 'Invitación; userId técnico + presentationAuthor fauchard',
  },
  {
    action: CASE_EVENTS.OFERTA_ENVIADA,
    viewer: 'tecnico',
    lane: 'self',
    header: 'yo',
    fullBubble: true,
    notes: 'Cotización enviada por el técnico viewer',
  },
  {
    action: CASE_EVENTS.OFERTA_RETIRADA,
    viewer: 'tecnico',
    lane: 'self',
    header: 'yo',
    fullBubble: true,
    notes: 'Retiro voluntario de cotización antes de aceptación',
  },
  {
    action: CASE_EVENTS.OFERTA_RECHAZADA,
    visibleTo: 'tecnico',
    viewer: 'tecnico',
    lane: 'thread',
    header: 'fauchard',
    fullBubble: true,
    notes: 'Cierre comparativa hacia técnico',
  },
  {
    action: CASE_EVENTS.OFERTA_NO_SELECCIONADA,
    visibleTo: 'tecnico',
    viewer: 'tecnico',
    lane: 'thread',
    header: 'fauchard',
    fullBubble: true,
    notes: 'Perdedor; payload presentationAuthor fauchard',
  },
  {
    action: CASE_EVENTS.TRABAJO_INICIADO,
    visibleTo: 'dentista',
    viewer: 'dentista',
    lane: 'thread',
    header: 'fauchard',
    fullBubble: true,
    notes: 'Inicio hacia solicitante; presentationAuthor fauchard',
  },
];

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
