import {
  DEFAULT_CASE_LIST_FILTERS,
  hasTechListFacetFilters,
  normalizeSearchQuery,
  sanitizeTechKpiStatuses,
  type CaseListQueryFilters,
  type InvitationStatusFilter,
  type TechListPreset,
} from '@/lib/cases/caseListFilters';

const PRESETS = new Set<TechListPreset>(['nuevas', 'cotizaciones', 'progreso']);

function splitParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseCaseListSearchParams(params: {
  get: (key: string) => string | null;
}): CaseListQueryFilters {
  const presetRaw = params.get('preset');
  const techPreset =
    presetRaw && PRESETS.has(presetRaw as TechListPreset) ? (presetRaw as TechListPreset) : null;

  return {
    q: params.get('q') ?? '',
    caseStatuses: splitParam(params.get('status')),
    techKpiStatuses: sanitizeTechKpiStatuses(splitParam(params.get('techKpi'))),
    invitationStatuses: splitParam(params.get('invStatus')) as InvitationStatusFilter[],
    priorities: splitParam(params.get('priority')),
    serviceTypes: splitParam(params.get('service')),
    dateStart: params.get('dateStart') ?? '',
    dateEnd: params.get('dateEnd') ?? '',
    offerDateStart: params.get('offerStart') ?? '',
    offerDateEnd: params.get('offerEnd') ?? '',
    techPreset,
    sortOrder: params.get('sort') === 'old' ? 'old' : 'recent',
  };
}

export function serializeCaseListFilters(filters: CaseListQueryFilters): string {
  const p = new URLSearchParams();
  const q = (filters.q ?? '').trim();
  if (q) p.set('q', q);
  if (filters.techKpiStatuses?.length) {
    p.set('techKpi', filters.techKpiStatuses.join(','));
  } else if (filters.caseStatuses?.length) {
    p.set('status', filters.caseStatuses.join(','));
  }
  if (filters.invitationStatuses?.length) p.set('invStatus', filters.invitationStatuses.join(','));
  if (filters.priorities?.length) p.set('priority', filters.priorities.join(','));
  if (filters.serviceTypes?.length) p.set('service', filters.serviceTypes.join(','));
  if (filters.dateStart) p.set('dateStart', filters.dateStart);
  if (filters.dateEnd) p.set('dateEnd', filters.dateEnd);
  if (filters.offerDateStart) p.set('offerStart', filters.offerDateStart);
  if (filters.offerDateEnd) p.set('offerEnd', filters.offerDateEnd);
  if (filters.techPreset) p.set('preset', filters.techPreset);
  if (filters.sortOrder === 'old') p.set('sort', 'old');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function filtersEqual(a: CaseListQueryFilters, b: CaseListQueryFilters): boolean {
  return serializeCaseListFilters(a) === serializeCaseListFilters(b);
}

/**
 * true cuando la URL (ya preparada) difiere del estado efectivo y debe pisar filtros + qInput.
 * false si la única diferencia es `q` adelantado en local (debounce antes de router.replace).
 */
export function shouldHydrateFiltersFromUrl(
  fromUrl: CaseListQueryFilters,
  currentEffective: CaseListQueryFilters,
): boolean {
  if (filtersEqual(fromUrl, currentEffective)) return false;

  const fromQ = normalizeSearchQuery(fromUrl.q);
  const currentQ = normalizeSearchQuery(currentEffective.q);
  const qAheadOfUrl =
    fromQ !== currentQ &&
    currentQ.length > fromQ.length &&
    currentQ.startsWith(fromQ);

  if (qAheadOfUrl) {
    const alignedFromUrl = { ...fromUrl, q: currentEffective.q };
    if (filtersEqual(alignedFromUrl, currentEffective)) return false;
  }

  // URL con preset/KPI viejo (p. ej. ?preset=progreso) no debe reaplicarse mientras se busca
  // con facetas locales ya limpias — excluiría casos completados visibles sin buscar.
  if (
    currentQ.length > 0 &&
    !hasTechListFacetFilters(currentEffective) &&
    hasTechListFacetFilters(fromUrl)
  ) {
    return false;
  }

  return true;
}

/**
 * true cuando el estado local debe escribirse en la URL (router.replace).
 * false si la URL ya va adelante (p. ej. atrás/adelante del navegador) — hidratar, no pisar.
 */
export function shouldPushFiltersToUrl(
  fromUrl: CaseListQueryFilters,
  localEffective: CaseListQueryFilters,
): boolean {
  if (filtersEqual(fromUrl, localEffective)) return false;

  const fromQ = normalizeSearchQuery(fromUrl.q);
  const localQ = normalizeSearchQuery(localEffective.q);
  const qAheadOfLocal =
    fromQ !== localQ &&
    fromQ.length > localQ.length &&
    fromQ.startsWith(localQ);

  if (qAheadOfLocal) {
    const alignedLocal = { ...localEffective, q: fromUrl.q };
    if (filtersEqual(alignedLocal, fromUrl)) return false;
  }

  return true;
}

export function clearCaseListFilters(): CaseListQueryFilters {
  return { ...DEFAULT_CASE_LIST_FILTERS };
}
