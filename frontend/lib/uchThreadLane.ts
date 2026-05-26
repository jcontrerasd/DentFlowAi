/**
 * Carril del hilo UCH (izquierda = hilo / recibido, derecha = propio) y cuándo la cabecera
 * debe mostrarse como voz Fauchard. Tablas A (dentista) y B (técnico) codificadas de forma explícita.
 */

import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_FAUCHARD_PUBLIC_USER } from '@/lib/uchPresentation';
import { UCH_SELF_HALF_PAYLOAD_KEY } from '@/lib/uchCasoPublicadoSplit';

const FAUCHARD_PUBLIC_ID = UCH_FAUCHARD_PUBLIC_USER.id;

export type UchThreadLane = 'thread' | 'self';

export type UchThreadLaneEvent = {
  userId?: string;
  type: string;
  action: string;
  payload: unknown;
  user?: { id: string; fullName?: string | null; role?: string | null; image?: string | null } | null;
};

function resolvePersistedAuthorId(event: UchThreadLaneEvent): string | undefined {
  if (event.userId) return event.userId;
  const uid = event.user?.id;
  if (uid && uid !== FAUCHARD_PUBLIC_ID) return uid;
  return undefined;
}

export type UchThreadLaneViewer = {
  actingAsDentista: boolean;
  actingAsTecnico: boolean;
  currentUserId: string | undefined;
  /** Admin sin simulación: supervisión con layout clínico (tabla A). */
  viewingAsAdmin?: boolean;
  /** Si dentista y técnico son ambos true, fuerza qué tabla A/B usar en el UCH. */
  uchPresentationRole?: 'dentista' | 'tecnico';
};

function primaryPresentationRole(viewer: UchThreadLaneViewer): 'dentista' | 'tecnico' {
  if (viewer.viewingAsAdmin) return 'dentista';
  if (viewer.uchPresentationRole === 'dentista' || viewer.uchPresentationRole === 'tecnico') {
    return viewer.uchPresentationRole;
  }
  if (viewer.actingAsDentista && !viewer.actingAsTecnico) return 'dentista';
  if (viewer.actingAsTecnico && !viewer.actingAsDentista) return 'tecnico';
  if (viewer.actingAsDentista && viewer.actingAsTecnico) return 'tecnico';
  return 'dentista';
}

/**
 * Tabla A (dentista) y Tabla B (técnico): primera coincidencia por rol gana.
 * Casos clave: TRABAJO_INICIADO al dentista con `presentationAuthor: fauchard` → hilo + Fauchard;
 * cierres comparativa al técnico (`visibleTo: tecnico`) → hilo + Fauchard;
 * emisiones propias del técnico (cotización, entrega, etc.) → carril propio.
 */
export function resolveUchThreadLane(
  event: UchThreadLaneEvent,
  viewer: UchThreadLaneViewer,
): { lane: UchThreadLane; showAsFauchard: boolean } {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const visibleTo = typeof payload.visibleTo === 'string' ? payload.visibleTo : undefined;
  const presentationAuthor = payload.presentationAuthor === 'fauchard' ? 'fauchard' : undefined;
  const isSelfHalfMarker = payload[UCH_SELF_HALF_PAYLOAD_KEY] === true;
  const authorId = resolvePersistedAuthorId(event);
  const uid = viewer.currentUserId;
  const samePersistedAuthor = !!authorId && !!uid && String(authorId) === String(uid);
  const maskedUserIsFauchard = event.user?.id === FAUCHARD_PUBLIC_ID;

  const role = primaryPresentationRole(viewer);

  if (role === 'dentista') {
    return resolveDentistaTableA(event.action, {
      visibleTo,
      presentationAuthor,
      samePersistedAuthor,
      maskedUserIsFauchard,
      isSelfHalfMarker,
      authorRole: event.user?.role ?? null,
    });
  }

  return resolveTecnicoTableB(event.action, {
    visibleTo,
    presentationAuthor,
    samePersistedAuthor,
    maskedUserIsFauchard,
    authorRole: event.user?.role ?? null,
  });
}

