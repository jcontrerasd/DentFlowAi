/**
 * Integración BD — validaciones v5.0 de updateFauchardParamsAction (Fase 3).
 * Requiere RUN_DB_INTEGRATION_TESTS=true. Solo prueba casos INVÁLIDOS: la
 * validación lanza dentro de la transacción → rollback (no muta la config).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: 'admin-test-f3', isSystemAdmin: true, role: 'admin' })),
}));

import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('updateFauchardParamsAction — validaciones v5.0', () => {
  it('rechaza umbrales fuera de orden (Nivel 1 < 2 < 3)', async () => {
    const res = await updateFauchardParamsAction({ level1Threshold: 5, level2Threshold: 2, level3Threshold: 3 }, 'test');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/Nivel 1 < Nivel 2 < Nivel 3/);
  });

  it('rechaza recordatorio ≥ auto-OFF', async () => {
    const res = await updateFauchardParamsAction({ inactivityReminderDays: 40, inactivityAutoOffDays: 30 }, 'test');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/recordatorio/i);
  });

  it('rechaza los 6 α activos si no suman 1.0', async () => {
    const res = await updateFauchardParamsAction({
      alphaQuality: 0.2, alphaPunctuality: 0.2, alphaExperience: 0.2,
      alphaBonus: 0.2, alphaLoad: 0.2, alphaNoResponse: 0.2,
    }, 'test');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/suma de los pesos/i);
  });

  it('incluye alphaBonus en validación Σ6', async () => {
    const res = await updateFauchardParamsAction({
      alphaQuality: 0.25, alphaPunctuality: 0.2, alphaExperience: 0.2,
      alphaLoad: 0.15, alphaNoResponse: 0.2, alphaBonus: 0.5,
    }, 'test');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/suma de los pesos/i);
  });
});
