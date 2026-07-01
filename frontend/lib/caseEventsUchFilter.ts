import { tecnicoSeesVisibleToTecnicoEvent } from '@/lib/uchEventVisibility';

/** Eventos internos del algoritmo ocultos al dentista en UCH (alineado con getCaseEventsAction). */
export const LEGACY_DENTIST_HIDDEN = new Set([
  'CASO_CLASIFICADO',
  'COTIZACION_RECIBIDA',
  'SELECCION_FALLIDA',
  'FAUCHARD_PRESENTACION_CERRADA',
  'REINTENTO_SELECCION',
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

    // Calidad ve todo el hilo de su caso asignado, con excepciones específicas.
    if (identity.role === 'calidad') {
      // Los eventos de derivación solo los ven los dos participantes directos (origen y destino).
      if (
        event.action === 'CASO_DERIVADO_CALIDAD' ||
        event.action === 'DERIVACION_CALIDAD_ACEPTADA' ||
        event.action === 'DERIVACION_CALIDAD_RECHAZADA'
      ) {
        const p = event.payload as Record<string, unknown> | null | undefined;
        const fromId = p?.fromCalidadId as string | undefined;
        const toId = p?.toCalidadId as string | undefined;
        const me = String(identity.id);
        return (fromId != null && String(fromId) === me) || (toId != null && String(toId) === me);
      }
      return true;
    }

    const payload = event.payload as Record<string, unknown> | null | undefined;
    const visibleTo = payload?.visibleTo as string | undefined;

    if (visibleTo === 'sistema') return false;
    if (visibleTo === 'calidad') return false;

    if (identity.role === 'dentista') {
      if (LEGACY_DENTIST_HIDDEN.has(event.action)) return false;
      if (visibleTo) return visibleTo === 'dentista' || visibleTo === 'ambos';
      return true;
    }

    if (payload?.dentistOnly) return false;
    if (visibleTo === 'dentista') return false;

    // Calificaciones del dentista: visibles SOLO al técnico calificado (ganador), nunca a
    // otros técnicos invitados/perdedores. El dentista autor las ve por su rama de arriba;
    // admin por el early-return. Funciona con eventos antiguos sin revieweeId (fallback al
    // técnico asignado del caso).
    if (event.action === 'CALIFICACION_ENVIADA' || event.action === 'CALIFICACION_ENVIADA_CALIDAD') {
      const revieweeId =
        (payload?.revieweeId as string | undefined) ?? targetCase?.assignedTechnicianId ?? null;
      return revieweeId != null && String(revieweeId) === String(identity.id);
    }

    if (visibleTo === 'ambos') return true;

    if (visibleTo === 'tecnico') {
      // Eventos de la etapa de Calidad: el técnico asignado los ve (Calidad es anónima/Fauchard
      // para él). Autoría = revisor de Calidad, sin invitationId, por eso se gatean por este marker.
      if (payload?.qualityScoped) {
        return !!targetCase?.assignedTechnicianId
          && String(targetCase.assignedTechnicianId) === String(identity.id);
      }
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
