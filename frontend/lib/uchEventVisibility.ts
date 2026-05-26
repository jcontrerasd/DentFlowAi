/**
 * Reglas de visibilidad UCH compartidas (tests + server) para eventos con visibleTo === 'tecnico'.
 * El dentista asignado emite feedback con userId del dentista; el técnico asignado debe verlo
 * aunque no haya invitationId en el payload.
 */
export function tecnicoSeesVisibleToTecnicoEvent(params: {
  eventUserId: string;
  invitationIdFromPayload: string | undefined;
  viewerTechnicianId: string;
  currentInvitationId: string | null;
  assignedTechnicianId: string | null | undefined;
  doctorId: string | null | undefined;
}): boolean {
  const {
    eventUserId,
    invitationIdFromPayload,
    viewerTechnicianId,
    currentInvitationId,
    assignedTechnicianId,
    doctorId,
  } = params;

  // Con invitación conocida en BD/props: acotar al hilo de esa invitación.
  if (invitationIdFromPayload && currentInvitationId) {
    return invitationIdFromPayload === currentInvitationId;
  }

  // invitationId en payload pero aún sin fila de invitación resuelta (p. ej. hidratación):
  // los eventos típicos (INVITACION_RECIBIDA, OFERTA_ENVIADA) llevan userId del técnico.
  if (invitationIdFromPayload && !currentInvitationId) {
    if (eventUserId === viewerTechnicianId) return true;
    const isAssignedViewer = assignedTechnicianId === viewerTechnicianId;
    const isFromCaseDoctor = !!doctorId && eventUserId === doctorId;
    if (isAssignedViewer && isFromCaseDoctor) return true;
    return false;
  }

  if (eventUserId === viewerTechnicianId) return true;

  const isAssignedViewer = assignedTechnicianId === viewerTechnicianId;
  const isFromCaseDoctor = !!doctorId && eventUserId === doctorId;
  if (isAssignedViewer && isFromCaseDoctor) return true;

  return false;
}
