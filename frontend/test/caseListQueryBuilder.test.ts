import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({})),
      })),
    })),
  },
}));

import {
  buildCaseListFilterWhere,
  buildCaseListOrderBy,
  buildTechFacetCondition,
} from '@/lib/db/caseListQueryBuilder';
import { CASE_STATUSES } from '@/lib/constants/dental';

const techIdentity = { id: 'tech-1', role: 'tecnico' as const, orgId: 'org-t' };
const dentistIdentity = { id: 'd1', role: 'dentista' as const, orgId: 'org-d' };

describe('caseListQueryBuilder', () => {
  it('buildCaseListFilterWhere sin filtros devuelve undefined', () => {
    expect(buildCaseListFilterWhere(undefined, dentistIdentity)).toBeUndefined();
    expect(buildCaseListFilterWhere({}, dentistIdentity)).toBeUndefined();
  });

  it('buildCaseListFilterWhere con q devuelve SQL', () => {
    const where = buildCaseListFilterWhere({ q: 'PAC-2048' }, dentistIdentity);
    expect(where).toBeDefined();
  });

  it('preset nuevas técnico genera condición', () => {
    const where = buildCaseListFilterWhere(
      { techPreset: 'nuevas' },
      techIdentity,
    );
    expect(where).toBeDefined();
  });

  it('preset progreso técnico asigna estados activos', () => {
    const where = buildCaseListFilterWhere(
      { techPreset: 'progreso' },
      techIdentity,
    );
    expect(where).toBeDefined();
  });

  it('buildCaseListOrderBy respeta sort old', () => {
    const recent = buildCaseListOrderBy({ sortOrder: 'recent' });
    const old = buildCaseListOrderBy({ sortOrder: 'old' });
    expect(recent).toBeDefined();
    expect(old).toBeDefined();
    expect(recent).not.toEqual(old);
  });

  it('buildTechFacetCondition devuelve SQL por facet', () => {
    expect(buildTechFacetCondition(techIdentity, 'nuevas')).toBeDefined();
    expect(buildTechFacetCondition(techIdentity, 'cotizaciones')).toBeDefined();
    const progreso = buildTechFacetCondition(techIdentity, 'progreso');
    expect(progreso).toBeDefined();
  });

  it('filtro estado publicado expande en query dentista', () => {
    const where = buildCaseListFilterWhere(
      { caseStatuses: ['publicado'] },
      dentistIdentity,
    );
    expect(where).toBeDefined();
  });

  it('técnico techKpi aceptadaPendienteInicio genera where (ganador)', () => {
    const where = buildCaseListFilterWhere(
      { techKpiStatuses: ['aceptadaPendienteInicio'] },
      techIdentity,
    );
    expect(where).toBeDefined();
  });

  it('técnico techKpi ofertaNoSeleccionada genera where', () => {
    const where = buildCaseListFilterWhere(
      { techKpiStatuses: ['ofertaNoSeleccionada'] },
      techIdentity,
    );
    expect(where).toBeDefined();
  });

  it('legacy status en URL técnico se ignora sin techKpi en query builder directo', () => {
    const where = buildCaseListFilterWhere(
      { caseStatuses: [CASE_STATUSES.EN_EVALUACION] },
      techIdentity,
    );
    expect(where).toBeUndefined();
  });

  it('prioridades y serviceTypes generan where', () => {
    const where = buildCaseListFilterWhere(
      {
        priorities: ['alta'],
        serviceTypes: ['solo_diseno'],
        caseStatuses: [CASE_STATUSES.PROPUESTA_LISTA],
      },
      dentistIdentity,
    );
    expect(where).toBeDefined();
  });

  it('técnico con q DF-1259 genera where (búsqueda texto)', () => {
    const where = buildCaseListFilterWhere({ q: 'DF-1259' }, techIdentity);
    expect(where).toBeDefined();
  });

  it('técnico con q y preset progreso genera where (filtro + búsqueda)', () => {
    const whereOnlyQ = buildCaseListFilterWhere({ q: 'DF-1259' }, techIdentity);
    const whereQAndPreset = buildCaseListFilterWhere(
      { q: 'DF-1259', techPreset: 'progreso' },
      techIdentity,
    );
    expect(whereOnlyQ).toBeDefined();
    expect(whereQAndPreset).toBeDefined();
  });

  it('técnico con q y techKpi completado genera where', () => {
    const where = buildCaseListFilterWhere(
      { q: 'DF-1259', techKpiStatuses: ['completado'] },
      techIdentity,
    );
    expect(where).toBeDefined();
  });
});
