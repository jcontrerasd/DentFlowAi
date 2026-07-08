'use server';

import { db } from '@/lib/db';
import { clinicalCase, caseAssignment, review } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { isQualityGateEnabled } from '@/lib/constants/qualityFlags';
import { getServerIdentity } from './impersonation';
import { perfLog, perfStart } from '@/lib/perfLog';
import { buildActiveCaseVisibilityWhere } from '@/lib/db/caseListVisibility';
import { canActAsTecnico, canActAsDentista } from '@/lib/auth-helpers';
import {
  classifyDentistCaseKpi,
  classifyTechnicianCaseKpi,
  assertMetricsPartition,
} from '@/lib/dashboard/classifyCaseForDashboardKpi';
import { buildInvitationStatusByCaseId } from '@/lib/cases/technicianInvitationForKpi';
import {
  DENTIST_DASHBOARD_METRICS,
  TECH_DASHBOARD_METRICS,
  CALIDAD_DASHBOARD_METRICS,
  classifyCalidadCaseKpi,
  initEmptyMetrics,
} from '@/lib/dashboard/dashboardMetricsConfig';

export type DashboardMetricsResult = {
  role: 'dentista' | 'tecnico' | 'calidad';
  metrics: Record<string, number>;
  totalCases: number;
  serverNowMs: number;
};

export async function getDashboardMetricsAction(): Promise<DashboardMetricsResult | null> {
  const t0 = perfStart();
  const identity = await getServerIdentity();
  if (!identity?.id) return null;

  const role = identity.role as string;
  const isTech = canActAsTecnico(role) && role !== 'admin';
  const isDentist = canActAsDentista(role) && !isTech;
  const isCalidad = role === 'calidad';

  if (!isDentist && !isTech && !isCalidad) {
    return null;
  }

  const whereClause = await buildActiveCaseVisibilityWhere({
    id: identity.id as string,
    role,
    orgId: identity.orgId ?? null,
  });

  const serverNowMs = Date.now();

  if (isDentist) {
    const rows = await db
      .select({ status: clinicalCase.status })
      .from(clinicalCase)
      .where(whereClause);

    const metrics = initEmptyMetrics(DENTIST_DASHBOARD_METRICS);
    for (const row of rows) {
      const kpiId = classifyDentistCaseKpi(row.status);
      metrics[kpiId] = (metrics[kpiId] ?? 0) + 1;
    }
    const totalCases = rows.length;

    if (process.env.NODE_ENV !== 'production') {
      assertMetricsPartition(metrics, totalCases, 'getDashboardMetricsAction:dentista');
    }

    perfLog('getDashboardMetricsAction', Date.now() - t0, { role: 'dentista', totalCases });
    return { role: 'dentista', metrics, totalCases, serverNowMs };
  }

  if (isCalidad) {
    const qualityGateOn = await isQualityGateEnabled();
    const rows = await db
      .select({ id: clinicalCase.id, status: clinicalCase.status })
      .from(clinicalCase)
      .where(whereClause);

    let qualityRatedIds = new Set<string>();
    if (qualityGateOn) {
      const completedIds = rows.filter((r) => r.status === 'completado').map((r) => r.id);
      if (completedIds.length > 0) {
        const rated = await db
          .select({ clinicalCaseId: review.clinicalCaseId })
          .from(review)
          .where(and(inArray(review.clinicalCaseId, completedIds), eq(review.dimension, 'quality')));
        qualityRatedIds = new Set(rated.map((r) => r.clinicalCaseId));
      }
    }

    const metrics = initEmptyMetrics(CALIDAD_DASHBOARD_METRICS);
    for (const row of rows) {
      const hasQualityReview = qualityGateOn ? qualityRatedIds.has(row.id) : undefined;
      const kpiId = classifyCalidadCaseKpi(row.status, hasQualityReview);
      metrics[kpiId] = (metrics[kpiId] ?? 0) + 1;
    }

    perfLog('getDashboardMetricsAction', Date.now() - t0, { role: 'calidad', totalCases: rows.length });
    return { role: 'calidad', metrics, totalCases: rows.length, serverNowMs };
  }

  // Técnico: LEFT JOIN con case_assignment para eliminar la segunda query y el join JS
  const techId = identity.id as string;
  const joinedRows = await db
    .select({
      id: clinicalCase.id,
      status: clinicalCase.status,
      assignedTechnicianId: clinicalCase.assignedTechnicianId,
      invStatus: caseAssignment.status,
      invUpdatedAt: caseAssignment.updatedAt,
      invAssignedAt: caseAssignment.assignedAt,
    })
    .from(clinicalCase)
    .leftJoin(
      caseAssignment,
      and(
        eq(caseAssignment.clinicalCaseId, clinicalCase.id),
        eq(caseAssignment.technicianId, techId),
      ),
    )
    .where(whereClause);

  const invByCase = buildInvitationStatusByCaseId(
    joinedRows
      .filter(r => r.invStatus != null)
      .map(r => ({
        clinicalCaseId: r.id,
        status: r.invStatus!,
        updatedAt: r.invUpdatedAt,
        invitedAt: r.invAssignedAt,
      })),
  );

  const metrics = initEmptyMetrics(TECH_DASHBOARD_METRICS);
  for (const c of joinedRows) {
    const kpiId = classifyTechnicianCaseKpi({
      caseStatus: c.status,
      assignedTechnicianId: c.assignedTechnicianId,
      technicianUserId: techId,
      invitationStatus: invByCase.get(c.id) ?? null,
    });
    metrics[kpiId] = (metrics[kpiId] ?? 0) + 1;
  }

  const totalCases = joinedRows.length;
  if (process.env.NODE_ENV !== 'production') {
    assertMetricsPartition(metrics, totalCases, 'getDashboardMetricsAction:tecnico');
  }

  perfLog('getDashboardMetricsAction', Date.now() - t0, { role: 'tecnico', totalCases });
  return { role: 'tecnico', metrics, totalCases, serverNowMs };
}
