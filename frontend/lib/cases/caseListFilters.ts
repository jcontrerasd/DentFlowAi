import { CASE_STATUSES } from '@/lib/constants/dental';
import { statusLabel } from '@/components/ui/StatusBadge';
import { getTechKpiFichaPresentation } from '@/lib/cases/caseFichaStatusPresentation';
import type { TechKpiId } from '@/lib/dashboard/classifyCaseForDashboardKpi';

export type TechListPreset = 'nuevas' | 'cotizaciones' | 'progreso';

export type InvitationStatusFilter =
  | 'pending'
  | 'quoted'
  | 'accepted'
  | 'confirmed'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export type CaseListQueryFilters = {
  q?: string;
  caseStatuses?: string[];
  techKpiStatuses?: TechKpiId[];
  invitationStatuses?: InvitationStatusFilter[];
  priorities?: string[];
  serviceTypes?: string[];
  dateStart?: string;
  dateEnd?: string;
  offerDateStart?: string;
  offerDateEnd?: string;
  techPreset?: TechListPreset | null;
  sortOrder?: 'recent' | 'old';
};

export const TECH_ACTIVE_CASE_STATUSES = [
  CASE_STATUSES.EN_EJECUCION,
  CASE_STATUSES.EN_REVISION,
  CASE_STATUSES.CAMBIOS_EN_PROCESO,
  CASE_STATUSES.DISENO_APROBADO,
  CASE_STATUSES.EN_FABRICACION,
  CASE_STATUSES.ENVIADO,
] as const;

const TECH_PROGRESS_KPI_STATUSES: TechKpiId[] = [
  'enEjecucion',
  'enRevision',
  'disenoAprobado',
  'enFabricacion',
  'enviado',
];

/** KPIs listables en modal técnico (sin `otros` por defecto). */
export const TECH_FILTERABLE_KPI_IDS: TechKpiId[] = [
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
];

const TECH_KPI_FILTER_SET = new Set<string>([
  ...TECH_FILTERABLE_KPI_IDS,
  'otros',
]);

/** Rol de vista para listado (técnico solo con `user.role === tecnico`, p. ej. impersonación). */
export function resolveCaseListViewRole(
  role: string | null | undefined,
): 'dentista' | 'tecnico' {
  return role === 'tecnico' ? 'tecnico' : 'dentista';
}

export function sanitizeTechKpiStatuses(
  statuses: string[] | undefined,
): TechKpiId[] {
  if (!statuses?.length) return [];
  const out: TechKpiId[] = [];
  for (const s of statuses) {
    if (TECH_KPI_FILTER_SET.has(s) && !out.includes(s as TechKpiId)) {
      out.push(s as TechKpiId);
    }
  }
  return out;
}

/** Todos los KPIs del modal activos → equivalente a sin filtro KPI (unión exhaustiva). */
export function isExhaustiveTechKpiFilterSelection(
  techKpiStatuses: TechKpiId[] | undefined,
): boolean {
  if (!techKpiStatuses?.length) return false;
  const set = new Set(techKpiStatuses);
  return TECH_FILTERABLE_KPI_IDS.every((kpi) => set.has(kpi));
}

const LEGACY_CASE_STATUS_TO_TECH_KPI = new Set<string>([
  'aceptadaPendienteInicio',
  'enEjecucion',
  'enRevision',
  'cambiosEnProceso',
  'disenoAprobado',
  'enFabricacion',
  'enviado',
  'completado',
]);

export const DEFAULT_CASE_LIST_FILTERS: CaseListQueryFilters = {
  q: '',
  caseStatuses: [],
  techKpiStatuses: [],
  invitationStatuses: [],
  priorities: [],
  serviceTypes: [],
  dateStart: '',
  dateEnd: '',
  offerDateStart: '',
  offerDateEnd: '',
  techPreset: null,
  sortOrder: 'recent',
};

