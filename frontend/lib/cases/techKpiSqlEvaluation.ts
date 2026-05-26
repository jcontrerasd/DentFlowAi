import {
  isTechnicianWinner,
  PRE_AWARD_CASE_STATUSES,
  WINNER_CASE_STATUSES_BY_TECH_KPI,
  type TechKpiId,
  type TechnicianCaseKpiInput,
} from '@/lib/dashboard/classifyCaseForDashboardKpi';

const OFERTA_INV_STATUSES = new Set(['rejected', 'expired', 'withdrawn']);

/**
 * Evaluador puro que replica `buildSingleTechKpiClause` + isNotTechWinnerSql
 * en caseListQueryBuilder (paridad TS ↔ SQL sin BD).
 */
export function evaluateTechKpiSql(kpi: TechKpiId, input: TechnicianCaseKpiInput): boolean {
  const isWinner = isTechnicianWinner(input);
  const isNotWinner = !isWinner;
  const { caseStatus, invitationStatus } = input;

  switch (kpi) {
    case 'invitacionPendiente':
      return isNotWinner && invitationStatus === 'pending';

    case 'cotizacionEnviada':
      return (
        isNotWinner &&
        (invitationStatus === 'quoted' || invitationStatus === 'accepted') &&
        PRE_AWARD_CASE_STATUSES.has(caseStatus)
      );

    case 'ofertaNoSeleccionada':
      return (
        isNotWinner &&
        ((invitationStatus != null && OFERTA_INV_STATUSES.has(invitationStatus)) ||
          (invitationStatus === 'quoted' && !PRE_AWARD_CASE_STATUSES.has(caseStatus)) ||
          (invitationStatus === 'confirmed' && !PRE_AWARD_CASE_STATUSES.has(caseStatus)))
      );

    case 'otros':
      if (!isWinner) return false;
      return !Object.values(WINNER_CASE_STATUSES_BY_TECH_KPI).some((statuses) =>
        statuses.includes(caseStatus),
      );

    default: {
      const statuses = WINNER_CASE_STATUSES_BY_TECH_KPI[kpi];
      if (!statuses?.length) return false;
      return isWinner && statuses.includes(caseStatus);
    }
  }
}
