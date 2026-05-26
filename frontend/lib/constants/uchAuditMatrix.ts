/**
 * Matriz de auditoría UCH: hito → acción persistida → visibilidad por rol.
 * Referencia de producto para tests y para ampliar PHASE_ACTIONS / copy en burbujas.
 * La fuente de verdad en runtime sigue siendo clinical_case_event + payload.visibleTo.
 */
import { CASE_EVENTS } from '@/lib/constants/caseEvents';

/** Fases de pestaña UCH (subset de acciones en UnifiedCaseHub PHASE_ACTIONS). */
export const UCH_AUDIT_PHASE_KEYS = ['propuesta', 'diseno', 'produccion'] as const;

export type UchAuditPhaseKey = (typeof UCH_AUDIT_PHASE_KEYS)[number];

export type UchAuditVisibleTo = 'dentista' | 'tecnico' | 'ambos' | 'sistema';

export type UchAuditMatrixRow = {
  /** Identificador estable para documentación */
  id: string;
  /** Valor clinical_case_event.action */
  action: string;
  /** Quién dispara típicamente la server action */
  actorRole: 'dentista' | 'tecnico' | 'sistema' | 'cualquiera';
  /** visibleTo recomendado en payload */
  visibleTo: UchAuditVisibleTo;
  /** Fase de pestaña donde debe aparecer (además de "todos") */
  phase: UchAuditPhaseKey | 'todos';
  /** Notas para copy en primera persona (el content real vive en logCaseEvent) */
  copyHint: string;
};

/**
 * Catálogo de hitos relevantes para bitácora por rol (no exhaustivo de legacy).
 * Mantener alineado con logCaseEvent en fauchard.ts, proposal.ts y cases.ts.
 */
export const UCH_AUDIT_MATRIX: readonly UchAuditMatrixRow[] = [
  { id: 'publicar', action: CASE_EVENTS.CASO_PUBLICADO, actorRole: 'dentista', visibleTo: 'dentista', phase: 'propuesta', copyHint: 'He publicado el caso…' },
  { id: 'invitacion_tecnico', action: CASE_EVENTS.INVITACION_RECIBIDA, actorRole: 'sistema', visibleTo: 'tecnico', phase: 'propuesta', copyHint: 'Invitación para cotizar' },
  { id: 'oferta_enviada', action: CASE_EVENTS.OFERTA_ENVIADA, actorRole: 'tecnico', visibleTo: 'tecnico', phase: 'propuesta', copyHint: 'He enviado la Oferta.' },
  { id: 'oferta_retirada', action: CASE_EVENTS.OFERTA_RETIRADA, actorRole: 'tecnico', visibleTo: 'tecnico', phase: 'propuesta', copyHint: 'He retirado mi oferta.' },
  { id: 'comparativo', action: CASE_EVENTS.OFERTAS_COMPARATIVAS_LISTAS, actorRole: 'sistema', visibleTo: 'dentista', phase: 'propuesta', copyHint: 'Comparativo listo' },
  { id: 'aceptar_oferta', action: CASE_EVENTS.OFERTA_ACEPTADA, actorRole: 'dentista', visibleTo: 'dentista', phase: 'propuesta', copyHint: 'He aceptado una oferta…' },
  { id: 'ganadora', action: CASE_EVENTS.OFERTA_GANADORA, actorRole: 'sistema', visibleTo: 'tecnico', phase: 'propuesta', copyHint: 'Oferta seleccionada' },
  { id: 'rechazo_oferta', action: CASE_EVENTS.OFERTA_RECHAZADA, actorRole: 'dentista', visibleTo: 'dentista', phase: 'propuesta', copyHint: 'Rechazaste una oferta…' },
  { id: 'trabajo_iniciado_t', action: CASE_EVENTS.TRABAJO_INICIADO, actorRole: 'tecnico', visibleTo: 'tecnico', phase: 'diseno', copyHint: 'He confirmado el inicio del trabajo.' },
  { id: 'trabajo_iniciado_d', action: CASE_EVENTS.TRABAJO_INICIADO, actorRole: 'sistema', visibleTo: 'dentista', phase: 'diseno', copyHint: 'Inicio confirmado por laboratorio' },
  { id: 'revision_enviada', action: CASE_EVENTS.REVISION_ENVIADA, actorRole: 'tecnico', visibleTo: 'ambos', phase: 'diseno', copyHint: 'Entrega para revisión' },
  { id: 'revision_solicitada', action: CASE_EVENTS.REVISION_SOLICITADA, actorRole: 'dentista', visibleTo: 'ambos', phase: 'diseno', copyHint: 'Solicitud de ajustes' },
  { id: 'trabajo_aprobado', action: CASE_EVENTS.TRABAJO_APROBADO, actorRole: 'dentista', visibleTo: 'ambos', phase: 'diseno', copyHint: 'Diseño aprobado' },
  { id: 'fabricacion', action: CASE_EVENTS.FABRICACION_INICIADA, actorRole: 'tecnico', visibleTo: 'ambos', phase: 'produccion', copyHint: 'Fabricación iniciada' },
  { id: 'despacho', action: CASE_EVENTS.CASO_DESPACHADO, actorRole: 'tecnico', visibleTo: 'ambos', phase: 'produccion', copyHint: 'Despacho registrado' },
  { id: 'recepcion_d', action: CASE_EVENTS.RECEPCION_CONFIRMADA, actorRole: 'dentista', visibleTo: 'dentista', phase: 'produccion', copyHint: 'He confirmado la recepción…' },
  { id: 'recepcion_t', action: CASE_EVENTS.RECEPCION_CONFIRMADA, actorRole: 'dentista', visibleTo: 'tecnico', phase: 'produccion', copyHint: 'Solicitante confirmó recepción' },
  { id: 'solicitud_flujo', action: CASE_EVENTS.SOLICITUD_CAMBIO_FLUJO, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'todos', copyHint: 'Solicitud pausa/cancelación' },
  { id: 'solicitud_flujo_rechazo', action: CASE_EVENTS.SOLICITUD_CAMBIO_FLUJO_RECHAZADA, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'todos', copyHint: 'Solicitud no aceptada' },
  { id: 'caso_pausado', action: CASE_EVENTS.CASO_PAUSADO, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'todos', copyHint: 'Caso pausado por acuerdo' },
  { id: 'caso_cancelado', action: CASE_EVENTS.CASO_CANCELADO, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'todos', copyHint: 'Caso cancelado por acuerdo' },
  { id: 'reanudado', action: CASE_EVENTS.REANUDADO, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'diseno', copyHint: 'Caso reanudado' },
] as const;

/** Acciones que deben listarse en pestaña Propuesta (además de legacy en UnifiedCaseHub). */
export const UCH_PHASE_PROPUESTA_ACTIONS: readonly string[] = Array.from(
  new Set(UCH_AUDIT_MATRIX.filter((r) => r.phase === 'propuesta').map((r) => r.action)),
);