/** Estados listables para dentista en UI de filtros. */
export const DENTIST_FILTERABLE_CASE_STATUSES: string[] = [
  CASE_STATUSES.BORRADOR,
  CASE_STATUSES.EN_EVALUACION,
  'publicado',
  CASE_STATUSES.PROPUESTA_LISTA,
  CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
  CASE_STATUSES.EN_EJECUCION,
  CASE_STATUSES.EN_REVISION,
  CASE_STATUSES.CAMBIOS_EN_PROCESO,
  CASE_STATUSES.DISENO_APROBADO,
  CASE_STATUSES.EN_FABRICACION,
  CASE_STATUSES.ENVIADO,
  CASE_STATUSES.COMPLETADO,
  CASE_STATUSES.CERRADO,
  CASE_STATUSES.PAUSADO,
  CASE_STATUSES.CANCELADO,
  CASE_STATUSES.RECHAZADO,
];

/**
 * Modal de filtros (dentista y técnico): stepper con iconos + excepciones en píldoras.
 * Revertir: `false` (vuelve chips `flex-wrap` en los campos de estado/KPI).
 */
export const CASE_LIST_FILTER_USE_TIMELINE_UI = true;

/** @deprecated Usar `CASE_LIST_FILTER_USE_TIMELINE_UI`. */
export const DENTIST_STATUS_FILTER_USE_TIMELINE_UI = CASE_LIST_FILTER_USE_TIMELINE_UI;

/** KPI técnico — flujo principal (pre-oferta → trabajo → cierre). */
export const TECH_KPI_FILTER_MAIN_TIMELINE: TechKpiId[] = [
  'invitacionPendiente',
  'cotizacionEnviada',
  'aceptadaPendienteInicio',
  'enEjecucion',
  'enRevision',
  'disenoAprobado',
  'enFabricacion',
  'enviado',
  'completado',
];

/** KPI técnico — fuera del camino lineal del ganador. */
export const TECH_KPI_FILTER_EXCEPTIONS: TechKpiId[] = ['ofertaNoSeleccionada'];

/** Flujo principal (orden del stepper / caso feliz). */
export const DENTIST_STATUS_FILTER_MAIN_TIMELINE: string[] = [
  CASE_STATUSES.BORRADOR,
  CASE_STATUSES.EN_EVALUACION,
  'publicado',
  CASE_STATUSES.PROPUESTA_LISTA,
  CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
  CASE_STATUSES.EN_EJECUCION,
  CASE_STATUSES.EN_REVISION,
  CASE_STATUSES.DISENO_APROBADO,
  CASE_STATUSES.EN_FABRICACION,
  CASE_STATUSES.ENVIADO,
  CASE_STATUSES.COMPLETADO,
];

/** Estados fuera del camino lineal (segunda fila en UI timeline). */
export const DENTIST_STATUS_FILTER_EXCEPTIONS: string[] = [
  CASE_STATUSES.CAMBIOS_EN_PROCESO,
  CASE_STATUSES.PAUSADO,
  CASE_STATUSES.CERRADO,
  CASE_STATUSES.CANCELADO,
  CASE_STATUSES.RECHAZADO,
];

export const TECH_INVITATION_STATUS_OPTIONS: { value: InvitationStatusFilter; label: string }[] = [
  { value: 'pending', label: 'Invitación pendiente' },
  { value: 'quoted', label: 'Cotización enviada' },
  { value: 'accepted', label: 'Seleccionada' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'rejected', label: 'Oferta no seleccionada' },
  { value: 'expired', label: 'Expirada' },
  { value: 'withdrawn', label: 'Retirada' },
];

export function techKpiFilterLabel(kpiId: TechKpiId): string {
  return getTechKpiFichaPresentation(kpiId).label;
}

export function caseStatusFilterLabel(status: string): string {
  if (status === 'publicado') return 'Esperando ofertas';
  if (status === CASE_STATUSES.CAMBIOS_EN_PROCESO) return 'Cambios en proceso';
  return statusLabel(status) || status;
}

