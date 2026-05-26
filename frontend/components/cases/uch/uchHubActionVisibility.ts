import type { InvitationItem } from '@/lib/db/actions/invitations';
import { toDeadlineMs } from '@/lib/deadlineMs';

type CaseEventLike = { action: string };

export function timelineEventsInclude(events: CaseEventLike[], actions: string[]): boolean {
  return events.some((e) => actions.includes(e.action));
}

/** Entrada para decidir si el UCH muestra la fila de acciones del caso (cotización, comparativo, etc.). */
export type ComputeIncludeCaseActionTimelineInput = {
  actingAsDentista: boolean;
  actingAsTecnico: boolean;
  viewingAsAdmin?: boolean;
  caseStatus: string;
  clinicalCase: {
    assignedTechnicianId?: string | null;
    pendingActionRequest?: string | null;
    pendingActionActor?: string | null;
    workStartedAt?: string | Date | null;
  } | null | undefined;
  currentUserId?: string;
  myInvitation: InvitationItem | null | undefined;
  comparativeLength: number;
  techInvitationPanel: boolean;
  includeDelivery: boolean;
  timelineEvents: CaseEventLike[];
  /** Plazo de decisión comparativa (dentista); mantiene la fila de acciones aunque comparative venga vacío un instante. */
  proposalExpiresAt?: string | Date | null;
};

/** @deprecated Usar ComputeIncludeCaseActionTimelineInput */
export type ComputeIncludeFauchardTimelineInput = ComputeIncludeCaseActionTimelineInput;

/**
 * Fila de acciones en el hilo: solo mientras haya una acción pendiente del flujo.
 * Tras uso (p. ej. TRABAJO_INICIADO / entrega vía fila delivery), el resultado vive en eventos.
 */
export function computeIncludeCaseActionTimeline(p: ComputeIncludeCaseActionTimelineInput): boolean {
  if (p.viewingAsAdmin) return false;

  if (p.actingAsDentista) {
    if (
      p.caseStatus === 'propuestaLista' &&
      (p.comparativeLength > 0 || toDeadlineMs(p.proposalExpiresAt) != null)
    ) {
      return true;
    }
    if (p.clinicalCase?.pendingActionRequest && p.clinicalCase.pendingActionActor !== p.currentUserId) {
      return true;
    }
    if (p.caseStatus === 'enviado' || p.caseStatus === 'completado') return true;
    return false;
  }

  if (p.actingAsTecnico && p.techInvitationPanel) return true;

  const isAssignedWinner = !!(p.currentUserId && p.clinicalCase?.assignedTechnicianId === p.currentUserId);
  if (!p.actingAsTecnico || !isAssignedWinner) return false;

  if (p.caseStatus === 'aceptadaPendienteInicio' && p.myInvitation?.status === 'confirmed') {
    if (p.clinicalCase?.workStartedAt) return false;
    if (timelineEventsInclude(p.timelineEvents, ['TRABAJO_INICIADO'])) return false;
    return true;
  }

  if ((p.caseStatus === 'enEjecucion' || p.caseStatus === 'cambiosEnProceso') && p.includeDelivery) {
    return false;
  }

  if (p.caseStatus === 'enRevision') return false;

  if (p.caseStatus === 'disenoAprobado' || p.caseStatus === 'enFabricacion') return true;

  return false;
}
