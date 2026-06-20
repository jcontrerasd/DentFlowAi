'use server';

import { db } from '@/lib/db';
import { clinicalCase, caseAssignment } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
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

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(clinicalCase)
    .where(whereClause);

  const totalCases = Number(countRow?.count ?? 0);
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

    if (process.env.NODE_ENV !== 'production') {
      assertMetricsPartition(metrics, totalCases, 'getDashboardMetricsAction:dentista');
    }

    return { role: 'dentista', metrics, totalCases, serverNowMs };
  }

  if (isCalidad) {
    // Por caso, además del estado, si este revisor ya envió su calificación
    // (review dimension='quality'): un completado sin review cae en "Por calificar".
    const rows = await db
      .select({
        status: clinicalCase.status,
        hasQualityReview: sql<boolean>`EXISTS (
          SELECT 1 FROM review r
          WHERE r.clinical_case_id = ${clinicalCase.id}
            AND r.reviewer_id = ${identity.id as string}
            AND r.dimension = 'quality'
        )`,
      })
      .from(clinicalCase)
      .where(whereClause);

    const metrics = initEmptyMetrics(CALIDAD_DASHBOARD_METRICS);
    for (const row of rows) {
      const kpiId = classifyCalidadCaseKpi(row.status, row.hasQualityReview);
      metrics[kpiId] = (metrics[kpiId] ?? 0) + 1;
    }

    return { role: 'calidad', metrics, totalCases, serverNowMs };
  }

  const caseRows = await db
    .select({
      id: clinicalCase.id,
      status: clinicalCase.status,
      assignedTechnicianId: clinicalCase.assignedTechnicianId,
    })
    .from(clinicalCase)
    .where(whereClause);

  const invRows = await db
    .select({
      clinicalCaseId: caseAssignment.clinicalCaseId,
      status: caseAssignment.status,
      updatedAt: caseAssignment.updatedAt,
      assignedAt: caseAssignment.assignedAt,
    })
    .from(caseAssignment)
    .where(eq(caseAssignment.technicianId, identity.id as string));

  const invByCase = buildInvitationStatusByCaseId(invRows);

  const metrics = initEmptyMetrics(TECH_DASHBOARD_METRICS);
  const techId = identity.id as string;

  for (const c of caseRows) {
    const kpiId = classifyTechnicianCaseKpi({
      caseStatus: c.status,
      assignedTechnicianId: c.assignedTechnicianId,
      technicianUserId: techId,
      invitationStatus: invByCase.get(c.id) ?? null,
    });
    metrics[kpiId] = (metrics[kpiId] ?? 0) + 1;
  }

  if (process.env.NODE_ENV !== 'production') {
    assertMetricsPartition(metrics, totalCases, 'getDashboardMetricsAction:tecnico');
  }

  return { role: 'tecnico', metrics, totalCases, serverNowMs };
}
