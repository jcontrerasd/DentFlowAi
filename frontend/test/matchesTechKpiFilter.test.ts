import { describe, expect, it } from 'vitest';
import { CASE_STATUSES } from '@/lib/constants/dental';
import {
  DEFAULT_CASE_LIST_FILTERS,
  expandTechPreset,
  TECH_FILTERABLE_KPI_IDS,
} from '@/lib/cases/caseListFilters';
import { evaluateTechKpiSql } from '@/lib/cases/techKpiSqlEvaluation';
import {
  classifyTechnicianCaseKpi,
  matchesTechKpiFilter,
  type TechnicianCaseKpiInput,
  type TechKpiId,
} from '@/lib/dashboard/classifyCaseForDashboardKpi';

const TECH = 'tech-1';
const OTHER = 'other-tech';

type KpiFixture = {
  name: string;
  input: TechnicianCaseKpiInput;
  expected: TechKpiId;
};

/** Casos representativos alineados a `buildSingleTechKpiClause` / ficha técnico. */
const KPI_FIXTURES: KpiFixture[] = [
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
    name: 'perdedor con caso en esperando inicio clínico',
    input: {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'quoted',
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
  {
    name: 'oferta rechazada',
    input: {
      caseStatus: CASE_STATUSES.PROPUESTA_LISTA,
      assignedTechnicianId: null,
      technicianUserId: TECH,
      invitationStatus: 'rejected',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'oferta rechazada sin assigned (NULL)',
    input: {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: null,
      technicianUserId: TECH,
      invitationStatus: 'rejected',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'oferta withdrawn',
    input: {
      caseStatus: CASE_STATUSES.EN_EJECUCION,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'withdrawn',
    },
    expected: 'ofertaNoSeleccionada',
  },
  {
    name: 'quoted post-adjudicación sin ser asignado',
    input: {
      caseStatus: CASE_STATUSES.EN_EJECUCION,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'quoted',
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
    name: 'perdedor rejected con otro asignado',
    input: {
      caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
      assignedTechnicianId: OTHER,
      technicianUserId: TECH,
      invitationStatus: 'rejected',
    },
    expected: 'ofertaNoSeleccionada',
  },
];

const MUTUALLY_EXCLUSIVE_KPIS: TechKpiId[] = [
  'invitacionPendiente',
  'cotizacionEnviada',
  'ofertaNoSeleccionada',
  'aceptadaPendienteInicio',
  'enEjecucion',
  'enRevision',
  'enFabricacion',
  'completado',
];

describe('matchesTechKpiFilter', () => {
  it.each(KPI_FIXTURES)('$name → $expected', ({ input, expected }) => {
    expect(classifyTechnicianCaseKpi(input)).toBe(expected);
    expect(evaluateTechKpiSql(expected, input)).toBe(true);
    expect(matchesTechKpiFilter(expected, input)).toBe(true);
    for (const kpi of MUTUALLY_EXCLUSIVE_KPIS) {
      if (kpi !== expected) {
        expect(matchesTechKpiFilter(kpi, input)).toBe(false);
      }
    }
  });

  it('filtro aceptadaPendienteInicio: solo ganador, no perdedor en mismo estado clínico', () => {
    const winner = KPI_FIXTURES.find((f) => f.name === 'ganador esperando inicio')!.input;
    const loser = KPI_FIXTURES.find((f) => f.name === 'perdedor con caso en esperando inicio clínico')!
      .input;
    expect(matchesTechKpiFilter('aceptadaPendienteInicio', winner)).toBe(true);
    expect(matchesTechKpiFilter('aceptadaPendienteInicio', loser)).toBe(false);
  });

  it('matchesTechKpiFilter es equivalente a classify === kpi', () => {
    for (const { input, expected } of KPI_FIXTURES) {
      for (const kpi of TECH_FILTERABLE_KPI_IDS) {
        expect(matchesTechKpiFilter(kpi, input)).toBe(classifyTechnicianCaseKpi(input) === kpi);
      }
    }
  });
});

describe('expandTechPreset ↔ matchesTechKpiFilter', () => {
  it('preset nuevas coincide solo con invitacionPendiente', () => {
    const expanded = expandTechPreset({ ...DEFAULT_CASE_LIST_FILTERS, techPreset: 'nuevas' });
    expect(expanded.techKpiStatuses).toEqual(['invitacionPendiente']);
    const pending = KPI_FIXTURES.find((f) => f.expected === 'invitacionPendiente')!.input;
    const winner = KPI_FIXTURES.find((f) => f.expected === 'aceptadaPendienteInicio')!.input;
    expect(matchesTechKpiFilter('invitacionPendiente', pending)).toBe(true);
    expect(matchesTechKpiFilter('invitacionPendiente', winner)).toBe(false);
  });

  it('preset cotizaciones coincide con cotizacionEnviada en evaluación', () => {
    const expanded = expandTechPreset({
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: 'cotizaciones',
    });
    expect(expanded.techKpiStatuses).toEqual(['cotizacionEnviada']);
    const quoted = KPI_FIXTURES.find((f) => f.expected === 'cotizacionEnviada')!.input;
    expect(matchesTechKpiFilter('cotizacionEnviada', quoted)).toBe(true);
  });

  it('preset progreso incluye ganador en ejecución', () => {
    const expanded = expandTechPreset({ ...DEFAULT_CASE_LIST_FILTERS, techPreset: 'progreso' });
    const winner = KPI_FIXTURES.find((f) => f.expected === 'enEjecucion')!.input;
    const pending = KPI_FIXTURES.find((f) => f.expected === 'invitacionPendiente')!.input;
    expect(expanded.techKpiStatuses).toContain('enEjecucion');
    expect(matchesTechKpiFilter('enEjecucion', winner)).toBe(true);
    expect(expanded.techKpiStatuses!.some((kpi) => matchesTechKpiFilter(kpi, pending))).toBe(false);
  });
});
