/**
 * Fase 3 follow-up (ajuste login) — tope duro de reenvíos por email/hora
 * (checkAndRecordAuthRateLimit, lib/db/rateLimit.ts).
 * Gateado por RUN_DB_INTEGRATION_TESTS=true (mismo patrón que el resto de tests de auth).
 */
import { describe, it, expect, afterAll } from 'vitest';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('checkAndRecordAuthRateLimit (BD real)', () => {
  const EMAIL = 'rate-limit-test@t.local';
  const ACTION = 'email_verification';

  afterAll(async () => {
    const { db } = await import('@/lib/db');
    const schema = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.authActionRateLimit).where(eq(schema.authActionRateLimit.email, EMAIL));
  });

  it('permite hasta el tope por hora y bloquea el siguiente', async () => {
    const { checkAndRecordAuthRateLimit } = await import('@/lib/db/rateLimit');

    for (let i = 0; i < 5; i++) {
      const ok = await checkAndRecordAuthRateLimit(EMAIL, ACTION, 5);
      expect(ok).toBe(true);
    }

    const blocked = await checkAndRecordAuthRateLimit(EMAIL, ACTION, 5);
    expect(blocked).toBe(false);

    const { db } = await import('@/lib/db');
    const schema = await import('@/lib/db/schema');
    const { eq, and } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(schema.authActionRateLimit)
      .where(and(eq(schema.authActionRateLimit.email, EMAIL), eq(schema.authActionRateLimit.actionType, ACTION)));
    // El intento bloqueado no insertó una sexta fila.
    expect(rows).toHaveLength(5);
  });

  it('una ventana distinta (actionType distinto) no comparte el tope', async () => {
    const { checkAndRecordAuthRateLimit } = await import('@/lib/db/rateLimit');
    const ok = await checkAndRecordAuthRateLimit(EMAIL, 'password_reset', 5);
    expect(ok).toBe(true);

    const { db } = await import('@/lib/db');
    const schema = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.authActionRateLimit).where(eq(schema.authActionRateLimit.actionType, 'password_reset'));
  });
});
