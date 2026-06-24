/**
 * Matriz de auditoría UCH: hito → acción persistida → visibilidad por rol.
 * Referencia de producto para tests y para ampliar PHASE_ACTIONS / copy en burbujas.
 * La fuente de verdad en runtime sigue siendo clinical_case_event + payload.visibleTo.
 */
import { CASE_EVENTS } from '@/lib/constants/caseEvents';

/** Fases de pestaña UCH (subset de acciones en UnifiedCaseHub PHASE_ACTIONS). */
export const UCH_AUDIT_PHASE_KEYS = ['diseno'] as const;

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
  { id: 'publicar', action: CASE_EVENTS.CASO_PUBLICADO, actorRole: 'dentista', visibleTo: 'dentista', phase: 'diseno', copyHint: 'He publicado el caso…' },
  { id: 'trabajo_iniciado_t', action: CASE_EVENTS.TRABAJO_INICIADO, actorRole: 'tecnico', visibleTo: 'tecnico', phase: 'diseno', copyHint: 'He confirmado el inicio del trabajo.' },
  { id: 'trabajo_iniciado_d', action: CASE_EVENTS.TRABAJO_INICIADO, actorRole: 'sistema', visibleTo: 'dentista', phase: 'diseno', copyHint: 'Inicio confirmado por laboratorio' },
  { id: 'revision_enviada', action: CASE_EVENTS.REVISION_ENVIADA, actorRole: 'tecnico', visibleTo: 'ambos', phase: 'diseno', copyHint: 'Entrega para revisión' },
  { id: 'revision_solicitada', action: CASE_EVENTS.REVISION_SOLICITADA, actorRole: 'dentista', visibleTo: 'ambos', phase: 'diseno', copyHint: 'Solicitud de ajustes' },
  { id: 'trabajo_aprobado', action: CASE_EVENTS.TRABAJO_APROBADO, actorRole: 'dentista', visibleTo: 'ambos', phase: 'diseno', copyHint: 'Diseño aprobado' },
  { id: 'solicitud_flujo', action: CASE_EVENTS.SOLICITUD_CAMBIO_FLUJO, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'todos', copyHint: 'Solicitud pausa/cancelación' },
  { id: 'solicitud_flujo_rechazo', action: CASE_EVENTS.SOLICITUD_CAMBIO_FLUJO_RECHAZADA, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'todos', copyHint: 'Solicitud no aceptada' },
  { id: 'caso_pausado', action: CASE_EVENTS.CASO_PAUSADO, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'todos', copyHint: 'Caso pausado por acuerdo' },
  { id: 'caso_cancelado', action: CASE_EVENTS.CASO_CANCELADO, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'todos', copyHint: 'Caso cancelado por acuerdo' },
  { id: 'reanudado', action: CASE_EVENTS.REANUDADO, actorRole: 'cualquiera', visibleTo: 'ambos', phase: 'diseno', copyHint: 'Caso reanudado' },
] as const;

