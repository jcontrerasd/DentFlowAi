/**
 * Conteo de mensajes UCH “del otro rol” no leídos por canal (técnico-diseño vs negociación-ofertas).
 * Alineado con la lógica previa en dashboard/cases/[id]/page.tsx.
 */

export const UCH_TECH_CHANNEL_ACTIONS = new Set([
  'REVISION_ENVIADA',
  'REVISION_SOLICITADA',
  'COMENTARIO_TECNICO',
  'TRABAJO_INICIADO',
  'CASO_DESPACHADO',
  'RECEPCION_CONFIRMADA',
  'FABRICACION_INICIADA',
  'TRABAJO_APROBADO',
  'ENTREGA_SUBIDA',
]);

export const UCH_NEG_CHANNEL_ACTIONS = new Set([
  'OFERTA_ENVIADA',
  'OFERTA_RECIBIDA',
  'OFERTA_RECHAZADA',
  'OFERTA_ACEPTADA',
  'MENSAJE_NEGOCIACION',
  'OFERTA_CONTRAOFERTA',
]);

export type UchUnreadEvent = {
  type: string;
  action: string;
  userId: string;
  createdAt: Date | string;
};

function eventTimeMs(createdAt: Date | string): number {
  if (createdAt instanceof Date) return createdAt.getTime();
  return new Date(createdAt).getTime() || 0;
}

export function isTechChannelEvent(e: Pick<UchUnreadEvent, 'type' | 'action'>): boolean {
  return e.type === 'tecnico' || UCH_TECH_CHANNEL_ACTIONS.has(e.action);
}

export function isNegChannelEvent(e: Pick<UchUnreadEvent, 'type' | 'action'>): boolean {
  return e.type === 'negociacion' || UCH_NEG_CHANNEL_ACTIONS.has(e.action);
}

/** Mensajes del canal técnico emitidos por alguien distinto del visor. */
export function filterOthersTechChannel(events: readonly UchUnreadEvent[], viewerId: string): UchUnreadEvent[] {
  return events.filter((h) => isTechChannelEvent(h) && h.userId !== viewerId);
}

/** Mensajes del canal negociación emitidos por alguien distinto del visor. */
export function filterOthersNegChannel(events: readonly UchUnreadEvent[], viewerId: string): UchUnreadEvent[] {
  return events.filter((h) => isNegChannelEvent(h) && h.userId !== viewerId);
}

/**
 * Si no hay marca de lectura, todo lo visible del canal cuenta como pendiente (comportamiento legacy localStorage).
 */
export function countUnreadTechChannel(
  events: readonly UchUnreadEvent[],
  viewerId: string,
  lastReadTech: Date | null,
): number {
  const others = filterOthersTechChannel(events, viewerId);
  if (others.length === 0) return 0;
  if (!lastReadTech) return others.length;
  const t = lastReadTech.getTime();
  return others.filter((m) => eventTimeMs(m.createdAt) > t).length;
}

export function countUnreadNegChannel(
  events: readonly UchUnreadEvent[],
  viewerId: string,
  lastReadNeg: Date | null,
): number {
  const others = filterOthersNegChannel(events, viewerId);
  if (others.length === 0) return 0;
  if (!lastReadNeg) return others.length;
  const t = lastReadNeg.getTime();
  return others.filter((m) => eventTimeMs(m.createdAt) > t).length;
}

export function totalUchHubUnread(
  events: readonly UchUnreadEvent[],
  viewerId: string,
  reads: { lastReadTech: Date | null; lastReadNeg: Date | null },
): number {
  return (
    countUnreadTechChannel(events, viewerId, reads.lastReadTech) +
    countUnreadNegChannel(events, viewerId, reads.lastReadNeg)
  );
}
