import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CASE_LIST_FILTERS,
  DENTIST_FILTERABLE_CASE_STATUSES,
  DENTIST_STATUS_FILTER_EXCEPTIONS,
  DENTIST_STATUS_FILTER_MAIN_TIMELINE,
  caseStatusFilterLabel,
  expandTechPreset,
  filtersFromDashboardMetricId,
  hasActiveCaseListFilters,
  isExhaustiveTechKpiFilterSelection,
  normalizeFiltersForRole,
  normalizeSearchQuery,
  prepareCaseListFiltersForQuery,
  sanitizeTechKpiStatuses,
  TECH_FILTERABLE_KPI_IDS,
  TECH_KPI_FILTER_EXCEPTIONS,
  TECH_KPI_FILTER_MAIN_TIMELINE,
} from '@/lib/cases/caseListFilters';
import { CASE_STATUSES } from '@/lib/constants/dental';
import {
  clearCaseListFilters,
  filtersEqual,
  parseCaseListSearchParams,
  serializeCaseListFilters,
} from '@/lib/cases/urlCaseListFilters';

describe('caseListFilters', () => {
  it('normalizeSearchQuery recorta y colapsa espacios', () => {
    expect(normalizeSearchQuery('  foo   bar  ')).toBe('foo bar');
    expect(normalizeSearchQuery('')).toBe('');
  });

  it('expandTechPreset nuevas fija techKpi invitacionPendiente', () => {
    const expanded = expandTechPreset({ ...DEFAULT_CASE_LIST_FILTERS, techPreset: 'nuevas' });
    expect(expanded.techKpiStatuses).toEqual(['invitacionPendiente']);
    expect(expanded.invitationStatuses).toEqual([]);
    expect(expanded.caseStatuses).toEqual([]);
  });

  it('expandTechPreset progreso incluye KPIs de trabajo activo', () => {
    const expanded = expandTechPreset({ ...DEFAULT_CASE_LIST_FILTERS, techPreset: 'progreso' });
    expect(expanded.techKpiStatuses?.length).toBeGreaterThan(0);
    expect(expanded.caseStatuses).toEqual([]);
  });

  it('normalizeFiltersForRole migra caseStatuses legacy a techKpi', () => {
    const normalized = normalizeFiltersForRole('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      caseStatuses: ['aceptadaPendienteInicio'],
    });
    expect(normalized.techKpiStatuses).toContain('aceptadaPendienteInicio');
    expect(normalized.caseStatuses).toEqual([]);
  });

  it('sanitizeTechKpiStatuses ignora ids inválidos', () => {
    expect(sanitizeTechKpiStatuses(['ofertaNoSeleccionada', 'esperandoInicio', 'enEjecucion'])).toEqual(
      ['ofertaNoSeleccionada', 'enEjecucion'],
    );
  });

  it('selección exhaustiva de KPIs técnicos se trata como sin filtro KPI', () => {
    expect(isExhaustiveTechKpiFilterSelection([...TECH_FILTERABLE_KPI_IDS])).toBe(true);
    const normalized = normalizeFiltersForRole('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techKpiStatuses: [...TECH_FILTERABLE_KPI_IDS],
    });
    expect(normalized.techKpiStatuses).toEqual([]);
  });

  it('normalizeFiltersForRole técnico con techKpi limpia invitationStatuses', () => {
    const normalized = normalizeFiltersForRole('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techKpiStatuses: ['ofertaNoSeleccionada'],
      invitationStatuses: ['pending'],
    });
    expect(normalized.invitationStatuses).toEqual([]);
  });

  it('normalizeFiltersForRole dentista elimina techKpi', () => {
    const normalized = normalizeFiltersForRole('dentista', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techKpiStatuses: ['invitacionPendiente'],
    });
    expect(normalized.techKpiStatuses).toEqual([]);
  });

  it('filtersFromDashboardMetricId técnico usa techKpi', () => {
    const f = filtersFromDashboardMetricId('tecnico', 'aceptadaPendienteInicio');
    expect(f.techKpiStatuses).toEqual(['aceptadaPendienteInicio']);
  });

  it('hasActiveCaseListFilters detecta búsqueda y preset', () => {
    expect(hasActiveCaseListFilters(DEFAULT_CASE_LIST_FILTERS)).toBe(false);
    expect(hasActiveCaseListFilters({ ...DEFAULT_CASE_LIST_FILTERS, q: 'x' })).toBe(true);
    expect(hasActiveCaseListFilters({ ...DEFAULT_CASE_LIST_FILTERS, techPreset: 'nuevas' })).toBe(
      true,
    );
    expect(
      hasActiveCaseListFilters({
        ...DEFAULT_CASE_LIST_FILTERS,
        techKpiStatuses: ['cotizacionEnviada'],
      }),
    ).toBe(true);
  });
});

