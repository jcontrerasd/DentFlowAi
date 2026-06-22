/**
 * Utility de performance logging para diagnóstico local.
 * Escribe en frontend/perf.log (excluido por .gitignore).
 * Activado cuando PERF_LOG=true en .env.local.
 */

const ENABLED = process.env.PERF_LOG === 'true';

export function perfLog(label: string, durationMs: number, meta?: Record<string, string | number | boolean | null | undefined>): void {
  if (!ENABLED) return;
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
