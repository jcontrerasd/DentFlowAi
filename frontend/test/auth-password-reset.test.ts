/**
 * Fase 3.5 (ajuste login) — Recuperación de contraseña real (sin flag, fix).
 * Gateado por RUN_DB_INTEGRATION_TESTS=true.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@/lib/services/notifications', () => ({
  sendCriticalAuthEmail: vi.fn(async () => ({ ok: true })),
}));

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('requestPasswordResetAction / resetPasswordAction (BD real)', () => {
  const ORG = '00000000-0000-0000-0000-0000a5e00006';
  const USER_ID = 'test-password-reset-user';
  const NO_PASSWORD_USER = 'test-password-reset-google-user';
  const EMAIL = USER_ID + '@t.local';
  const NO_PASSWORD_EMAIL = NO_PASSWORD_USER + '@t.local';
  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');
  let bcrypt: typeof import('bcryptjs');

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    db = dbModule.db;
    if (dbModule.infraPromise) await dbModule.infraPromise;
    schema = await import('@/lib/db/schema');
    bcrypt = await import('bcryptjs');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'Password Reset Org', 'rut-password-reset', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
    const hashed = await bcrypt.hash('clave-original-123', 10);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active, hashed_password) VALUES (${USER_ID}, ${EMAIL}, 'dentista', ${ORG}, true, ${hashed}) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active, hashed_password) VALUES (${NO_PASSWORD_USER}, ${NO_PASSWORD_EMAIL}, 'dentista', ${ORG}, true, NULL) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    const { eq, inArray } = await import('drizzle-orm');
    await db.delete(schema.passwordResetToken).where(eq(schema.passwordResetToken.email, EMAIL));
    await db.delete(schema.user).where(inArray(schema.user.id, [USER_ID, NO_PASSWORD_USER]));
  });

  it('genera token, resetea la clave, single-use', async () => {
    const { eq } = await import('drizzle-orm');
    const { requestPasswordResetAction, resetPasswordAction } = await import('@/lib/db/actions/auth');

    const reqResult = await requestPasswordResetAction(EMAIL);
    expect(reqResult.success).toBe(true);

    const [tokenRow] = await db.select().from(schema.passwordResetToken).where(eq(schema.passwordResetToken.email, EMAIL)).limit(1);
    expect(tokenRow).toBeDefined();
    expect(tokenRow.usedAt).toBeNull();

    const resetResult = await resetPasswordAction(tokenRow.token, 'clave-nueva-456');
    expect(resetResult.success).toBe(true);

    const [userRow] = await db.select().from(schema.user).where(eq(schema.user.id, USER_ID)).limit(1);
    const matches = await bcrypt.compare('clave-nueva-456', userRow.hashedPassword!);
    expect(matches).toBe(true);

    // Single-use: un segundo intento con el mismo token falla.
    const secondAttempt = await resetPasswordAction(tokenRow.token, 'otra-clave-789');
    expect(secondAttempt.success).toBe(false);

    const [usedRow] = await db.select().from(schema.passwordResetToken).where(eq(schema.passwordResetToken.token, tokenRow.token)).limit(1);
    expect(usedRow.usedAt).not.toBeNull(); // se marca usado, no se borra (auditoría)
  });

  it('token expirado: rechaza', async () => {
    const { resetPasswordAction } = await import('@/lib/db/actions/auth');
    const expiredToken = crypto.randomUUID();
    await db.insert(schema.passwordResetToken).values({ token: expiredToken, email: EMAIL, expires: new Date(Date.now() - 1000) });

    const result = await resetPasswordAction(expiredToken, 'clave-nueva-456');
    expect(result.success).toBe(false);
  });

  it('email no-existente: responde éxito genérico (anti-enumeración)', async () => {
    const { requestPasswordResetAction } = await import('@/lib/db/actions/auth');
    const result = await requestPasswordResetAction('no-existe-' + crypto.randomUUID() + '@t.local');
    expect(result.success).toBe(true);
  });

  it('cuenta sin password (solo-Google): no genera token de reset', async () => {
    const { eq } = await import('drizzle-orm');
    const { requestPasswordResetAction } = await import('@/lib/db/actions/auth');

    const result = await requestPasswordResetAction(NO_PASSWORD_EMAIL);
    expect(result.success).toBe(true);

    const rows = await db.select().from(schema.passwordResetToken).where(eq(schema.passwordResetToken.email, NO_PASSWORD_EMAIL));
    expect(rows).toHaveLength(0);
  });
});
