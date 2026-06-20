/**
 * Presentación del Hub Clínico Unificado (UCH): Fauchard como única cara
 * hacia el otro rol. Los datos en BD (userId real) se conservan para auditoría;
 * admin sigue viendo identidades reales.
 */

import { CASE_EVENTS } from '@/lib/constants/caseEvents';

export const UCH_FAUCHARD_PUBLIC_USER = {
  id: '__fauchard__',
  fullName: 'Fauchard',
  role: 'sistema',
  image: null as string | null,
} as const;

/** Marca un evento para que el destinatario vea a Fauchard como emisor (voz orquestada). */
export const UCH_PAYLOAD_PRESENTATION_FAUCHARD = {
  presentationAuthor: 'fauchard' as const,
};

type UchViewer = { id: string; role: string };

type UchEventLike = {
  userId: string;
  /** Acción UCH; usada p. ej. para invitación legacy (mismo userId que el técnico viewer). */
  action?: string;
  user?: { id: string; fullName: string | null; role: string | null; image?: string | null } | null;
  payload: unknown;
};

export function shouldPresentUchEventAsFauchard(
  event: UchEventLike,
  viewer: UchViewer,
  caseDoctorId: string | null
): boolean {
  if (viewer.role === 'admin') return false;

  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (payload.presentationAuthor === 'fauchard') {
    // Para eventos visibles a ambos roles (ej. REVISION_SOLICITADA), el autor real
    // no debe verse enmascarado como Fauchard — solo el otro rol lo ve así.
    // Eventos visibles solo a un rol (ej. ASIGNACION_RECIBIDA visibleTo:'tecnico')
    // mantienen el enmascarado aunque userId === viewer.id.
    const persistedActorId = event.userId;
    const visibleTo = payload.visibleTo as string | undefined;
    // No enmascarar cuando el viewer ES el autor real del evento.
    // Cubre 'ambos' (ej. REVISION_SOLICITADA) y eventos cuya visibilidad
    // coincide con el rol del viewer (ej. CASO_PUBLICADO con visibleTo:'dentista'
    // visto por el dentista autor, o visibleTo:'tecnico' por el técnico autor).
    const visibleToMatchesViewer =
      visibleTo === 'ambos' ||
      (visibleTo === 'dentista' && viewer.role === 'dentista') ||
      (visibleTo === 'tecnico' && viewer.role === 'tecnico');
    if (
      visibleToMatchesViewer &&
      persistedActorId &&
      String(persistedActorId) === String(viewer.id)
    ) {
      return false;
    }
    return true;
  }

  /** Invitación a cotizar: orquestación; en BD userId puede ser el técnico sin presentationAuthor. */
  if (
    viewer.role === 'tecnico' &&
    event.action === CASE_EVENTS.INVITACION_RECIBIDA &&
    (payload.visibleTo === 'tecnico' || payload.visibleTo === undefined)
  ) {
    return true;
  }

  const persistedActorId = event.userId;
  if (persistedActorId && String(persistedActorId) === String(viewer.id)) return false;

  const authorRole = event.user?.role ?? null;
  const authorId = event.user?.id ?? event.userId;

  if (viewer.role === 'dentista') {
    if (!caseDoctorId || viewer.id !== caseDoctorId) return false;
    if (authorRole === 'tecnico') return true;
    const vt = payload.visibleTo as string | undefined;
    if (vt === 'dentista' && String(authorId) !== String(viewer.id)) return true;
    if (vt === 'ambos' && authorRole === 'tecnico') return true;
    return false;
  }

  if (viewer.role === 'tecnico') {
    if (authorRole === 'dentista') return true;
    // Calidad es anónima para el técnico: sus eventos se presentan como Fauchard.
    if (authorRole === 'calidad') return true;
    const vt = payload.visibleTo as string | undefined;
    if (
      (vt === 'tecnico' || vt === 'ambos') &&
      caseDoctorId &&
      String(authorId) === String(caseDoctorId) &&
      String(authorId) !== String(viewer.id)
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/** Elimina metadatos internos y datos cruzados antes de enviar el payload al cliente. */
export function sanitizeUchPayloadForViewer(
  payload: unknown,
  viewerRole: string
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const raw = { ...(payload as Record<string, unknown>) };
  delete raw.presentationAuthor;

  // Identidad del revisor de Calidad: nunca se filtra a dentista ni técnico (Calidad es anónima).
  if (viewerRole !== 'admin' && viewerRole !== 'calidad') {
    delete raw.calidadUserId;
    delete raw.fromCalidadId;
    delete raw.toCalidadId;
    delete raw.qualityReviewerId;
  }

  if (viewerRole === 'dentista') {
    delete raw.technicianId;
    delete raw.revieweeId;
  }

  if (viewerRole === 'tecnico') {
    if ('feedbackDentista' in raw) {
      raw.comentarioDelSolicitante = raw.feedbackDentista;
      delete raw.feedbackDentista;
    }
    if (typeof raw.reason === 'string' && raw.reason && !raw.comentarioDelSolicitante) {
      raw.comentarioDelSolicitante = raw.reason;
    }
    delete raw.reason;
    delete raw.doctorId;
  }

  return raw;
}
