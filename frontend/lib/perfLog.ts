/**
 * Utility de performance logging.
 * - Siempre alimenta el ring buffer en memoria (lib/perfBuffer.ts).
 * - Escribe en frontend/perf.log cuando PERF_LOG=true (solo servidor local).
 */

import { recordPerfSample } from './perfBuffer';

const FILE_LOG_ENABLED = process.env.PERF_LOG === 'true';

export function perfLog(label: string, durationMs: number, meta?: Record<string, string | number | boolean | null | undefined>): void {
  // Siempre registrar en buffer en memoria.
  recordPerfSample({ action: label, durationMs, ts: Date.now(), meta: meta as Record<string, string | number | boolean | null> | undefined });

  if (!FILE_LOG_ENABLED) return;
  const ts = new Date().toISOString();
  const metaStr = meta
    ? ' | ' + Object.entries(meta).map(([k, v]) => `${k}=${v ?? 'null'}`).join(' | ')
    : '';
  const line = `[${ts}] [PERF] ${label} | duration=${durationMs}ms${metaStr}\n`;
  try {
    // Lazy import para evitar que Turbopack incluya 'fs' en bundles de cliente.
    const { appendFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    appendFileSync(join(process.cwd(), 'perf.log'), line);
  } catch {
    // no bloquear si no se puede escribir
  }
}

export function perfStart(): number {
  return Date.now();
}
