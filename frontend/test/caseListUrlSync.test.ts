import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CASE_LIST_FILTERS,
  prepareCaseListFiltersForQuery,
} from '@/lib/cases/caseListFilters';
import {
  filtersEqual,
  parseCaseListSearchParams,
  serializeCaseListFilters,
  shouldHydrateFiltersFromUrl,
  shouldPushFiltersToUrl,
} from '@/lib/cases/urlCaseListFilters';

describe('caseListUrlSync', () => {
  it('shouldHydrateFiltersFromUrl false cuando URL y estado efectivo coinciden', () => {
    const prepared = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      q: 'DF-1259',
    });
    expect(shouldHydrateFiltersFromUrl(prepared, prepared)).toBe(false);
    expect(filtersEqual(prepared, prepared)).toBe(true);
  });

  it('URL sin q y local con q adelantado: no hidratar (técnico con preset/KPI)', () => {
    const fromUrl = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: 'progreso',
      q: '',
    });
    const current = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: 'progreso',
      q: 'D',
    });
    expect(shouldHydrateFiltersFromUrl(fromUrl, current)).toBe(false);
  });

  it('misma query semántica con distinto orden de params (técnico)', () => {
    const state = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      q: 'DF-1259',
      techPreset: 'progreso',
    });
    const canonical = serializeCaseListFilters(state);
    const reordered = canonical.replace(/^\?/, '').split('&').reverse().join('&');
    const params = new URLSearchParams(reordered);
    const get = (key: string) => params.get(key);
    const fromUrl = prepareCaseListFiltersForQuery('tecnico', parseCaseListSearchParams({ get }));
    expect(filtersEqual(fromUrl, state)).toBe(true);
    expect(shouldHydrateFiltersFromUrl(fromUrl, state)).toBe(false);
  });

  it('shouldHydrateFiltersFromUrl true cuando URL trae preset y estado local no', () => {
    const fromUrl = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: 'progreso',
    });
    const current = prepareCaseListFiltersForQuery('tecnico', DEFAULT_CASE_LIST_FILTERS);
    expect(shouldHydrateFiltersFromUrl(fromUrl, current)).toBe(true);
  });

  it('round-trip parse + prepare alinea con serialize desde estado', () => {
    const state = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      q: 'DF-1259',
    });
    const qs = serializeCaseListFilters(state);
    const params = new URLSearchParams(qs.replace(/^\?/, ''));
    const get = (key: string) => params.get(key);
    const fromUrl = prepareCaseListFiltersForQuery('tecnico', parseCaseListSearchParams({ get }));
    expect(filtersEqual(fromUrl, state)).toBe(true);
  });

  it('no hidratar preset/KPI de URL si local busca sin facetas (técnico)', () => {
    const fromUrl = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: 'progreso',
      q: '',
    });
    const current = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      q: 'DF-1259',
    });
    expect(shouldHydrateFiltersFromUrl(fromUrl, current)).toBe(false);
  });

  it('shouldPushFiltersToUrl true si local busca sin facetas y URL aún tiene preset', () => {
    const fromUrl = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: 'progreso',
      q: '',
    });
    const local = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      q: 'DF-1259',
    });
    expect(shouldPushFiltersToUrl(fromUrl, local)).toBe(true);
    expect(serializeCaseListFilters(local)).toBe('?q=DF-1259');
  });

  it('shouldPushFiltersToUrl true cuando local lleva q y URL aún no', () => {
    const fromUrl = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: 'progreso',
      q: '',
    });
    const local = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: 'progreso',
      q: 'D',
    });
    expect(shouldPushFiltersToUrl(fromUrl, local)).toBe(true);
    expect(shouldHydrateFiltersFromUrl(fromUrl, local)).toBe(false);
  });

  it('una letra: serialize estable tras prepare', () => {
    const prepared = prepareCaseListFiltersForQuery('dentista', {
      ...DEFAULT_CASE_LIST_FILTERS,
      q: 'D',
    });
    expect(serializeCaseListFilters(prepared)).toBe('?q=D');
  });
});