export function normalizeFiltersForRole(
  role: 'dentista' | 'tecnico',
  filters: CaseListQueryFilters,
): CaseListQueryFilters {
  const base = { ...filters };
  if (role === 'tecnico') {
    let techKpi = sanitizeTechKpiStatuses(base.techKpiStatuses);
    for (const s of base.caseStatuses ?? []) {
      const mapped = s === 'cambiosEnProceso' ? 'enRevision' : s;
      if (LEGACY_CASE_STATUS_TO_TECH_KPI.has(mapped) && !techKpi.includes(mapped as TechKpiId)) {
        techKpi.push(mapped as TechKpiId);
      }
    }
    if (isExhaustiveTechKpiFilterSelection(techKpi)) {
      techKpi = [];
    }
    return {
      ...base,
      caseStatuses: [],
      techKpiStatuses: techKpi,
      invitationStatuses: techKpi.length > 0 ? [] : base.invitationStatuses,
    };
  }
  return {
    ...base,
    techKpiStatuses: [],
  };
}

/** Expande preset técnico a `techKpiStatuses` (deep links y emails). */
export function expandTechPreset(filters: CaseListQueryFilters): CaseListQueryFilters {
  const base = { ...filters };
  if (!base.techPreset) return base;

  switch (base.techPreset) {
    case 'nuevas':
      return {
        ...base,
        techKpiStatuses: ['invitacionPendiente'],
        invitationStatuses: [],
        caseStatuses: [],
      };
    case 'cotizaciones':
      return {
        ...base,
        techKpiStatuses: ['cotizacionEnviada'],
        invitationStatuses: [],
        caseStatuses: [],
      };
    case 'progreso':
      return {
        ...base,
        techKpiStatuses: [...TECH_PROGRESS_KPI_STATUSES],
        invitationStatuses: [],
        caseStatuses: [],
      };
    default:
      return base;
  }
}

export function normalizeSearchQuery(q?: string): string {
  return (q ?? '').trim().replace(/\s+/g, ' ');
}

/** Preset / KPI / invitación del listado técnico (no incluye `q`). */
export function hasTechListFacetFilters(filters: CaseListQueryFilters): boolean {
  return !!(
    filters.techPreset ||
    (filters.techKpiStatuses?.length ?? 0) > 0 ||
    (filters.invitationStatuses?.length ?? 0) > 0
  );
}

/** Quita facetas técnicas al limpiar preset o filtros de dashboard. */
export function withoutTechListFacetFilters(
  filters: CaseListQueryFilters,
): CaseListQueryFilters {
  return {
    ...filters,
    techPreset: null,
    techKpiStatuses: [],
    invitationStatuses: [],
    caseStatuses: [],
  };
}

/** Estado de facetas sin `q` (el buscador vive en `qInput` / debounce). */
export function toFacetOnlyFilters(filters: CaseListQueryFilters): CaseListQueryFilters {
  return { ...filters, q: '' };
}

