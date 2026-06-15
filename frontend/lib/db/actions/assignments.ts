'use server';

import { canActAsTecnico } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import {
  caseAssignment,
  clinicalCase,
  file,
  organization,
  dentalMaterial,
  restorationType,
  urgencyLevel,
} from '@/lib/db/schema';
import { eq, and, desc, ne, inArray } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { getSignedUrl } from '@/lib/gcs';
import { getArchivedCaseIdsForUser } from '@/lib/db/caseUserArchiveHelpers';
import { applyAssignmentArchiveFlags } from '@/lib/assignments/assignmentArchiveFlags';

export type AssignmentStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export type AssignmentItem = {
  id: string;
  caseId: string;
  caseNumber: string | null;
  internalName: string | null;
  restorationType: string | null;
  material: string | null;
  urgency: string | null;
  caseComplexity: string | null;
  serviceType: string | null;
  status: AssignmentStatus;
  assignedAt: Date;
  expiresAt: Date | null;
  compensation: number | null;
  deadlineDays: number | null;
  deadlineHours: number | null;
  respondedAt?: Date | null;
  isAssigned: boolean;
  caseStatus: string;
  teeth: unknown;
  organizationName?: string | null;
  patientIdAnon?: string | null;
  createdAt?: Date;
  files?: unknown[];
  archivedByCurrentUser: boolean;
};

/** @deprecated */
export type InvitationItem = AssignmentItem;
/** @deprecated */
export type InvitationStatus = AssignmentStatus;

function mapRow(
  r: {
    id: string;
    status: string;
    assignedAt: Date;
    expiresAt: Date | null;
    compensation: number | null;
    deadlineDays: number | null;
    deadlineHours: number | null;
    respondedAt: Date | null;
    caseId: string;
    caseNumber: string | null;
    internalName: string | null;
    restorationType: string | null;
    material: string | null;
    urgency: string | null;
    caseComplexity: string | null;
    serviceType: string | null;
    caseStatus: string;
    assignedTechnicianId: string | null;
    teeth: unknown;
    organizationName: string | null;
    createdAt: Date;
    patientIdAnon: string | null;
  },
  technicianId: string,
  files: unknown[],
): AssignmentItem {
  return {
    id: r.id,
    caseId: r.caseId,
    caseNumber: r.caseNumber,
    internalName: r.internalName,
    restorationType: r.restorationType,
    material: r.material,
    urgency: r.urgency,
    caseComplexity: r.caseComplexity,
    serviceType: r.serviceType,
    status: r.status as AssignmentStatus,
    assignedAt: r.assignedAt,
    expiresAt: r.expiresAt,
    compensation: r.compensation,
    deadlineDays: r.deadlineDays,
    deadlineHours: r.deadlineHours,
    respondedAt: r.respondedAt,
    isAssigned: r.assignedTechnicianId === technicianId && r.status === 'accepted',
    caseStatus: r.caseStatus,
    teeth: r.teeth,
    organizationName: r.organizationName,
    createdAt: r.createdAt,
    patientIdAnon: r.patientIdAnon,
    files: (files as { clinicalCaseId?: string }[]).filter((f) => f.clinicalCaseId === r.caseId),
    archivedByCurrentUser: false,
  };
}

const assignmentSelect = {
  id: caseAssignment.id,
  status: caseAssignment.status,
  assignedAt: caseAssignment.assignedAt,
  expiresAt: caseAssignment.expiresAt,
  compensation: caseAssignment.compensation,
  deadlineDays: caseAssignment.deadlineDays,
  deadlineHours: caseAssignment.deadlineHours,
  respondedAt: caseAssignment.respondedAt,
  caseId: clinicalCase.id,
  caseNumber: clinicalCase.caseNumber,
  internalName: clinicalCase.internalName,
  restorationType: restorationType.label,
  material: dentalMaterial.label,
  urgency: urgencyLevel.label,
  caseComplexity: clinicalCase.caseComplexity,
  serviceType: clinicalCase.serviceType,
  caseStatus: clinicalCase.status,
  assignedTechnicianId: clinicalCase.assignedTechnicianId,
  teeth: clinicalCase.teeth,
  organizationName: organization.name,
  createdAt: clinicalCase.createdAt,
  patientIdAnon: clinicalCase.patientIdAnon,
};

