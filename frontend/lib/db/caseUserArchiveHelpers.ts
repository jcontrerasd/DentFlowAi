import { db } from '@/lib/db';
import { caseUserArchive, clinicalCase, caseInvitation } from '@/lib/db/schema';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  CASE_STATUSES,
  isTerminalCaseStatus,
  TECH_ARCHIVE_INVITATION_STATUSES,
} from '@/lib/constants/dental';
import { canActAsDentista, canActAsTecnico } from '@/lib/auth-helpers';

/** IDs de casos archivados por el usuario (evita EXISTS correlacionado con alias de Drizzle). */
export async function getArchivedCaseIdsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ clinicalCaseId: caseUserArchive.clinicalCaseId })
    .from(caseUserArchive)
    .where(eq(caseUserArchive.userId, userId));
  return rows.map((r) => r.clinicalCaseId);
}

/**
 * Filtro listados: activos vs pestaña archivados del usuario actual.
 * Devuelve `undefined` si no hay restricción (sin filas archivadas y showArchived=false).
 */
export function archiveVisibilityForUser(
  userId: string,
  showArchived: boolean,
  archivedCaseIds: string[],
) {
  if (archivedCaseIds.length === 0) {
    return showArchived ? sql`false` : undefined;
  }
  return showArchived
    ? inArray(clinicalCase.id, archivedCaseIds)
    : notInArray(clinicalCase.id, archivedCaseIds);
}

export async function isCaseArchivedByUser(caseId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: caseUserArchive.userId })
    .from(caseUserArchive)
    .where(
      and(
        eq(caseUserArchive.userId, userId),
        eq(caseUserArchive.clinicalCaseId, caseId),
      ),
    )
    .limit(1);
  return !!row;
}

type CaseRow = {
  status: string;
  doctorId: string | null;
  assignedTechnicianId: string | null;
};

export async function assertUserMayArchiveCase(
  caseId: string,
  userId: string,
  role: string,
): Promise<{ ok: true; caseRow: CaseRow } | { ok: false; error: string }> {
  const [caseRow] = await db
    .select({
      status: clinicalCase.status,
      doctorId: clinicalCase.doctorId,
      assignedTechnicianId: clinicalCase.assignedTechnicianId,
    })
    .from(clinicalCase)
    .where(eq(clinicalCase.id, caseId))
    .limit(1);

  if (!caseRow) return { ok: false, error: 'Caso no encontrado' };

  if (canActAsDentista(role) || role === 'admin') {
    if (caseRow.doctorId !== userId && role !== 'admin') {
      return { ok: false, error: 'No autorizado' };
    }
    if (!isTerminalCaseStatus(caseRow.status)) {
      return { ok: false, error: 'Solo puedes archivar casos finalizados' };
    }
    return { ok: true, caseRow };
  }

  if (canActAsTecnico(role)) {
    if (caseRow.status === CASE_STATUSES.COMPLETADO && caseRow.assignedTechnicianId === userId) {
      return { ok: true, caseRow };
    }
    const [inv] = await db
      .select({ status: caseInvitation.status })
      .from(caseInvitation)
      .where(
        and(
          eq(caseInvitation.clinicalCaseId, caseId),
          eq(caseInvitation.technicianId, userId),
        ),
      )
      .orderBy(desc(caseInvitation.invitedAt))
      .limit(1);

    const invStatus = inv?.status;
    if (
      invStatus &&
      (TECH_ARCHIVE_INVITATION_STATUSES as readonly string[]).includes(invStatus)
    ) {
      return { ok: true, caseRow };
    }
    return { ok: false, error: 'Tu participación en este caso aún está activa' };
  }

  return { ok: false, error: 'No autorizado' };
}
