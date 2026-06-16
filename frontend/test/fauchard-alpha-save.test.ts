/**
 * Integración BD — guardado de pesos α y noop explícito.
 * Requiere RUN_DB_INTEGRATION_TESTS=true.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: 'admin-test-alpha', isSystemAdmin: true, role: 'admin' })),
}));

import { db } from '@/lib/db';
import { fauchardConfig } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';
import { sumActiveAlphas } from '@/lib/fauchard/alphaWeightNormalize';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('updateFauchardParamsAction — pesos α', () => {
  it('devuelve persisted:false cuando no hay cambios reales', async () => {
    const [current] = await db
      .select()
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .orderBy(desc(fauchardConfig.updatedAt), desc(fauchardConfig.version))
      .limit(1);

    if (!current) return;

    const res = await updateFauchardParamsAction(
      { tQuoteMinutes: current.tQuoteMinutes },
      'test-noop',
    );
    expect(res.success).toBe(true);
    if (res.success) expect(res.persisted).toBe(false);
  });

  it('al guardar α persiste alpha_bonus y Σ6=1.0', async () => {
    const [before] = await db
      .select()
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .orderBy(desc(fauchardConfig.updatedAt), desc(fauchardConfig.version))
      .limit(1);

    if (!before) return;

    const payload = {
      alphaQuality: 0.22,
      alphaPunctuality: 0.18,
      alphaExperience: 0.18,
      alphaBonus: 0.10,
      alphaLoad: 0.17,
      alphaNoResponse: 0.15,
    };

    const res = await updateFauchardParamsAction(payload, 'test-alpha-save');
    expect(res.success).toBe(true);
    if (res.success) expect(res.persisted).toBe(true);

    const [after] = await db
      .select()
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .orderBy(desc(fauchardConfig.updatedAt), desc(fauchardConfig.version))
      .limit(1);

    expect(after).toBeDefined();
    expect(parseFloat(after!.alphaBonus)).toBeCloseTo(0.10, 3);
    expect(
      sumActiveAlphas({
        alphaQuality: parseFloat(after!.alphaQuality),
        alphaPunctuality: parseFloat(after!.alphaPunctuality),
        alphaExperience: parseFloat(after!.alphaExperience),
        alphaBonus: parseFloat(after!.alphaBonus),
        alphaLoad: parseFloat(after!.alphaLoad),
        alphaNoResponse: parseFloat(after!.alphaNoResponse),
      }),
    ).toBeCloseTo(1.0, 3);

    // Restaurar valores previos
    await updateFauchardParamsAction(
      {
        alphaQuality: parseFloat(before.alphaQuality),
        alphaPunctuality: parseFloat(before.alphaPunctuality),
        alphaExperience: parseFloat(before.alphaExperience),
        alphaBonus: parseFloat(before.alphaBonus),
        alphaLoad: parseFloat(before.alphaLoad),
        alphaNoResponse: parseFloat(before.alphaNoResponse),
      },
      'test-alpha-restore',
    );
  });
});
