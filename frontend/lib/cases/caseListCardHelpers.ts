/** Mapea invitación del viewer (listCases) al shape que espera MarketplaceCaseCard. */
export function mapViewerInvitationForCard(
  viewerInvitation: Record<string, unknown> | null | undefined,
  caseRow: { assignedTechnicianId?: string | null; id?: string },
  technicianUserId: string,
) {
  if (!viewerInvitation) return undefined;
  return {
    ...viewerInvitation,
    status: viewerInvitation.status,
    isWinner:
      viewerInvitation.isWinner === true ||
      (caseRow.assignedTechnicianId != null &&
        String(caseRow.assignedTechnicianId) === String(technicianUserId)),
    createdAt: viewerInvitation.invitedAt ?? viewerInvitation.createdAt,
    invitedAt: viewerInvitation.invitedAt,
  };
}

export function buildInvitationPropForCard(
  viewerInvitation: Record<string, unknown> | null | undefined,
) {
  if (!viewerInvitation || viewerInvitation.status !== 'pending') return undefined;
  return viewerInvitation;
}