export async function getMyAssignmentsAction(): Promise<AssignmentItem[]> {
  const identity = await getServerIdentity();
  if (!identity?.id || !canActAsTecnico(identity.role)) return [];

  try {
    const rows = await db
      .select(assignmentSelect)
      .from(caseAssignment)
      .innerJoin(clinicalCase, eq(caseAssignment.clinicalCaseId, clinicalCase.id))
      .leftJoin(organization, eq(clinicalCase.organizationId, organization.id))
      .leftJoin(dentalMaterial, eq(dentalMaterial.id, clinicalCase.materialId))
      .leftJoin(restorationType, eq(restorationType.id, clinicalCase.restorationTypeId))
      .leftJoin(urgencyLevel, eq(urgencyLevel.id, clinicalCase.urgencyId))
      .where(eq(caseAssignment.technicianId, identity.id))
      .orderBy(desc(caseAssignment.assignedAt));

    const caseIds = rows.map((r) => r.caseId);
    const allFiles =
      caseIds.length > 0
        ? await db.select().from(file).where(inArray(file.clinicalCaseId, caseIds))
        : [];

    const mapped = rows.map((r) => mapRow(r, identity.id as string, allFiles));
    const archivedCaseIds = await getArchivedCaseIdsForUser(identity.id as string);
    return applyAssignmentArchiveFlags(mapped, archivedCaseIds);
  } catch (error) {
    console.error('[getMyAssignmentsAction] Error:', error);
    return [];
  }
}

/** @deprecated */
export const getMyInvitationsAction = getMyAssignmentsAction;

export async function getMyAssignmentForCaseAction(
  caseId: string,
): Promise<{ success: boolean; data: AssignmentItem | null; error?: string }> {
  const identity = await getServerIdentity();
  if (!identity?.id || !canActAsTecnico(identity.role)) {
    return { success: false, data: null, error: 'No autorizado' };
  }

  try {
    const [row] = await db
      .select(assignmentSelect)
      .from(caseAssignment)
      .innerJoin(clinicalCase, eq(caseAssignment.clinicalCaseId, clinicalCase.id))
      .leftJoin(dentalMaterial, eq(dentalMaterial.id, clinicalCase.materialId))
      .leftJoin(restorationType, eq(restorationType.id, clinicalCase.restorationTypeId))
      .leftJoin(urgencyLevel, eq(urgencyLevel.id, clinicalCase.urgencyId))
      .leftJoin(organization, eq(clinicalCase.organizationId, organization.id))
      .where(
        and(
          eq(caseAssignment.clinicalCaseId, caseId),
          eq(caseAssignment.technicianId, identity.id),
        ),
      )
      .orderBy(desc(caseAssignment.assignedAt))
      .limit(1);

    if (!row) return { success: true, data: null };

    const files = await db.select().from(file).where(eq(file.clinicalCaseId, caseId));
    const item = mapRow(row, identity.id as string, files);
    const archived = await getArchivedCaseIdsForUser(identity.id as string);
    const [withArchive] = applyAssignmentArchiveFlags([item], archived);
    return { success: true, data: withArchive };
  } catch (error) {
    console.error('[getMyAssignmentForCaseAction] Error:', error);
    return { success: false, data: null, error: String(error) };
  }
}

/** @deprecated */
export const getMyInvitationForCaseAction = getMyAssignmentForCaseAction;

export async function getAssignmentDetailsAction(assignmentId: string) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };

  try {
    const [row] = await db
      .select({
        assignment: caseAssignment,
        case: clinicalCase,
        restorationType: restorationType.label,
        material: dentalMaterial.label,
        urgency: urgencyLevel.label,
      })
      .from(caseAssignment)
      .innerJoin(clinicalCase, eq(caseAssignment.clinicalCaseId, clinicalCase.id))
      .leftJoin(dentalMaterial, eq(dentalMaterial.id, clinicalCase.materialId))
      .leftJoin(restorationType, eq(restorationType.id, clinicalCase.restorationTypeId))
      .leftJoin(urgencyLevel, eq(urgencyLevel.id, clinicalCase.urgencyId))
      .where(eq(caseAssignment.id, assignmentId))
      .limit(1);

    if (!row) return { success: false, error: 'Asignación no encontrada' };
    if (row.assignment.technicianId !== identity.id && identity.role !== 'admin') {
      return { success: false, error: 'No autorizado' };
    }

    const caseFiles = await db
      .select()
      .from(file)
      .where(eq(file.clinicalCaseId, row.case.id));

    const canAccessDesignFiles =
      row.assignment.status === 'accepted' || row.case.assignedTechnicianId === identity.id;

    const signedFiles = await Promise.all(
      caseFiles.map(async (f) => {
        const isScan = f.category === 'scan' || f.mimeType?.includes('model');
        if (!isScan && !canAccessDesignFiles) return { ...f, url: null, restricted: true };
        const url = f.gcsPath ? await getSignedUrl(f.gcsPath) : null;
        return { ...f, url, restricted: false };
      }),
    );

    return {
      success: true,
      assignment: row.assignment,
      case: {
        ...row.case,
        restorationType: row.restorationType,
        material: row.material,
        urgency: row.urgency,
        desiredDeliveryAt: row.case.desiredDeliveryAt,
      },
      files: signedFiles,
    };
  } catch (error) {
    console.error('[getAssignmentDetailsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

/** @deprecated */
export const getInvitationDetailsAction = getAssignmentDetailsAction;