function techKpiSetsEqual(a: TechKpiId[], b: readonly TechKpiId[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
}

/**
 * Si se quitó la pastilla de preset pero quedaron KPI derivados en memoria,
 * no deben seguir filtrando (p. ej. progreso excluye completado al buscar DF-1259).
 */
export function collapseStaleTechPresetDerivatives(
  filters: CaseListQueryFilters,
): CaseListQueryFilters {
  if (filters.techPreset) return filters;
  const techKpi = filters.techKpiStatuses ?? [];
  if (techKpi.length === 0) return filters;

  const derivedSignatures: readonly TechKpiId[][] = [
    ['invitacionPendiente'],
    ['cotizacionEnviada'],
    TECH_PROGRESS_KPI_STATUSES,
  ];

  for (const signature of derivedSignatures) {
    if (techKpiSetsEqual(techKpi, signature)) {
      return { ...filters, techKpiStatuses: [] };
    }
  }
  return filters;
}

/** Misma normalización para fetch, URL y SQL (preset → KPI, rol, etc.). */
export function prepareCaseListFiltersForQuery(
  role: 'dentista' | 'tecnico',
  filters: CaseListQueryFilters,
): CaseListQueryFilters {
  const q = normalizeSearchQuery(filters.q);
  let base = collapseStaleTechPresetDerivatives(filters);

  if (role === 'tecnico' && q.length > 0 && !hasTechListFacetFilters({ ...base, q: '' })) {
    base = withoutTechListFacetFilters(base);
  }

  return normalizeFiltersForRole(role, expandTechPreset({ ...base, q }));
}

export function hasActiveCaseListFilters(filters: CaseListQueryFilters): boolean {
  const f = filters;
  return (
    normalizeSearchQuery(f.q).length > 0 ||
    (f.caseStatuses?.length ?? 0) > 0 ||
    (f.techKpiStatuses?.length ?? 0) > 0 ||
    (f.invitationStatuses?.length ?? 0) > 0 ||
    (f.priorities?.length ?? 0) > 0 ||
    (f.serviceTypes?.length ?? 0) > 0 ||
    !!f.dateStart ||
    !!f.dateEnd ||
    !!f.offerDateStart ||
    !!f.offerDateEnd ||
    !!f.techPreset ||
    f.sortOrder === 'old'
  );
}

/** Filtros de listado al pulsar un KPI del dashboard (carrusel + /dashboard/cases). */
export function filtersFromDashboardMetricId(
  role: 'dentista' | 'tecnico',
  metricId: string,
): CaseListQueryFilters {
  if (metricId === 'total') {
    return { ...DEFAULT_CASE_LIST_FILTERS };
  }
  if (role === 'tecnico') {
    return normalizeFiltersForRole('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techKpiStatuses: [metricId as TechKpiId],
      techPreset: null,
    });
  }
  const dentistKpiToStatuses: Record<string, string[]> = {
    borrador: [CASE_STATUSES.BORRADOR],
    enEvaluacion: [CASE_STATUSES.EN_EVALUACION],
    propuestaLista: [CASE_STATUSES.PROPUESTA_LISTA],
    aceptadaPendienteInicio: [CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO],
    enEjecucion: [CASE_STATUSES.EN_EJECUCION],
    enRevision: [CASE_STATUSES.EN_REVISION, CASE_STATUSES.CAMBIOS_EN_PROCESO],
    disenoAprobado: [CASE_STATUSES.DISENO_APROBADO],
    enFabricacion: [CASE_STATUSES.EN_FABRICACION],
    enviado: [CASE_STATUSES.ENVIADO],
    completado: [CASE_STATUSES.COMPLETADO],
    cerrado: [CASE_STATUSES.CERRADO],
    pausado: [CASE_STATUSES.PAUSADO],
  };
  const statuses = dentistKpiToStatuses[metricId];
  if (!statuses?.length) {
    return { ...DEFAULT_CASE_LIST_FILTERS };
  }
  return {
    ...DEFAULT_CASE_LIST_FILTERS,
    caseStatuses: statuses,
    techPreset: null,
  };
}

export function countActiveCaseListFilters(filters: CaseListQueryFilters): number {
  let n = 0;
  if (filters.dateStart || filters.dateEnd) n++;
  if (filters.offerDateStart || filters.offerDateEnd) n++;
  if ((filters.priorities?.length ?? 0) > 0) n++;
  if ((filters.caseStatuses?.length ?? 0) > 0) n++;
  if ((filters.techKpiStatuses?.length ?? 0) > 0) n++;
  if ((filters.invitationStatuses?.length ?? 0) > 0) n++;
  if ((filters.serviceTypes?.length ?? 0) > 0) n++;
  if (filters.techPreset) n++;
  if (filters.sortOrder === 'old') n++;
  return n;
}
