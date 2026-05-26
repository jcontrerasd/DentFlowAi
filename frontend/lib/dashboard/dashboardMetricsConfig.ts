import type { LucideIcon } from 'lucide-react';
import { FileText } from 'lucide-react';
import {
  getDentistKpiFichaPresentation,
  getTechKpiFichaPresentation,
} from '@/lib/cases/caseFichaStatusPresentation';
import type { DentistKpiId, TechKpiId } from '@/lib/dashboard/classifyCaseForDashboardKpi';

export type DashboardMetricDef = {
  id: string;
  label: string;
  statusColorKey: string;
  icon: LucideIcon;
  attentionBadge?: boolean;
};

const DENTIST_KPI_IDS: DentistKpiId[] = [
  'borrador',
  'enEvaluacion',
  'propuestaLista',
  'aceptadaPendienteInicio',
  'enEjecucion',
  'enRevision',
  'disenoAprobado',
  'enFabricacion',
  'enviado',
  'completado',
  'cerrado',
  'pausado',
  'otros',
];

const TECH_KPI_IDS: TechKpiId[] = [
  'invitacionPendiente',
  'cotizacionEnviada',
  'ofertaNoSeleccionada',
  'aceptadaPendienteInicio',
  'enEjecucion',
  'enRevision',
  'disenoAprobado',
  'enFabricacion',
  'enviado',
  'completado',
  'otros',
];

function dentistMetricDef(id: DentistKpiId): DashboardMetricDef {
  const pres = getDentistKpiFichaPresentation(id);
  return {
    id,
    label: pres.label,
    statusColorKey: pres.statusColorKey,
    icon: pres.icon,
    attentionBadge: id === 'propuestaLista',
  };
}

function techMetricDef(id: TechKpiId): DashboardMetricDef {
  const pres = getTechKpiFichaPresentation(id);
  return {
    id,
    label: pres.label,
    statusColorKey: pres.statusColorKey,
    icon: pres.icon,
    attentionBadge: id === 'invitacionPendiente',
  };
}

export const DENTIST_DASHBOARD_METRICS: DashboardMetricDef[] = DENTIST_KPI_IDS.map(dentistMetricDef);

export const TECH_DASHBOARD_METRICS: DashboardMetricDef[] = TECH_KPI_IDS.map(techMetricDef);

export const TOTAL_METRIC_DEF: DashboardMetricDef = {
  id: 'total',
  label: 'Total',
  statusColorKey: 'total',
  icon: FileText,
};

export function getDashboardMetricDefsForRole(role: 'dentista' | 'tecnico'): DashboardMetricDef[] {
  return role === 'dentista' ? DENTIST_DASHBOARD_METRICS : TECH_DASHBOARD_METRICS;
}

export function initEmptyMetrics(defs: DashboardMetricDef[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of defs) {
    m[d.id] = 0;
  }
  return m;
}
