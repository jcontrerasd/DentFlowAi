/**
 * Normaliza fecha/ISO/timestamp a ms desde epoch, o `null` si no hay deadline usable.
 * Sin dependencias de React (usable en server y en reglas de visibilidad).
 */
export function toDeadlineMs(value: string | Date | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  if (typeof value === 'string') {
    const normalized = value.replace('+00:00', 'Z').replace(/(\.\d{3})\d+Z/, '$1Z');
    const t = new Date(normalized).getTime();
    return Number.isFinite(t) && t > 0 ? t : null;
  }
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
}

export type ServerClockAnchor = {
  serverNowMs: number;
  /** `performance.now()` en el cliente en el momento de recibir la respuesta. */
  clientPerfAtFetch: number;
};

/** “Ahora” alineado al servidor a partir del ancla de una respuesta reciente. */
export function effectiveNowMs(anchor: ServerClockAnchor | null | undefined): number {
  if (anchor == null || !Number.isFinite(anchor.serverNowMs) || !Number.isFinite(anchor.clientPerfAtFetch)) {
    return Date.now();
  }
  return anchor.serverNowMs + (performance.now() - anchor.clientPerfAtFetch);
}
