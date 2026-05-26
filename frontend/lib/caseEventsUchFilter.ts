import { tecnicoSeesVisibleToTecnicoEvent } from '@/lib/uchEventVisibility';

/** Eventos internos del algoritmo ocultos al dentista en UCH (alineado con getCaseEventsAction). */
export const LEGACY_DENTIST_HIDDEN = new Set([
  'CASO_CLASIFICADO',
  'INVITACION_ENVIADA',
  'COTIZACION_RECIBIDA',
  'SELECCION_FALLIDA',
  'FAUCHARD_PRESENTACION_CERRADA',
  'REINTENTO_SELECCION',
  'OFERTAS_COMPARATIVAS_LISTAS',
  'PROPUESTA_GENERADA',
]);

export type UchFilterIdentity = { id: string; role: string };

export type UchFilterTargetCase = {
  assignedTechnicianId: string | null | undefined;
  doctorId: string | null | undefined;
};

export type UchFilterableEvent = {
  type: string;
  action: string;
  userId: string;
  payload: unknown;
};

/**
 * Misma regla de visibilidad que getCaseEventsAction antes de enriquecer payload / firmar avatares.
 */
export function filterCaseEventsForUchViewer<T extends UchFilterableEvent>(
  events: readonly T[],
  identity: UchFilterIdentity,
  targetCase: UchFilterTargetCase | null | undefined,
  currentInvitationId: string | null,
): T[] {
  return events.filter((event) => {
    if (identity.role === 'admin') return true;

    const payload = event.payload as Record<string, unknown> | null | undefined;
    const visibleTo = payload?.visibleTo as string | undefined;

    if (visibleTo === 'sistema') return false;

    if (identity.role === 'dentista') {
      if (LEGACY_DENTIST_HIDDEN.has(event.action)) return false;
      if (visibleTo) return visibleTo === 'dentista' || visibleTo === 'ambos';
      return true;
    }

    if (payload?.dentistOnly) return false;
    if (visibleTo === 'dentista') return false;
    if (visibleTo === 'ambos') return true;

    if (visibleTo === 'tecnico') {
      return tecnicoSeesVisibleToTecnicoEvent({
        eventUserId: event.userId,
        invitationIdFromPayload: payload?.invitationId as string | undefined,
        viewerTechnicianId: identity.id,
        currentInvitationId,
        assignedTechnicianId: targetCase?.assignedTechnicianId,
        doctorId: targetCase?.doctorId,
      });
    }

    const isAssignedToOther =
      targetCase?.assignedTechnicianId && targetCase.assignedTechnicianId !== identity.id;
    if (isAssignedToOther) {
      return (
        event.userId === identity.id ||
        (payload?.technicianId as string | undefined) === identity.id
      );
    }
    if (event.type === 'sistema') return true;
    if (event.userId === identity.id) return true;
    if ((payload?.technicianId as string | undefined) === identity.id) return true;
    return false;
  });
}
