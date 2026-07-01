/**
 * Ring buffer en memoria para samples de latencia de server actions.
 * Máximo 500 entradas (FIFO). Siempre activo — overhead ~100 bytes/sample.
 * Consumido por /api/admin/perf-snapshot para el panel admin.
 */

export type PerfSample = {
  action: string;
  durationMs: number;
  ts: number;
  meta?: Record<string, string | number | boolean | null>;
};

const MAX_SAMPLES = 500;

// Singleton en el proceso Node (sobrevive entre requests en el mismo worker).
const _samples: PerfSample[] = [];

export function recordPerfSample(sample: PerfSample): void {
  if (_samples.length >= MAX_SAMPLES) _samples.shift();
  _samples.push(sample);
}

export function getPerfSamples(): PerfSample[] {
  return _samples.slice();
}

export function getPerfStats(): Record<string, { p50: number; p95: number; p99: number; count: number; avgMs: number }> {
  const byAction = new Map<string, number[]>();
  for (const s of _samples) {
    const arr = byAction.get(s.action) ?? [];
    arr.push(s.durationMs);
    byAction.set(s.action, arr);
  }

  const stats: Record<string, { p50: number; p95: number; p99: number; count: number; avgMs: number }> = {};
  for (const [action, durations] of byAction.entries()) {
    const sorted = durations.slice().sort((a, b) => a - b);
    const n = sorted.length;
    const pct = (p: number) => sorted[Math.min(Math.ceil((p / 100) * n) - 1, n - 1)] ?? 0;
    const avg = durations.reduce((s, x) => s + x, 0) / n;
    stats[action] = { p50: pct(50), p95: pct(95), p99: pct(99), count: n, avgMs: Math.round(avg) };
  }
  return stats;
}
