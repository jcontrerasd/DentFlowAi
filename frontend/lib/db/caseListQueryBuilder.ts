import { db } from '@/lib/db';
import { clinicalCase, caseInvitation, organization } from '@/lib/db/schema';
import { alias } from 'drizzle-orm/pg-core';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { CASE_STATUSES } from '@/lib/constants/dental';
import {
  isExhaustiveTechKpiFilterSelection,
  normalizeSearchQuery,
  prepareCaseListFiltersForQuery,
  resolveCaseListViewRole,
  sanitizeTechKpiStatuses,
  type CaseListQueryFilters,
} from '@/lib/cases/caseListFilters';
import {
  WINNER_CASE_STATUSES_BY_TECH_KPI,
  type TechKpiId,
} from '@/lib/dashboard/classifyCaseForDashboardKpi';
import type { CaseListIdentity } from '@/lib/db/caseListVisibility';

const PRE_AWARD_STATUSES = [
  CASE_STATUSES.EN_EVALUACION,
  CASE_STATUSES.PROPUESTA_LISTA,
  'publicado',
  CASE_STATUSES.BORRADOR,
] as const;

function parseDateStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

function parseDateEnd(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999`);
}

/** Escapa % y _ para ILIKE literal (PostgreSQL). */
function escapeIlikeLiteral(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

function buildCaseListTextSearchWhere(q: string, isTech: boolean): SQL {
  const pattern = `%${escapeIlikeLiteral(q)}%`;
  const compact = q.replace(/-/g, '');
  const compactPattern = compact.length > 0 && compact !== q ? `%${escapeIlikeLiteral(compact)}%` : null;

  const caseNumberClauses: SQL[] = [ilike(clinicalCase.caseNumber, pattern)];
  if (compactPattern) {
    caseNumberClauses.push(ilike(clinicalCase.caseNumber, compactPattern));
  }

  const copiedFromMatch = sql`EXISTS (
    SELECT 1 FROM ${clinicalCase} as case_list_source
    WHERE ${clinicalCase.copiedFromCaseId} IS NOT NULL
      AND case_list_source.id = ${clinicalCase.copiedFromCaseId}
      AND (
        case_list_source.case_number ILIKE ${pattern}
        ${compactPattern ? sql`OR case_list_source.case_number ILIKE ${compactPattern}` : sql``}
      )
  )`;

  const textMatch = or(
    ilike(clinicalCase.internalName, pattern),
    ilike(clinicalCase.patientIdAnon, pattern),
    ...caseNumberClauses,
    sql`EXISTS (SELECT 1 FROM dental_material dm WHERE dm.id = ${clinicalCase.materialId} AND dm.label ILIKE ${pattern})`,
    sql`EXISTS (SELECT 1 FROM restoration_type rt WHERE rt.id = ${clinicalCase.restorationTypeId} AND rt.label ILIKE ${pattern})`,
    copiedFromMatch,
  )!;

  if (!isTech) return textMatch;

  const orgMatch = sql`EXISTS (
    SELECT 1 FROM "organization" as o
    WHERE o.id = ${clinicalCase.organizationId}
      AND o.name ILIKE ${pattern}
  )`;

  return or(textMatch, orgMatch)!;
}

function expandCaseStatusesForQuery(statuses: string[]): string[] {
  const set = new Set<string>();
  for (const s of statuses) {
    set.add(s);
    if (s === 'publicado') set.add('enEvaluacion');
    if (s === 'enRevision') set.add('cambiosEnProceso');
  }
  return [...set];
}

/** Filtros avanzados por fecha / cualquier invitación del técnico. */
function invitationExistsSubquery(
  technicianId: string,
  extra?: SQL,
  options?: { allowWithdrawn?: boolean },
) {
  const conditions: SQL[] = [
    eq(caseInvitation.clinicalCaseId, clinicalCase.id),
    eq(caseInvitation.technicianId, technicianId),
  ];
  if (!options?.allowWithdrawn) {
    conditions.push(ne(caseInvitation.status, 'withdrawn'));
  }
  if (extra) conditions.push(extra);
  return exists(
    db
      .select({ x: sql`1` })
      .from(caseInvitation)
      .where(and(...conditions)),
  );
}

function ciStatusIn(statuses: readonly string[]): SQL {
  return sql`ci.status IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`;
}

function ciStatusEq(status: string): SQL {
  return sql`ci.status = ${status}`;
}

/**
 * EXISTS sobre la invitación más reciente del técnico (updated_at), alineada con la ficha.
 */
function latestInvitationMatchesSubquery(
  technicianId: string,
  statusCondition?: SQL,
  options?: { allowWithdrawn?: boolean },
): SQL {
  const withdrawnClause = options?.allowWithdrawn ? sql`` : sql`AND ci.status <> 'withdrawn'`;
  const statusClause = statusCondition ? sql`AND (${statusCondition})` : sql``;

  return sql`EXISTS (
    SELECT 1 FROM case_invitation ci
    WHERE ci.clinical_case_id = ${clinicalCase.id}
      AND ci.technician_id = ${technicianId}
      ${withdrawnClause}
      ${statusClause}
      AND ci.updated_at = (
        SELECT MAX(ci2.updated_at)
        FROM case_invitation ci2
        WHERE ci2.clinical_case_id = ci.clinical_case_id
          AND ci2.technician_id = ci.technician_id
      )
  )`;
}

/** Ganador: espejo de `isTechnicianWinner` (assigned manda; confirmed solo sin assigned). */
function isTechWinnerSql(userId: string): SQL {
  return or(
    and(
      isNotNull(clinicalCase.assignedTechnicianId),
      eq(clinicalCase.assignedTechnicianId, userId),
    )!,
    and(
      isNull(clinicalCase.assignedTechnicianId),
      latestInvitationMatchesSubquery(userId, ciStatusIn(['accepted', 'confirmed'])),
      not(inArray(clinicalCase.status, [...PRE_AWARD_STATUSES])),
    )!,
  )!;
}

/** No ganador: forma explícita (no `NOT isTechWinnerSql` — falla con assigned NULL en SQL). */
function isNotTechWinnerSql(userId: string): SQL {
  return and(
    or(
      isNull(clinicalCase.assignedTechnicianId),
      not(eq(clinicalCase.assignedTechnicianId, userId)),
    )!,
    or(
      inArray(clinicalCase.status, [...PRE_AWARD_STATUSES]),
      not(latestInvitationMatchesSubquery(userId, ciStatusIn(['accepted', 'confirmed']))),
    )!,
  )!;
}

/** Espejo de `classifyTechnicianCaseKpi` para un bucket KPI. */
function buildSingleTechKpiClause(kpi: TechKpiId, userId: string): SQL {
  switch (kpi) {
    case 'invitacionPendiente':
      return and(
        isNotTechWinnerSql(userId),
        latestInvitationMatchesSubquery(userId, ciStatusEq('pending')),
      )!;

    case 'cotizacionEnviada':
      return and(
        isNotTechWinnerSql(userId),
        latestInvitationMatchesSubquery(userId, ciStatusIn(['quoted', 'accepted'])),
        inArray(clinicalCase.status, [...PRE_AWARD_STATUSES]),
      )!;

    case 'ofertaNoSeleccionada':
      return and(
        isNotTechWinnerSql(userId),
        or(
          latestInvitationMatchesSubquery(
            userId,
            ciStatusIn(['rejected', 'expired', 'withdrawn']),
            { allowWithdrawn: true },
          ),
          and(
            latestInvitationMatchesSubquery(userId, ciStatusEq('quoted')),
            not(inArray(clinicalCase.status, [...PRE_AWARD_STATUSES])),
          ),
          and(
            latestInvitationMatchesSubquery(userId, ciStatusEq('confirmed')),
            not(inArray(clinicalCase.status, [...PRE_AWARD_STATUSES])),
          ),
        )!,
      )!;

    case 'otros':
      return and(
        isTechWinnerSql(userId),
        not(
          or(
            ...Object.values(WINNER_CASE_STATUSES_BY_TECH_KPI).flatMap((statuses) =>
              statuses.length ? [inArray(clinicalCase.status, statuses)] : [],
            ),
          )!,
        ),
      )!;

    default: {
      const statuses = WINNER_CASE_STATUSES_BY_TECH_KPI[kpi];
      if (!statuses?.length) {
        return sql`false`;
      }
      return and(isTechWinnerSql(userId), inArray(clinicalCase.status, statuses))!;
    }
  }
}

/** Filtro por perspectiva técnico (KPI dashboard / ficha). */
export function buildTechKpiFilterWhere(techKpiIds: TechKpiId[], userId: string): SQL {
  const validIds = sanitizeTechKpiStatuses(techKpiIds);
  if (validIds.length === 0) return sql`false`;
  const clauses = validIds.map((kpi) => buildSingleTechKpiClause(kpi, userId));
  if (clauses.length === 1) return clauses[0]!;
  return or(...clauses)!;
}

export function buildCaseListFilterWhere(
  filtersInput: CaseListQueryFilters | undefined,
  identity: CaseListIdentity,
): SQL | undefined {
  if (!filtersInput) return undefined;

  const role = resolveCaseListViewRole(identity.role);
  const filters = prepareCaseListFiltersForQuery(role, filtersInput);
  const parts: SQL[] = [];
  const isTech = role === 'tecnico';
  const userId = identity.id;
  const techKpis = filters.techKpiStatuses ?? [];

  const q = normalizeSearchQuery(filters.q);
  if (q.length > 0) {
    parts.push(buildCaseListTextSearchWhere(q, isTech));
  }

  if (filters.priorities?.length) {
    parts.push(sql`EXISTS (SELECT 1 FROM urgency_level ul WHERE ul.id = ${clinicalCase.urgencyId} AND ul.label = ANY(${filters.priorities}))`);
  }

  if (filters.serviceTypes?.length) {
    parts.push(inArray(clinicalCase.serviceType, filters.serviceTypes));
  }

  if (filters.dateStart) {
    parts.push(gte(clinicalCase.createdAt, parseDateStart(filters.dateStart)));
  }
  if (filters.dateEnd) {
    parts.push(lte(clinicalCase.createdAt, parseDateEnd(filters.dateEnd)));
  }

  if (
    isTech &&
    techKpis.length > 0 &&
    !isExhaustiveTechKpiFilterSelection(techKpis)
  ) {
    parts.push(buildTechKpiFilterWhere(techKpis, userId));
  } else if (!isTech && filters.caseStatuses?.length) {
    const expanded = expandCaseStatusesForQuery(filters.caseStatuses);
    parts.push(inArray(clinicalCase.status, expanded));
  }

  if (isTech && filters.invitationStatuses?.length) {
    parts.push(
      latestInvitationMatchesSubquery(userId, ciStatusIn(filters.invitationStatuses)),
    );
  }

  if (isTech) {
    if (filters.offerDateStart) {
      parts.push(
        invitationExistsSubquery(
          userId,
          gte(caseInvitation.invitedAt, parseDateStart(filters.offerDateStart)),
        ),
      );
    }
    if (filters.offerDateEnd) {
      parts.push(
        invitationExistsSubquery(
          userId,
          lte(caseInvitation.invitedAt, parseDateEnd(filters.offerDateEnd)),
        ),
      );
    }
  }

  if (parts.length === 0) return undefined;
  return and(...parts);
}

export function buildCaseListOrderBy(filters: CaseListQueryFilters | undefined) {
  const sort = filters?.sortOrder ?? 'recent';
  return sort === 'old' ? asc(clinicalCase.createdAt) : desc(clinicalCase.createdAt);
}

export function buildTechFacetCondition(
  identity: CaseListIdentity,
  facet: 'nuevas' | 'cotizaciones' | 'progreso',
): SQL {
  const userId = identity.id;
  switch (facet) {
    case 'nuevas':
      return buildSingleTechKpiClause('invitacionPendiente', userId);
    case 'cotizaciones':
      return buildSingleTechKpiClause('cotizacionEnviada', userId);
    case 'progreso':
      return buildTechKpiFilterWhere(
        ['enEjecucion', 'enRevision', 'disenoAprobado', 'enFabricacion', 'enviado'],
        userId,
      );
    default:
      return sql`true`;
  }
}
