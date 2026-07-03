/**
 * Presentación del Hub Clínico Unificado (UCH): Fauchard como única cara
 * hacia el otro rol. Los datos en BD (userId real) se conservan para auditoría;
 * admin sigue viendo identidades reales.
 */


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

  // Invitación/asignación a cotizar o trabajar: siempre orquestación de Fauchard, sin
  // excepción — el técnico nunca "escribió" este mensaje, solo es el destinatario al que
  // pertenece la fila en BD. A diferencia del split de CASO_PUBLICADO (donde el dentista
  // sí realizó la acción real), aquí el userId persistido coincidiendo con el viewer NO
  // significa que el viewer sea el autor. Soporta el alias legacy en BD ('INVITACION_RECIBIDA').
  if (
    viewer.role === 'tecnico' &&
    (event.action === 'ASIGNACION_RECIBIDA' || event.action === 'INVITACION_RECIBIDA') &&
    (payload.visibleTo === 'tecnico' || payload.visibleTo === undefined)
  ) {
    return true;
  }

  if (payload.presentationAuthor === 'fauchard') {
    // Para eventos visibles a AMBOS roles, el autor real no debe verse enmascarado como
    // Fauchard ante sí mismo — solo el otro rol lo ve así. NO extender esta excepción a
    // visibleTo de un solo rol (ej. 'tecnico'): esa coincidencia también se da en eventos
    // donde el viewer es solo el destinatario, nunca el autor (ej. ASIGNACION_RECIBIDA,
    // ASIGNACION_EXPIRADA — el userId persistido es "de quién es la fila", no "quién la
    // escribió"). El split de CASO_PUBLICADO no depende de este unmask: trabaja directo
    // con `event.userId` (nunca tocado por el masking) en `uchCasoPublicadoSplit.ts`.
    const persistedActorId = event.userId;
    const visibleTo = payload.visibleTo as string | undefined;
    if (
      visibleTo === 'ambos' &&
      persistedActorId &&
      String(persistedActorId) === String(viewer.id)
    ) {
      return false;
    }
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

  if (viewer.role === 'calidad') {
    // El técnico es anónimo para Calidad: sus entregas se presentan como Fauchard.
    if (authorRole === 'tecnico') return true;
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

  if (viewerRole === 'dentista' || viewerRole === 'calidad') {
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
