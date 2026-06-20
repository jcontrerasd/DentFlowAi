import type { LucideIcon } from 'lucide-react';
import { FileText, ShieldCheck, BadgeCheck, Hammer, Layers, ClipboardCheck } from 'lucide-react';
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
  'enRevisionCalidad',
  'enRevision',
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

/** KPIs del revisor de Calidad (v5.19). Sobre sus casos asignados. */
export type CalidadKpiId = 'porCertificar' | 'certificadas' | 'enProceso' | 'porCalificar' | 'completado' | 'otros';

export const CALIDAD_DASHBOARD_METRICS: DashboardMetricDef[] = [
  { id: 'porCertificar', label: 'En revisión calidad', statusColorKey: 'enRevision', icon: ShieldCheck, attentionBadge: true },
  { id: 'certificadas', label: 'Listas para enviar', statusColorKey: 'aceptadaPendienteInicio', icon: BadgeCheck },
  { id: 'enProceso', label: 'En proceso', statusColorKey: 'enEjecucion', icon: Hammer },
  { id: 'porCalificar', label: 'Por calificar', statusColorKey: 'enRevision', icon: ClipboardCheck, attentionBadge: true },
  { id: 'completado', label: 'Completados', statusColorKey: 'completado', icon: Layers },
  { id: 'otros', label: 'Otros', statusColorKey: 'otros', icon: FileText },
];

/**
 * Clasifica un caso en un KPI de Calidad. Un caso `completado` sin la calificación del
 * revisor (review dimension='quality') cae en `porCalificar` (tarea pendiente persistente);
 * una vez calificado, pasa a `completado`. El resto se clasifica solo por estado.
 */
export function classifyCalidadCaseKpi(
  status: string | null | undefined,
  hasQualityReview: boolean = true,
): CalidadKpiId {
  switch (status) {
    case 'enRevisionCalidad': return 'porCertificar';
    case 'certificadoCalidad': return 'certificadas';
    case 'enEjecucion':
    case 'cambiosEnProceso':
    case 'enRevision': return 'enProceso';
    case 'completado': return hasQualityReview ? 'completado' : 'porCalificar';
    default: return 'otros';
  }
}

export const TOTAL_METRIC_DEF: DashboardMetricDef = {
  id: 'total',
  label: 'Total',
  statusColorKey: 'total',
  icon: FileText,
};

export function getDashboardMetricDefsForRole(role: 'dentista' | 'tecnico' | 'calidad'): DashboardMetricDef[] {
  if (role === 'calidad') return CALIDAD_DASHBOARD_METRICS;
  return role === 'dentista' ? DENTIST_DASHBOARD_METRICS : TECH_DASHBOARD_METRICS;
}

export function initEmptyMetrics(defs: DashboardMetricDef[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const d of defs) {
    m[d.id] = 0;
  }
  return m;
}