describe('urlCaseListFilters', () => {
  it('roundtrip parse y serialize con techKpi', () => {
    const params = new URLSearchParams(
      'q=lab&techKpi=aceptadaPendienteInicio,enEjecucion&preset=progreso&priority=alta&sort=old',
    );
    const parsed = parseCaseListSearchParams(params);
    expect(parsed.q).toBe('lab');
    expect(parsed.techKpiStatuses).toEqual(['aceptadaPendienteInicio', 'enEjecucion']);
    expect(parsed.techPreset).toBe('progreso');
    expect(parsed.priorities).toEqual(['alta']);
    expect(parsed.sortOrder).toBe('old');

    const serialized = serializeCaseListFilters(parsed);
    expect(serialized).toContain('techKpi=aceptadaPendienteInicio');
    expect(serialized).toContain('preset=progreso');
  });

  it('dentista serializa status no techKpi', () => {
    const serialized = serializeCaseListFilters({
      ...DEFAULT_CASE_LIST_FILTERS,
      caseStatuses: ['propuestaLista'],
    });
    expect(serialized).toContain('status=propuestaLista');
    expect(serialized).not.toContain('techKpi');
  });

  it('filtersEqual compara serialización', () => {
    const a = { ...DEFAULT_CASE_LIST_FILTERS, q: 'test' };
    const b = { ...DEFAULT_CASE_LIST_FILTERS, q: 'test' };
    expect(filtersEqual(a, b)).toBe(true);
    expect(filtersEqual(a, clearCaseListFilters())).toBe(false);
  });

  it('timeline dentista cubre todos los estados filtrables sin duplicados', () => {
    const union = [...DENTIST_STATUS_FILTER_MAIN_TIMELINE, ...DENTIST_STATUS_FILTER_EXCEPTIONS];
    expect(new Set(union).size).toBe(union.length);
    expect([...union].sort()).toEqual([...DENTIST_FILTERABLE_CASE_STATUSES].sort());
  });

  it('timeline técnico cubre todos los KPI filtrables sin duplicados', () => {
    const union = [...TECH_KPI_FILTER_MAIN_TIMELINE, ...TECH_KPI_FILTER_EXCEPTIONS];
    expect(new Set(union).size).toBe(union.length);
    expect([...union].sort()).toEqual([...TECH_FILTERABLE_KPI_IDS].sort());
  });

  it('caseStatusFilterLabel distingue cambios en proceso de en revisión', () => {
    expect(caseStatusFilterLabel(CASE_STATUSES.CAMBIOS_EN_PROCESO)).toBe('Cambios en proceso');
    expect(caseStatusFilterLabel(CASE_STATUSES.EN_REVISION)).toBe('En Revisión');
  });

  describe('prepareCaseListFiltersForQuery', () => {
    it('técnico con q solo no añade KPI de preset', () => {
      const prepared = prepareCaseListFiltersForQuery('tecnico', {
        ...DEFAULT_CASE_LIST_FILTERS,
        q: 'DF-1259',
      });
      expect(prepared.q).toBe('DF-1259');
      expect(prepared.techKpiStatuses).toEqual([]);
      expect(prepared.techPreset).toBeNull();
    });

    it('técnico con q y preset progreso expande KPI de progreso (AND)', () => {
      const prepared = prepareCaseListFiltersForQuery('tecnico', {
        ...DEFAULT_CASE_LIST_FILTERS,
        q: 'DF-1259',
        techPreset: 'progreso',
      });
      expect(prepared.q).toBe('DF-1259');
      expect(prepared.techKpiStatuses).toContain('enEjecucion');
      expect(prepared.techKpiStatuses).not.toContain('completado');
    });

    it('técnico con q mantiene techKpi explícito completado', () => {
      const prepared = prepareCaseListFiltersForQuery('tecnico', {
        ...DEFAULT_CASE_LIST_FILTERS,
        q: 'DF-1259',
        techKpiStatuses: ['completado'],
      });
      expect(prepared.techKpiStatuses).toEqual(['completado']);
    });

    it('técnico: KPI colgados de preset progreso sin techPreset + q → sin KPI (DF-1259)', () => {
      const prepared = prepareCaseListFiltersForQuery('tecnico', {
        ...DEFAULT_CASE_LIST_FILTERS,
        techPreset: null,
        techKpiStatuses: [
          'enEjecucion',
          'enRevision',
          'disenoAprobado',
          'enFabricacion',
          'enviado',
        ],
        q: 'DF-1259',
      });
      expect(prepared.techKpiStatuses).toEqual([]);
      expect(prepared.techPreset).toBeNull();
    });

    it('dentista con q y status conserva caseStatuses', () => {
      const prepared = prepareCaseListFiltersForQuery('dentista', {
        ...DEFAULT_CASE_LIST_FILTERS,
        q: 'PAC-1',
        caseStatuses: [CASE_STATUSES.COMPLETADO],
      });
      expect(prepared.caseStatuses).toContain(CASE_STATUSES.COMPLETADO);
      expect(prepared.techKpiStatuses).toEqual([]);
    });

    it('serialize(parse(url)) alinea con prepare desde estado equivalente', () => {
      const params = new URLSearchParams('q=DF-1259&preset=progreso');
      const get = (key: string) => params.get(key);
      const fromUrl = prepareCaseListFiltersForQuery('tecnico', parseCaseListSearchParams({ get }));
      const fromState = prepareCaseListFiltersForQuery('tecnico', {
        ...DEFAULT_CASE_LIST_FILTERS,
        q: 'DF-1259',
        techPreset: 'progreso',
      });
      expect(serializeCaseListFilters(fromUrl)).toBe(serializeCaseListFilters(fromState));
    });
  });
});
