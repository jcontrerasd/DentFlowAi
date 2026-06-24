/**
 * Fase 3 (ajuste login) — Verificación de email obligatoria (EMAIL_VERIFICATION_ENABLED).
 * Gateado por RUN_DB_INTEGRATION_TESTS=true (token + DB real, igual patrón que el resto
 * de tests de auth de este plan).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@/lib/services/notifications', () => ({
  sendCriticalAuthEmail: vi.fn(async () => ({ ok: true })),
}));

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('requestEmailVerificationAction / confirmEmailVerificationAction (BD real)', () => {
  const ORG = '00000000-0000-0000-0000-0000a5e00005';
  const USER_ID = 'test-email-verification-user';
  const EMAIL = USER_ID + '@t.local';
  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    db = dbModule.db;
    if (dbModule.infraPromise) await dbModule.infraPromise;
    schema = await import('@/lib/db/schema');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'Email Verif Org', 'rut-email-verif', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${USER_ID}, ${EMAIL}, 'dentista', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.verificationToken).where(eq(schema.verificationToken.identifier, EMAIL));
    await db.delete(schema.user).where(eq(schema.user.id, USER_ID));
  });

  it('genera token, confirma y setea emailVerified', async () => {
    const { eq } = await import('drizzle-orm');
    const { requestEmailVerificationAction, confirmEmailVerificationAction } = await import('@/lib/db/actions/auth');

    const reqResult = await requestEmailVerificationAction(EMAIL);
    expect(reqResult.success).toBe(true);

    const [tokenRow] = await db.select().from(schema.verificationToken).where(eq(schema.verificationToken.identifier, EMAIL)).limit(1);
    expect(tokenRow).toBeDefined();

    const confirmResult = await confirmEmailVerificationAction(tokenRow.token);
    expect(confirmResult.success).toBe(true);

    const [userRow] = await db.select().from(schema.user).where(eq(schema.user.id, USER_ID)).limit(1);
    expect(userRow.emailVerified).not.toBeNull();

    // Single-use: el token ya no existe.
    const [afterConfirm] = await db.select().from(schema.verificationToken).where(eq(schema.verificationToken.token, tokenRow.token)).limit(1);
    expect(afterConfirm).toBeUndefined();
  });

  it('token expirado: confirmEmailVerificationAction rechaza', async () => {
    const { eq } = await import('drizzle-orm');
    const { confirmEmailVerificationAction } = await import('@/lib/db/actions/auth');

    const expiredToken = crypto.randomUUID();
    await db.insert(schema.verificationToken).values({
      identifier: EMAIL,
      token: expiredToken,
      expires: new Date(Date.now() - 1000),
    });

    const result = await confirmEmailVerificationAction(expiredToken);
    expect(result.success).toBe(false);

    const [row] = await db.select().from(schema.verificationToken).where(eq(schema.verificationToken.token, expiredToken)).limit(1);
    expect(row).toBeUndefined(); // se borra al detectar expiración
  });

  it('reenvío no genera un segundo token si el vigente es reciente (anti-abuso)', async () => {
    const { eq } = await import('drizzle-orm');
    const { requestEmailVerificationAction } = await import('@/lib/db/actions/auth');

    // El test anterior verificó este email — lo dejamos sin verificar otra vez para este caso.
    await db.update(schema.user).set({ emailVerified: null }).where(eq(schema.user.id, USER_ID));
    await db.delete(schema.verificationToken).where(eq(schema.verificationToken.identifier, EMAIL));
    await requestEmailVerificationAction(EMAIL);
    const [firstToken] = await db.select().from(schema.verificationToken).where(eq(schema.verificationToken.identifier, EMAIL)).limit(1);

    await requestEmailVerificationAction(EMAIL);
    const rows = await db.select().from(schema.verificationToken).where(eq(schema.verificationToken.identifier, EMAIL));
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(firstToken.token);
  });
});
