import type { AssignmentItem } from '@/lib/db/actions/assignments';

type AssignmentRow = Omit<AssignmentItem, 'archivedByCurrentUser'>;

export function applyAssignmentArchiveFlags(
  assignments: AssignmentRow[],
  archivedCaseIds: string[],
): AssignmentItem[] {
  const archived = new Set(archivedCaseIds);
  return assignments.map((a) => ({
    ...a,
    archivedByCurrentUser: archived.has(a.caseId),
  }));
}

/** @deprecated */
export const applyInvitationArchiveFlags = applyAssignmentArchiveFlags;
