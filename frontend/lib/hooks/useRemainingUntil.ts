'use client';

import { useSyncExternalStore, useMemo } from 'react';
import { toDeadlineMs, effectiveNowMs, type ServerClockAnchor } from '@/lib/deadlineMs';

/** Un solo `setInterval` para todas las cuentas regresivas (muchos casos en paralelo). */
let tick = 0;
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureInterval() {
  if (intervalId != null) return;
  intervalId = setInterval(() => {
    tick += 1;
    for (const l of listeners) l();
  }, 1000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureInterval();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId != null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot() {
  return tick;
}

function getServerSnapshot() {
  return 0;
}

export { toDeadlineMs } from '@/lib/deadlineMs';
export type { ServerClockAnchor } from '@/lib/deadlineMs';

export function splitCountdownParts(remainingMs: number) {
  const r = Math.max(0, remainingMs);
  return {
    hours: Math.floor(r / 3600000),
    minutes: Math.floor((r % 3600000) / 60000),
    seconds: Math.floor((r % 60000) / 1000),
  };
}

export function formatCountdownHMS(remainingMs: number) {
  const { hours, minutes, seconds } = splitCountdownParts(remainingMs);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Milisegundos restantes hasta `deadlineMs`, actualizados cada segundo en sync con el resto de la app.
 * - `deadlineMs` null / inválido → `-1` (sin cuenta activa; no mostrar reloj).
 * - deadline pasado o ya en 0 → `0`.
 */
export function useRemainingMsUntil(
  deadlineMs: number | null | undefined,
  clockAnchor?: ServerClockAnchor | null,
): number {
  const version = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  void version;
  if (deadlineMs == null || !Number.isFinite(deadlineMs) || deadlineMs <= 0) return -1;
  const now = effectiveNowMs(clockAnchor ?? null);
  return Math.max(0, deadlineMs - now);
}

/** Memoiza el instante límite a partir de un valor fecha/ISO (dependencia estable por contenido). */
export function useDeadlineMs(value: string | Date | number | null | undefined): number | null {
  const dep =
    value == null || value === ''
      ? ''
      : typeof value === 'number'
        ? value
        : value instanceof Date
          ? value.getTime()
          : typeof value === 'string'
            ? value
            : 0;
  return useMemo(() => toDeadlineMs(value), [dep]);
}
