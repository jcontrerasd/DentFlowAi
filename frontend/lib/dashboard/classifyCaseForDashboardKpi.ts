import { CASE_STATUSES } from '@/lib/constants/dental';

/** KPIs de estado del dentista (excluye total). */
export type DentistKpiId =
  | 'borrador'
  | 'enEvaluacion'
  | 'propuestaLista'
  | 'aceptadaPendienteInicio'
  | 'enEjecucion'
  | 'enRevision'
  | 'disenoAprobado'
  | 'enFabricacion'
  | 'enviado'
  | 'completado'
  | 'cerrado'
  | 'pausado'
  | 'otros';

/** KPIs de estado del técnico (excluye total). */
export type TechKpiId =
  | 'invitacionPendiente'
  | 'cotizacionEnviada'
  | 'ofertaNoSeleccionada'
  | 'aceptadaPendienteInicio'
  | 'enEjecucion'
  | 'enRevision'
  | 'disenoAprobado'
  | 'enFabricacion'
  | 'enviado'
  | 'completado'
  | 'otros';

export type InvitationStatusForKpi =
  | 'pending'
  | 'quoted'
  | 'accepted'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'withdrawn'
  | null;

export type TechnicianCaseKpiInput = {
  caseStatus: string;
  assignedTechnicianId: string | null;
  technicianUserId: string;
  invitationStatus: InvitationStatusForKpi;
};

export const PRE_AWARD_CASE_STATUSES = new Set([
  CASE_STATUSES.EN_EVALUACION,
  CASE_STATUSES.PROPUESTA_LISTA,
  'publicado',
  CASE_STATUSES.BORRADOR,
]);

/** Estados clínicos que mapean a cada KPI de ganador (para filtros SQL). */
export const WINNER_CASE_STATUSES_BY_TECH_KPI: Record<string, string[]> = {
  aceptadaPendienteInicio: [CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO],
  enEjecucion: [CASE_STATUSES.EN_EJECUCION],
  enRevision: [CASE_STATUSES.EN_REVISION, CASE_STATUSES.CAMBIOS_EN_PROCESO],
  disenoAprobado: [CASE_STATUSES.DISENO_APROBADO],
  enFabricacion: [CASE_STATUSES.EN_FABRICACION],
  enviado: [CASE_STATUSES.ENVIADO],
  completado: [CASE_STATUSES.COMPLETADO],
};

export function mapWinnerCaseStatusToTechKpi(status: string): TechKpiId {
  switch (status) {
    case CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO:
      return 'aceptadaPendienteInicio';
    case CASE_STATUSES.EN_EJECUCION:
      return 'enEjecucion';
    case CASE_STATUSES.EN_REVISION:
    case CASE_STATUSES.CAMBIOS_EN_PROCESO:
      return 'enRevision';
    case CASE_STATUSES.DISENO_APROBADO:
      return 'disenoAprobado';
    case CASE_STATUSES.EN_FABRICACION:
      return 'enFabricacion';
    case CASE_STATUSES.ENVIADO:
      return 'enviado';
    case CASE_STATUSES.COMPLETADO:
      return 'completado';
    default:
      return 'otros';
  }
}

/** Clasificación exhaustiva por `clinical_case.status` (un caso → un bucket). */
export function classifyDentistCaseKpi(status: string): DentistKpiId {
  switch (status) {
    case CASE_STATUSES.BORRADOR:
      return 'borrador';
    case CASE_STATUSES.EN_EVALUACION:
    case 'publicado':
      return 'enEvaluacion';
    case CASE_STATUSES.PROPUESTA_LISTA:
      return 'propuestaLista';
    case CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO:
      return 'aceptadaPendienteInicio';
    case CASE_STATUSES.EN_EJECUCION:
      return 'enEjecucion';
    case CASE_STATUSES.EN_REVISION:
    case CASE_STATUSES.CAMBIOS_EN_PROCESO:
      return 'enRevision';
    case CASE_STATUSES.DISENO_APROBADO:
      return 'disenoAprobado';
    case CASE_STATUSES.EN_FABRICACION:
      return 'enFabricacion';
    case CASE_STATUSES.ENVIADO:
      return 'enviado';
    case CASE_STATUSES.COMPLETADO:
      return 'completado';
    case CASE_STATUSES.CERRADO:
    case CASE_STATUSES.CANCELADO:
    case CASE_STATUSES.RECHAZADO:
      return 'cerrado';
    case CASE_STATUSES.PAUSADO:
      return 'pausado';
    default:
      if (process.env.NODE_ENV === 'development') {
        console.warn('[classifyDentistCaseKpi] status desconocido:', status);
      }
      return 'otros';
  }
}

export function isTechnicianWinner(input: TechnicianCaseKpiInput): boolean {
  const { caseStatus, assignedTechnicianId, technicianUserId, invitationStatus } = input;
  if (assignedTechnicianId) {
    return assignedTechnicianId === technicianUserId;
  }
  if (invitationStatus === 'accepted' || invitationStatus === 'confirmed') {
    return !PRE_AWARD_CASE_STATUSES.has(caseStatus);
  }
  return false;
}

/** Un caso del técnico → exactamente un bucket (prioridad fija). */
export function classifyTechnicianCaseKpi(input: TechnicianCaseKpiInput): TechKpiId {
  const { caseStatus, invitationStatus } = input;

  if (isTechnicianWinner(input)) {
    return mapWinnerCaseStatusToTechKpi(caseStatus);
  }

  if (invitationStatus === 'pending') {
    return 'invitacionPendiente';
  }

  if (
    invitationStatus === 'quoted' &&
    PRE_AWARD_CASE_STATUSES.has(caseStatus)
  ) {
    return 'cotizacionEnviada';
  }

  if (
    invitationStatus === 'rejected' ||
    invitationStatus === 'expired' ||
    invitationStatus === 'withdrawn'
  ) {
    return 'ofertaNoSeleccionada';
  }

  if (invitationStatus === 'accepted') {
    return 'cotizacionEnviada';
  }

  if (invitationStatus === 'quoted') {
    return 'ofertaNoSeleccionada';
  }

  if (invitationStatus === 'confirmed') {
    return PRE_AWARD_CASE_STATUSES.has(caseStatus)
      ? 'cotizacionEnviada'
      : 'ofertaNoSeleccionada';
  }

  if (invitationStatus === null) {
    if (
      caseStatus === CASE_STATUSES.CERRADO ||
      caseStatus === CASE_STATUSES.RECHAZADO ||
      caseStatus === CASE_STATUSES.CANCELADO
    ) {
      return 'ofertaNoSeleccionada';
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('[classifyTechnicianCaseKpi] sin invitación', input);
    }
    return 'otros';
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn('[classifyTechnicianCaseKpi] fallback', input);
  }
  return 'otros';
}

/** Espejo puro de `buildTechKpiFilterWhere` para tests. */
export function matchesTechKpiFilter(kpi: TechKpiId, input: TechnicianCaseKpiInput): boolean {
  return classifyTechnicianCaseKpi(input) === kpi;
}

export function sumMetricValues(metrics: Record<string, number>): number {
  return Object.values(metrics).reduce((a, b) => a + b, 0);
}

export function assertMetricsPartition(
  metrics: Record<string, number>,
  totalCases: number,
  context: string,
): void {
  const sum = sumMetricValues(metrics);
  if (sum !== totalCases) {
    throw new Error(
      `[${context}] Partición KPI inválida: sum=${sum} totalCases=${totalCases} metrics=${JSON.stringify(metrics)}`,
    );
  }
}
