import { describe, expect, it } from 'vitest';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { evaluateTechKpiSql } from '@/lib/cases/techKpiSqlEvaluation';
import { TECH_FILTERABLE_KPI_IDS } from '@/lib/cases/caseListFilters';
import {
  classifyTechnicianCaseKpi,
  isTechnicianWinner,
  type TechnicianCaseKpiInput,
  type TechKpiId,
} from '@/lib/dashboard/classifyCaseForDashboardKpi';

const TECH = 'tech-1';
const OTHER = 'other-tech';

type ParityFixture = {
  name: string;
  input: TechnicianCaseKpiInput;
  expected: TechKpiId;
};

const PARITY_FIXTURES: ParityFixture[] = [
  {
    name: 'invitación pending',
    input: {
      caseStatus: CASE_STATUSES.EN_EVALUACION,
      assignedTechnicianId: null,
      technicianUserId: TECH,
      invitationStatus: 'pending',
    },
    expected: 'invitacionPendiente',
  },
  {
    name: 'cotización en evaluación',
    input: {
      caseStatus: CASE_STATUSES.EN_EVALUACION,
      assignedTechnicianId: null,
      technicianUserId: TECH,
      invitationStatus: 'quoted',
    },
    expected: 'cotizacionEnviada',
  },
  {
    name: 'ganador esperando inicio',
    input: {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: TECH,
      technicianUserId: TECH,
      invitationStatus: 'confirmed',
    },
    expected: 'aceptadaPendienteInicio',
  },
  {
    name: 'perdedor quoted post-adjudicación',
    input: {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'quoted',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'oferta rechazada propuestaLista assigned NULL',
    input: {
      caseStatus: CASE_STATUSES.PROPUESTA_LISTA,
      assignedTechnicianId: null,
      technicianUserId: TECH,
      invitationStatus: 'rejected',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'oferta rechazada assigned NULL',
    input: {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: null,
      technicianUserId: TECH,
      invitationStatus: 'rejected',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'perdedor rejected con otro asignado',
    input: {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'rejected',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'histórico confirmed + rejected reciente (status representativo)',
    input: {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'rejected',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'comparativo expirado withdrawn cerrado',
    input: {
      caseStatus: CASE_STATUSES.CERRADO,
      assignedTechnicianId: null,
      technicianUserId: TECH,
      invitationStatus: 'withdrawn',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'oferta withdrawn perdedor',
    input: {
      caseStatus: CASE_STATUSES.EN_EJECUCION,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'withdrawn',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'ganador en ejecución',
    input: {
      caseStatus: CASE_STATUSES.EN_EJECUCION,
      assignedTechnicianId: TECH,
      technicianUserId: TECH,
      invitationStatus: 'confirmed',
    },
    expected: 'enEjecucion',
  },
];

describe('techKpiSqlParity', () => {
  it.each(PARITY_FIXTURES)('$name: SQL evaluador incluye caso clasificado', ({ input, expected }) => {
    expect(classifyTechnicianCaseKpi(input)).toBe(expected);
    expect(evaluateTechKpiSql(expected, input)).toBe(true);
  });

  it.each(PARITY_FIXTURES)(
    '$name: classify y evaluateTechKpiSql coinciden en todos los KPIs listables',
    ({ input, expected }) => {
      for (const kpi of TECH_FILTERABLE_KPI_IDS) {
        const sqlMatch = evaluateTechKpiSql(kpi, input);
        const classifyMatch = classifyTechnicianCaseKpi(input) === kpi;
        expect(sqlMatch).toBe(classifyMatch);
        if (kpi === expected) {
          expect(sqlMatch).toBe(true);
        }
      }
    },
  );

  it('assigned a otro: última invitación confirmed post-adjudicación → oferta no seleccionada', () => {
    const input: TechnicianCaseKpiInput = {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'confirmed',
    };
    expect(isTechnicianWinner(input)).toBe(false);
    expect(classifyTechnicianCaseKpi(input)).toBe('ofertaNoSeleccionada');
    expect(evaluateTechKpiSql('ofertaNoSeleccionada', input)).toBe(true);
  });

  it('ofertaNoSeleccionada con assigned NULL: SQL true (regresión NULL)', () => {
    const input: TechnicianCaseKpiInput = {
      caseStatus: CASE_STATUSES.PROPUESTA_LISTA,
      assignedTechnicianId: null,
      technicianUserId: TECH,
      invitationStatus: 'rejected',
    };
    expect(evaluateTechKpiSql('ofertaNoSeleccionada', input)).toBe(true);
  });
});