function resolveDentistaTableA(
  action: string,
  ctx: {
    visibleTo: string | undefined;
    presentationAuthor: 'fauchard' | undefined;
    samePersistedAuthor: boolean;
    maskedUserIsFauchard: boolean;
    isSelfHalfMarker: boolean;
    authorRole: string | null;
  },
): { lane: UchThreadLane; showAsFauchard: boolean } {
  const {
    visibleTo,
    presentationAuthor,
    samePersistedAuthor,
    maskedUserIsFauchard,
    isSelfHalfMarker,
    authorRole,
  } = ctx;

  // Mitad dentista del split de CASO_PUBLICADO: marca explícita → carril propio,
  // sin depender del `user` enmascarado que el servidor convierte en Fauchard.
  if (
    action === CASE_EVENTS.CASO_PUBLICADO &&
    isSelfHalfMarker &&
    samePersistedAuthor
  ) {
    return { lane: 'self', showAsFauchard: false };
  }

  // A — Recibido / voz Fauchard hacia el dentista
  if (
    action === CASE_EVENTS.TRABAJO_INICIADO &&
    visibleTo === 'dentista' &&
    (presentationAuthor === 'fauchard' || maskedUserIsFauchard)
  ) {
    return { lane: 'thread', showAsFauchard: true };
  }

  // Publicación: mitad Fauchard del split (con `presentationAuthor: 'fauchard'`) o evento legacy
  // sin partir (enmascarado por el servidor: `user` Fauchard, `presentationAuthor` removido).
  if (
    action === CASE_EVENTS.CASO_PUBLICADO &&
    visibleTo !== 'tecnico' &&
    (presentationAuthor === 'fauchard' || maskedUserIsFauchard)
  ) {
    return { lane: 'thread', showAsFauchard: true };
  }

  // A — Emitido por el dentista (comparativo / cierres solo dentista)
  if (
    (action === CASE_EVENTS.OFERTA_RECHAZADA || action === CASE_EVENTS.OFERTA_NO_SELECCIONADA) &&
    visibleTo === 'dentista'
  ) {
    return { lane: 'self', showAsFauchard: false };
  }
  if (action === CASE_EVENTS.CASO_OFERTAS_TODAS_RECHAZADAS && visibleTo === 'dentista') {
    return { lane: 'self', showAsFauchard: false };
  }

  // A — Ciclo de vida y decisiones propias del doctor en su carril
  const dentistaSelfActions = new Set<string>([
    CASE_EVENTS.CASO_CREADO,
    CASE_EVENTS.CREACION,
    CASE_EVENTS.PUBLICACION,
    CASE_EVENTS.CASO_PUBLICADO,
    CASE_EVENTS.OFERTA_ACEPTADA,
    CASE_EVENTS.PROPUESTA_ACEPTADA,
    CASE_EVENTS.TRABAJO_APROBADO,
    CASE_EVENTS.REVISION_SOLICITADA,
    CASE_EVENTS.CASO_ACTUALIZADO,
    CASE_EVENTS.REPUBLICACION,
    CASE_EVENTS.RETIRO_PUBLICACION,
  ]);
  if (dentistaSelfActions.has(action) && samePersistedAuthor) {
    return { lane: 'self', showAsFauchard: false };
  }

  if (samePersistedAuthor) {
    return { lane: 'self', showAsFauchard: false };
  }

  // A — Cruzado (p. ej. técnico / orquestación hacia el dentista)
  return {
    lane: 'thread',
    showAsFauchard:
      maskedUserIsFauchard ||
      presentationAuthor === 'fauchard' ||
      authorRole === 'tecnico',
  };
}

function resolveTecnicoTableB(
  action: string,
  ctx: {
    visibleTo: string | undefined;
    presentationAuthor: 'fauchard' | undefined;
    samePersistedAuthor: boolean;
    maskedUserIsFauchard: boolean;
    authorRole: string | null;
  },
): { lane: UchThreadLane; showAsFauchard: boolean } {
  const { visibleTo, presentationAuthor, samePersistedAuthor, maskedUserIsFauchard, authorRole } = ctx;

  // B — Invitación recibida: siempre hilo y voz Fauchard (legacy sin presentationAuthor incluido).
  if (action === CASE_EVENTS.INVITACION_RECIBIDA) {
    return { lane: 'thread', showAsFauchard: true };
  }

  // B — Cierres comparativa / ganador visibles solo al técnico afectado
  if (
    (action === CASE_EVENTS.OFERTA_RECHAZADA ||
      action === CASE_EVENTS.OFERTA_NO_SELECCIONADA ||
      action === CASE_EVENTS.OFERTA_GANADORA) &&
    visibleTo === 'tecnico'
  ) {
    return { lane: 'thread', showAsFauchard: true };
  }

  // B — Emisiones claras del técnico en carril propio
  const tecnicoSelfEmitActions = new Set<string>([
    CASE_EVENTS.OFERTA_ENVIADA,
    CASE_EVENTS.OFERTA_RETIRADA,
    CASE_EVENTS.REVISION_ENVIADA,
    CASE_EVENTS.COMENTARIO_TECNICO,
    CASE_EVENTS.FABRICACION_INICIADA,
    CASE_EVENTS.CASO_DESPACHADO,
  ]);
  if (tecnicoSelfEmitActions.has(action) && samePersistedAuthor) {
    return { lane: 'self', showAsFauchard: false };
  }

  // B — Copia técnico de inicio de trabajo (confirmación del laboratorio)
  if (action === CASE_EVENTS.TRABAJO_INICIADO && visibleTo === 'tecnico' && samePersistedAuthor) {
    return { lane: 'self', showAsFauchard: false };
  }

  if (samePersistedAuthor) {
    return { lane: 'self', showAsFauchard: false };
  }

  // B — Mensajes del solicitante u orquestación hacia el técnico
  return {
    lane: 'thread',
    showAsFauchard:
      maskedUserIsFauchard ||
      presentationAuthor === 'fauchard' ||
      authorRole === 'dentista',
  };
}
