import type { InvitationItem } from '@/lib/db/actions/invitations';

type InvitationRow = Omit<InvitationItem, 'archivedByCurrentUser'>;

export function applyInvitationArchiveFlags(
  assignments: InvitationRow[],
  archivedCaseIds: string[],
): InvitationItem[] {
  const archived = new Set(archivedCaseIds);
  return assignments.map((inv) => ({
    ...inv,
    archivedByCurrentUser: archived.has(inv.caseId),
  }));
}
