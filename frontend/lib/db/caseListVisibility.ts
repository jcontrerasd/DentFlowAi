import { db } from '@/lib/db';
import { clinicalCase, caseInvitation } from '@/lib/db/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { canActAsTecnico } from '@/lib/auth-helpers';
import {
  archiveVisibilityForUser,
  getArchivedCaseIdsForUser,
} from '@/lib/db/caseUserArchiveHelpers';

export type CaseListIdentity = {
  id: string;
  role: string;
  orgId: string | null;
};

/** Campos mínimos del caso para comprobar acceso (ficha, UCH, eventos). */
export type ClinicalCaseAccessRow = {
  organizationId: string | null;
  doctorId: string | null;
  status: string;
  assignedTechnicianId: string | null;
};

export type CaseAccessIdentity = CaseListIdentity & {
  isSystemAdmin?: boolean;
};

/**
 * Misma regla que `buildActiveCaseVisibilityWhere` para un caso concreto
 * (evita que un dentista de la org abra por URL casos de otro colega).
 */
export async function userCanAccessClinicalCase(
  identity: CaseAccessIdentity,
  caseId: string,
  caseRow: ClinicalCaseAccessRow,
): Promise<boolean> {
  if (identity.isSystemAdmin) return true;

  const { role, orgId, id: userId } = identity;

  if (canActAsTecnico(role) && role !== 'admin') {
    if (caseRow.assignedTechnicianId === userId) return true;
    const [inv] = await db
      .select({ id: caseInvitation.id })
      .from(caseInvitation)
      .where(
        and(
          eq(caseInvitation.clinicalCaseId, caseId),
          eq(caseInvitation.technicianId, userId),
        ),
      )
      .limit(1);
    return !!inv;
  }

  if (role === 'admin') {
    return orgId != null && caseRow.organizationId === orgId;
  }

  if (!orgId || caseRow.organizationId !== orgId) return false;
  return caseRow.doctorId === userId || caseRow.status === 'publicado';
}

/**
 * Misma visibilidad que listCasesByOrganization / KPIs del dashboard (casos activos).
 */
export async function buildActiveCaseVisibilityWhere(
  identity: CaseListIdentity,
  showArchived = false,
) {
  const archivedCaseIds = await getArchivedCaseIdsForUser(identity.id);
  const archiveFilter = archiveVisibilityForUser(
    identity.id,
    showArchived,
    archivedCaseIds,
  );

  const { role, orgId, id: userId } = identity;

  if (canActAsTecnico(role) && role !== 'admin') {
    const techInvs = await db
      .select({ caseId: caseInvitation.clinicalCaseId })
      .from(caseInvitation)
      .where(eq(caseInvitation.technicianId, userId));

    const techCaseIds = techInvs.map((i) => i.caseId);

    return and(
      archiveFilter,
      or(
        eq(clinicalCase.assignedTechnicianId, userId),
        techCaseIds.length > 0 ? inArray(clinicalCase.id, techCaseIds) : sql`false`,
      ),
    );
  }

  if (orgId) {
    if (role === 'admin') {
      return and(eq(clinicalCase.organizationId, orgId), archiveFilter);
    }
    return and(
      eq(clinicalCase.organizationId, orgId),
      archiveFilter,
      or(
        eq(clinicalCase.doctorId, userId),
        eq(clinicalCase.status, 'publicado'),
      ),
    );
  }

  return sql`false`;
}
