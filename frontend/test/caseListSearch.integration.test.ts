/**
 * Integración BD: búsqueda técnico DF-1259 (caso UAT Lab E2E 3).
 * Requiere RUN_DB_INTEGRATION_TESTS=true y DATABASE_URL.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import { clinicalCase, caseInvitation } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import {
  DEFAULT_CASE_LIST_FILTERS,
  prepareCaseListFiltersForQuery,
} from '@/lib/cases/caseListFilters';
import { buildCaseListFilterWhere } from '@/lib/db/caseListQueryBuilder';
import { buildActiveCaseVisibilityWhere } from '@/lib/db/caseListVisibility';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const TECH_UAT_ID = 'tech-uat-001';
const CASE_NUMBER = 'DF-1259';

describe.runIf(runIntegration)('caseListSearch integration', () => {
  let caseId: string;

  beforeAll(async () => {
    const [row] = await db
      .select({ id: clinicalCase.id })
      .from(clinicalCase)
      .where(eq(clinicalCase.caseNumber, CASE_NUMBER))
      .limit(1);
    if (!row) throw new Error(`Caso ${CASE_NUMBER} no encontrado en BD`);
    caseId = row.id;

    const [inv] = await db
      .select({ id: caseInvitation.id })
      .from(caseInvitation)
      .where(
        and(
          eq(caseInvitation.clinicalCaseId, caseId),
          eq(caseInvitation.technicianId, TECH_UAT_ID),
        ),
      )
      .limit(1);
    if (!inv) throw new Error(`Sin invitación ${TECH_UAT_ID} en ${CASE_NUMBER}`);
  });

  it('visibilidad + q solo devuelve DF-1259 para tech-uat-001', async () => {
    const identity = { id: TECH_UAT_ID, role: 'tecnico', orgId: '77777777-7777-7777-7777-777777777777' };
    const filters = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      q: CASE_NUMBER,
    });
    expect(filters.techKpiStatuses).toEqual([]);
    expect(filters.techPreset).toBeNull();

    const visibilityWhere = await buildActiveCaseVisibilityWhere(identity, false);
    const filterWhere = buildCaseListFilterWhere(filters, identity);
    const whereClause = filterWhere ? and(visibilityWhere, filterWhere) : visibilityWhere;

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clinicalCase)
      .where(whereClause!);

    expect(Number(countRow?.count ?? 0)).toBeGreaterThanOrEqual(1);

    const [hit] = await db
      .select({ id: clinicalCase.id })
      .from(clinicalCase)
      .where(and(whereClause!, eq(clinicalCase.caseNumber, CASE_NUMBER)))
      .limit(1);
    expect(hit?.id).toBe(caseId);
  });

  it('q + preset progreso excluye caso completado DF-1259', async () => {
    const identity = { id: TECH_UAT_ID, role: 'tecnico', orgId: '77777777-7777-7777-7777-777777777777' };
    const filters = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      q: CASE_NUMBER,
      techPreset: 'progreso',
    });
    expect(filters.techKpiStatuses).not.toContain('completado');

    const visibilityWhere = await buildActiveCaseVisibilityWhere(identity, false);
    const filterWhere = buildCaseListFilterWhere(filters, identity);
    const whereClause = and(visibilityWhere, filterWhere)!;

    const [hit] = await db
      .select({ id: clinicalCase.id })
      .from(clinicalCase)
      .where(and(whereClause, eq(clinicalCase.caseNumber, CASE_NUMBER)))
      .limit(1);
    expect(hit).toBeUndefined();
  });

  it('KPI colgados de progreso sin preset + q se colapsan y encuentran DF-1259', async () => {
    const identity = { id: TECH_UAT_ID, role: 'tecnico', orgId: '77777777-7777-7777-7777-777777777777' };
    const filters = prepareCaseListFiltersForQuery('tecnico', {
      ...DEFAULT_CASE_LIST_FILTERS,
      techPreset: null,
      techKpiStatuses: ['enEjecucion', 'enRevision', 'disenoAprobado', 'enFabricacion', 'enviado'],
      q: CASE_NUMBER,
    });
    expect(filters.techKpiStatuses).toEqual([]);

    const visibilityWhere = await buildActiveCaseVisibilityWhere(identity, false);
    const filterWhere = buildCaseListFilterWhere(filters, identity);
    const whereClause = filterWhere ? and(visibilityWhere, filterWhere) : visibilityWhere;

    const [hit] = await db
      .select({ id: clinicalCase.id })
      .from(clinicalCase)
      .where(and(whereClause!, eq(clinicalCase.caseNumber, CASE_NUMBER)))
      .limit(1);
    expect(hit?.id).toBe(caseId);
  });
});
