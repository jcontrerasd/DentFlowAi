import type { LucideIcon } from 'lucide-react';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { STATUS_MAP } from '@/components/ui/StatusBadge';
import { getTechKpiFichaPresentation, TECH_FICHA_STRIPE } from '@/lib/cases/caseFichaStatusPresentation';
import {
  classifyTechnicianCaseKpi,
  isTechnicianWinner,
  PRE_AWARD_CASE_STATUSES,
  type InvitationStatusForKpi,
  type TechKpiId,
} from '@/lib/dashboard/classifyCaseForDashboardKpi';

export type CaseViewerStatusInput = {
  caseStatus: string;
  assignedTechnicianId: string | null;
  technicianUserId: string;
  invitationStatus: InvitationStatusForKpi;
};

export type CaseViewerStatusStripeModel = {
  kpiId: TechKpiId;
  label: string;
  icon: LucideIcon;
  /** Si true, renderizar con estilos de `STATUS_MAP[statusColorKey]`. */
  useStatusBadgeStyles: boolean;
  statusColorKey: string;
  pillClassName: string;
  highlightEval: boolean;
  showInviteCountdown: boolean;
  showSolicitudVigencia: boolean;
  invitedAt?: string | Date | null;
};

function toKpiInput(input: CaseViewerStatusInput) {
  return {
    caseStatus: input.caseStatus,
    assignedTechnicianId: input.assignedTechnicianId,
    technicianUserId: input.technicianUserId,
    invitationStatus: input.invitationStatus,
  };
}

function evalHighlight(input: CaseViewerStatusInput, invStatus: string): boolean {
  const { caseStatus } = input;
  return (
    caseStatus === CASE_STATUSES.EN_EVALUACION ||
    invStatus === 'pending' ||
    (invStatus === 'quoted' && caseStatus === CASE_STATUSES.EN_EVALUACION) ||
    ((caseStatus === CASE_STATUSES.EN_EVALUACION ||
      caseStatus === CASE_STATUSES.PROPUESTA_LISTA) &&
      (invStatus === 'accepted' || invStatus === 'confirmed'))
  );
}

function inviteCountdownVisible(input: CaseViewerStatusInput, invStatus: string): boolean {
  const { caseStatus } = input;
  return (
    invStatus === 'pending' ||
    (invStatus === 'quoted' && caseStatus === CASE_STATUSES.EN_EVALUACION) ||
    ((caseStatus === CASE_STATUSES.EN_EVALUACION ||
      caseStatus === CASE_STATUSES.PROPUESTA_LISTA) &&
      (invStatus === 'accepted' || invStatus === 'confirmed'))
  );
}

/** Presentación de franja/badge para técnico (listado, detalle, Kanban). */
export function resolveTechnicianViewerStripe(
  input: CaseViewerStatusInput,
): CaseViewerStatusStripeModel {
  const kpiId = classifyTechnicianCaseKpi(toKpiInput(input));
  const invStatus = input.invitationStatus ?? '';
  const caseStatus = input.caseStatus;
  const base = getTechKpiFichaPresentation(kpiId);
  const highlightEval = evalHighlight(input, invStatus);
  const showInviteCountdown = inviteCountdownVisible(input, invStatus);

  if (kpiId === 'invitacionPendiente' && invStatus === 'pending') {
    return {
      kpiId,
      label: TECH_FICHA_STRIPE.solicitudOferta.label,
      icon: TECH_FICHA_STRIPE.solicitudOferta.icon,
      useStatusBadgeStyles: false,
      statusColorKey: base.statusColorKey,
      pillClassName: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
      highlightEval,
      showInviteCountdown,
      showSolicitudVigencia: true,
      invitedAt: null,
    };
  }

  if (kpiId === 'cotizacionEnviada' && invStatus === 'quoted' && caseStatus === CASE_STATUSES.EN_EVALUACION) {
    const st = STATUS_MAP.enEvaluacion;
    return {
      kpiId,
      label: TECH_FICHA_STRIPE.cotizacionEnEvaluacion.label,
      icon: TECH_FICHA_STRIPE.cotizacionEnEvaluacion.icon,
      useStatusBadgeStyles: true,
      statusColorKey: 'enEvaluacion',
      pillClassName: st.className,
      highlightEval,
      showInviteCountdown,
      showSolicitudVigencia: false,
    };
  }

  if (kpiId === 'ofertaNoSeleccionada') {
    const st = STATUS_MAP.rechazado;
    return {
      kpiId,
      label: TECH_FICHA_STRIPE.ofertaNoSeleccionada.label,
      icon: TECH_FICHA_STRIPE.ofertaNoSeleccionada.icon,
      useStatusBadgeStyles: true,
      statusColorKey: 'rechazado',
      pillClassName: st.className,
      highlightEval: false,
      showInviteCountdown: false,
      showSolicitudVigencia: false,
    };
  }

  if (kpiId === 'cotizacionEnviada') {
    const st = STATUS_MAP.enEvaluacion;
    return {
      kpiId,
      label: TECH_FICHA_STRIPE.cotizacionEnviada.label,
      icon: TECH_FICHA_STRIPE.cotizacionEnviada.icon,
      useStatusBadgeStyles: true,
      statusColorKey: 'enEvaluacion',
      pillClassName: st.className,
      highlightEval: false,
      showInviteCountdown: false,
      showSolicitudVigencia: false,
    };
  }

  if (isTechnicianWinner(toKpiInput(input)) && !PRE_AWARD_CASE_STATUSES.has(caseStatus)) {
    const st = STATUS_MAP[base.statusColorKey] ?? STATUS_MAP.enEvaluacion;
    return {
      kpiId,
      label: base.label,
      icon: base.icon,
      useStatusBadgeStyles: true,
      statusColorKey: base.statusColorKey,
      pillClassName: st.className,
      highlightEval,
      showInviteCountdown,
      showSolicitudVigencia: false,
    };
  }

  if (
    caseStatus === 'publicado' ||
    (caseStatus === CASE_STATUSES.EN_EVALUACION && !input.invitationStatus)
  ) {
    const stripe =
      caseStatus === CASE_STATUSES.EN_EVALUACION
        ? TECH_FICHA_STRIPE.invitacionPendiente
        : TECH_FICHA_STRIPE.esperandoOfertas;
    return {
      kpiId,
      label: stripe.label,
      icon: stripe.icon,
      useStatusBadgeStyles: false,
      statusColorKey: base.statusColorKey,
      pillClassName: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      highlightEval,
      showInviteCountdown,
      showSolicitudVigencia: false,
    };
  }

  const st = STATUS_MAP[base.statusColorKey] ?? STATUS_MAP.cerrado;
  return {
    kpiId,
    label: base.label,
    icon: base.icon,
    useStatusBadgeStyles: true,
    statusColorKey: base.statusColorKey,
    pillClassName: st.className,
    highlightEval: false,
    showInviteCountdown: false,
    showSolicitudVigencia: false,
  };
}

/** KPIs de trabajo en producción (ganador, post-adjudicación). */
export const TECH_KANBAN_WINNER_KPIS: TechKpiId[] = [
  'aceptadaPendienteInicio',
  'enEjecucion',
  'enRevision',
  'disenoAprobado',
  'enFabricacion',
  'enviado',
  'completado',
];

export function isTechKanbanProductionCase(input: CaseViewerStatusInput): boolean {
  const kpi = classifyTechnicianCaseKpi(toKpiInput(input));
  return TECH_KANBAN_WINNER_KPIS.includes(kpi);
}
