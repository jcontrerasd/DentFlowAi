import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  classifyDentistCaseKpi,
  classifyTechnicianCaseKpi,
  sumMetricValues,
} from '@/lib/dashboard/classifyCaseForDashboardKpi';
import { initEmptyMetrics, DENTIST_DASHBOARD_METRICS, TECH_DASHBOARD_METRICS } from '@/lib/dashboard/dashboardMetricsConfig';

/** Simula partición dentista sobre filas de status. */
function buildDentistMetrics(statuses: string[]) {
  const metrics = initEmptyMetrics(DENTIST_DASHBOARD_METRICS);
  for (const s of statuses) {
    const id = classifyDentistCaseKpi(s);
    metrics[id] = (metrics[id] ?? 0) + 1;
  }
  return metrics;
}

/** Simula partición técnico (un caso = un bucket). */
function buildTechMetrics(
  cases: Array<{
    status: string;
    assignedTechnicianId: string | null;
    invitationStatus: string | null;
  }>,
  techId: string,
) {
  const metrics = initEmptyMetrics(TECH_DASHBOARD_METRICS);
  for (const c of cases) {
    const id = classifyTechnicianCaseKpi({
      caseStatus: c.status,
      assignedTechnicianId: c.assignedTechnicianId,
      technicianUserId: techId,
      invitationStatus: c.invitationStatus as any,
    });
    metrics[id] = (metrics[id] ?? 0) + 1;
  }
  return metrics;
}

describe('dashboard metrics partition (unit)', () => {
  it('dentista: suma de KPIs = número de casos', () => {
    const statuses = ['borrador', 'enEvaluacion', 'propuestaLista', 'completado', 'rechazado'];
    const metrics = buildDentistMetrics(statuses);
    expect(sumMetricValues(metrics)).toBe(statuses.length);
  });

  it('técnico: un caso solo en un bucket', () => {
    const techId = 't1';
    const cases = [
      { status: 'enEvaluacion', assignedTechnicianId: null, invitationStatus: 'pending' },
      { status: 'enEvaluacion', assignedTechnicianId: null, invitationStatus: 'quoted' },
      { status: 'enEjecucion', assignedTechnicianId: techId, invitationStatus: 'confirmed' },
      { status: 'propuestaLista', assignedTechnicianId: null, invitationStatus: 'rejected' },
    ];
    const metrics = buildTechMetrics(cases, techId);
    expect(sumMetricValues(metrics)).toBe(cases.length);
    expect(metrics.invitacionPendiente).toBe(1);
    expect(metrics.cotizacionEnviada).toBe(1);
    expect(metrics.enEjecucion).toBe(1);
    expect(metrics.ofertaNoSeleccionada).toBe(1);
  });

  it('transición: quoted → ganador mueve de cotización a ejecución', () => {
    const techId = 't1';
    const before = buildTechMetrics(
      [{ status: 'enEvaluacion', assignedTechnicianId: null, invitationStatus: 'quoted' }],
      techId,
    );
    const after = buildTechMetrics(
      [{ status: 'enEjecucion', assignedTechnicianId: techId, invitationStatus: 'confirmed' }],
      techId,
    );
    expect(before.cotizacionEnviada).toBe(1);
    expect(before.enEjecucion).toBe(0);
    expect(after.cotizacionEnviada).toBe(0);
    expect(after.enEjecucion).toBe(1);
  });
});
