import { describe, expect, it } from 'vitest';
import { classifyCalidadCaseKpi, CALIDAD_DASHBOARD_METRICS, getDashboardMetricDefsForRole } from '@/lib/dashboard/dashboardMetricsConfig';
import { filtersFromDashboardMetricId } from '@/lib/cases/caseListFilters';

describe('Calidad — KPIs del dashboard', () => {
  it('clasifica el estado del caso en el KPI de Calidad correcto', () => {
    expect(classifyCalidadCaseKpi('enRevisionCalidad')).toBe('porCertificar');
    expect(classifyCalidadCaseKpi('certificadoCalidad')).toBe('certificadas');
    expect(classifyCalidadCaseKpi('enEjecucion')).toBe('enProceso');
    expect(classifyCalidadCaseKpi('enRevision')).toBe('enProceso');
    expect(classifyCalidadCaseKpi('borrador')).toBe('otros');
  });

  it('separa completado en porCalificar vs completado según la calificación', () => {
    expect(classifyCalidadCaseKpi('completado', false)).toBe('porCalificar');
    expect(classifyCalidadCaseKpi('completado', true)).toBe('completado');
    // Sin el flag (default) asume ya calificado: no rotula casos legacy como pendientes.
    expect(classifyCalidadCaseKpi('completado')).toBe('completado');
  });

  it('expone los defs de KPI para el rol calidad', () => {
    expect(getDashboardMetricDefsForRole('calidad')).toBe(CALIDAD_DASHBOARD_METRICS);
    const ids = CALIDAD_DASHBOARD_METRICS.map((d) => d.id);
    expect(ids).toContain('porCertificar');
    expect(ids).toContain('porCalificar');
    const porCalificar = CALIDAD_DASHBOARD_METRICS.find((d) => d.id === 'porCalificar');
    expect(porCalificar?.attentionBadge).toBe(true);
  });

  it('un KPI de Calidad mapea a filtros de estado de caso', () => {
    const f = filtersFromDashboardMetricId('calidad', 'porCertificar');
    expect(f.caseStatuses).toContain('enRevisionCalidad');
    const f2 = filtersFromDashboardMetricId('calidad', 'certificadas');
    expect(f2.caseStatuses).toContain('certificadoCalidad');
  });

  it('porCalificar y completado comparten estado pero difieren en qualityRatingState', () => {
    const pend = filtersFromDashboardMetricId('calidad', 'porCalificar');
    expect(pend.caseStatuses).toEqual(['completado']);
    expect(pend.qualityRatingState).toBe('pending');

    const done = filtersFromDashboardMetricId('calidad', 'completado');
    expect(done.caseStatuses).toEqual(['completado']);
    expect(done.qualityRatingState).toBe('rated');
  });
});
