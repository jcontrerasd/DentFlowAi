import { describe, expect, it } from 'vitest';
import {
  classifyDentistCaseKpi,
  classifyTechnicianCaseKpi,
  sumMetricValues,
  assertMetricsPartition,
} from '@/lib/dashboard/classifyCaseForDashboardKpi';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { initEmptyMetrics, DENTIST_DASHBOARD_METRICS, TECH_DASHBOARD_METRICS } from '@/lib/dashboard/dashboardMetricsConfig';

const TECH_ID = 'tech-1';

describe('classifyDentistCaseKpi', () => {
  it('mapea todos los estados canónicos', () => {
    expect(classifyDentistCaseKpi(CASE_STATUSES.BORRADOR)).toBe('borrador');
    expect(classifyDentistCaseKpi(CASE_STATUSES.EN_EVALUACION)).toBe('enEvaluacion');
    expect(classifyDentistCaseKpi('publicado')).toBe('enEvaluacion');
    expect(classifyDentistCaseKpi(CASE_STATUSES.PROPUESTA_LISTA)).toBe('propuestaLista');
    expect(classifyDentistCaseKpi(CASE_STATUSES.CAMBIOS_EN_PROCESO)).toBe('enRevision');
    expect(classifyDentistCaseKpi(CASE_STATUSES.RECHAZADO)).toBe('cerrado');
    expect(classifyDentistCaseKpi(CASE_STATUSES.PAUSADO)).toBe('pausado');
  });

  it('desconocido → otros', () => {
    expect(classifyDentistCaseKpi('estado_inventado')).toBe('otros');
  });
});

describe('classifyTechnicianCaseKpi', () => {
  it('ganador usa estado del caso', () => {
    expect(
      classifyTechnicianCaseKpi({
        caseStatus: CASE_STATUSES.EN_EJECUCION,
        assignedTechnicianId: TECH_ID,
        technicianUserId: TECH_ID,
        invitationStatus: 'confirmed',
      }),
    ).toBe('enEjecucion');
  });

  it('pending → invitacionPendiente', () => {
    expect(
      classifyTechnicianCaseKpi({
        caseStatus: CASE_STATUSES.EN_EVALUACION,
        assignedTechnicianId: null,
        technicianUserId: TECH_ID,
        invitationStatus: 'pending',
      }),
    ).toBe('invitacionPendiente');
  });

  it('quoted en evaluación → cotizacionEnviada', () => {
    expect(
      classifyTechnicianCaseKpi({
        caseStatus: CASE_STATUSES.EN_EVALUACION,
        assignedTechnicianId: null,
        technicianUserId: TECH_ID,
        invitationStatus: 'quoted',
      }),
    ).toBe('cotizacionEnviada');
  });

  it('rejected → ofertaNoSeleccionada', () => {
    expect(
      classifyTechnicianCaseKpi({
        caseStatus: CASE_STATUSES.PROPUESTA_LISTA,
        assignedTechnicianId: null,
        technicianUserId: TECH_ID,
        invitationStatus: 'rejected',
      }),
    ).toBe('ofertaNoSeleccionada');
  });

  it('perdedor en aceptadaPendienteInicio → ofertaNoSeleccionada (no KPI ganador)', () => {
    expect(
      classifyTechnicianCaseKpi({
        caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
        assignedTechnicianId: 'other-tech',
        technicianUserId: TECH_ID,
        invitationStatus: 'quoted',
      }),
    ).toBe('ofertaNoSeleccionada');
  });

  it('perdedor con confirmed post-adjudicación → ofertaNoSeleccionada', () => {
    expect(
      classifyTechnicianCaseKpi({
        caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
        assignedTechnicianId: 'other-tech',
        technicianUserId: TECH_ID,
        invitationStatus: 'confirmed',
      }),
    ).toBe('ofertaNoSeleccionada');
  });

  it('ganador en aceptadaPendienteInicio → aceptadaPendienteInicio', () => {
    expect(
      classifyTechnicianCaseKpi({
        caseStatus: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
        assignedTechnicianId: TECH_ID,
        technicianUserId: TECH_ID,
        invitationStatus: 'confirmed',
      }),
    ).toBe('aceptadaPendienteInicio');
  });
});

describe('assertMetricsPartition', () => {
  it('valida suma === total', () => {
    const m = initEmptyMetrics(DENTIST_DASHBOARD_METRICS);
    m.borrador = 2;
    m.enEvaluacion = 3;
    expect(() => assertMetricsPartition(m, 5, 'test')).not.toThrow();
    expect(() => assertMetricsPartition(m, 4, 'test')).toThrow();
  });

  it('sumMetricValues agrega correctamente', () => {
    const m = initEmptyMetrics(TECH_DASHBOARD_METRICS);
    m.invitacionPendiente = 1;
    m.cotizacionEnviada = 2;
    expect(sumMetricValues(m)).toBe(3);
  });
});
