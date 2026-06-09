/**
 * Integración BD — dashboard de observabilidad (v5.0, Fase 3). Read-only.
 * Requiere RUN_DB_INTEGRATION_TESTS=true.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: 'admin-obs-f3', isSystemAdmin: true, role: 'admin' })),
}));

import { getObservabilityMetricsAction } from '@/lib/db/actions/observability';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('getObservabilityMetricsAction', () => {
  it('devuelve 12 tarjetas + funnel y marca las no-trackeadas como no disponibles', async () => {
    const res = await getObservabilityMetricsAction(30);
    expect(res.success).toBe(true);
    if (!res.success) return;

    const { data } = res;
    expect(data.windowDays).toBe(30);
    expect(data.metrics).toHaveLength(12);
    expect(data.funnel).toHaveProperty('published');
    expect(data.funnel).toHaveProperty('completed');

    // Métricas 3, 4 y 12 no están disponibles aún (requieren historial Fase 6).
    const unavailable = data.metrics.filter((m) => !m.available).map((m) => m.id).sort((a, b) => a - b);
    expect(unavailable).toEqual([3, 4, 12]);

    // Las disponibles tienen value numérico o null (sin datos), nunca NaN.
    for (const m of data.metrics) {
      if (m.value !== null) expect(Number.isNaN(m.value)).toBe(false);
    }
  });
});
