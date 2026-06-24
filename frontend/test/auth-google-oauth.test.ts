/**
 * Fase 2 (ajuste login) — Google OAuth (GOOGLE_OAUTH_ENABLED).
 *
 * Unit: el callback `signIn` debe ser un no-op para Credentials (provider !== 'google') —
 * Credentials ya resuelve todo en su propio authorize().
 *
 * Integración (gateada RUN_DB_INTEGRATION_TESTS=true): el callback `signIn` de Google debe
 * replicar las 3 reglas que hoy solo viven en authorize() de Credentials (auth.config.ts):
 * bloqueo de cuenta inactiva, reset de rol admin (master/@dentflow.ai), y lastLoginAt. También
 * cubre el avance onboardingStep 0→20 para un usuario nuevo creado por el adapter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import authConfig from '@/auth.config';

const signInCallback = authConfig.callbacks!.signIn as any;

describe('auth.config signIn callback', () => {
  it('no-op para Credentials: retorna true sin tocar nada', async () => {
    const result = await signInCallback({
      user: { id: 'whatever', email: 'x@test.cl' },
      account: { provider: 'credentials' },
    });
    expect(result).toBe(true);
  });

  it('Google sin email: rechaza', async () => {
    const result = await signInCallback({
      user: { id: 'whatever' },
      account: { provider: 'google' },
    });
    expect(result).toBe(false);
  });
});

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('signIn callback de Google — paridad con Credentials (BD real)', () => {
  const ORG = '00000000-0000-0000-0000-0000a5e00004';
  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');

  const NEW_USER = 'test-google-new-user';
  const BLOCKED_USER = 'test-google-blocked-user';
  const MASTER_USER = 'test-google-master-user';

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    db = dbModule.db;
    if (dbModule.infraPromise) await dbModule.infraPromise;
    schema = await import('@/lib/db/schema');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'Google OAuth Org', 'rut-google-oauth', 'clinica', true) ON CONFLICT (id) DO NOTHING`);

    // Simula exactamente lo que el adapter (createUser, ya con el fix de role en auth.ts) deja:
    // role:'dentista' placeholder, onboardingStep:0 (default del schema).
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active, onboarding_step) VALUES (${NEW_USER}, ${NEW_USER + '@gmail.com'}, 'dentista', NULL, true, 0) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active, onboarding_step) VALUES (${BLOCKED_USER}, ${BLOCKED_USER + '@gmail.com'}, 'dentista', ${ORG}, false, 100) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active, onboarding_step) VALUES (${MASTER_USER}, 'test-google-master-user@dentflow.ai', 'dentista', NULL, true, 0) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    const { eq, inArray } = await import('drizzle-orm');
    await db.delete(schema.user).where(inArray(schema.user.id, [NEW_USER, BLOCKED_USER, MASTER_USER]));
  });

  it('usuario nuevo (onboardingStep 0): avanza a 20, permite login, setea lastLoginAt', async () => {
    const { eq } = await import('drizzle-orm');
    const authUser: any = { id: NEW_USER, email: NEW_USER + '@gmail.com' };
    const result = await signInCallback({ user: authUser, account: { provider: 'google' } });
    expect(result).toBe(true);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, NEW_USER)).limit(1);
    expect(row.onboardingStep).toBe(20);
    expect(row.lastLoginAt).not.toBeNull();
    // El callback debe haber mutado authUser para que el callback jwt reciba valores frescos.
    expect(authUser.role).toBe('dentista');
  });

  it('cuenta inactiva (bloqueada por admin): rechaza el login', async () => {
    const result = await signInCallback({
      user: { id: BLOCKED_USER, email: BLOCKED_USER + '@gmail.com' },
      account: { provider: 'google' },
    });
    expect(result).toBe(false);
  });

  it('dominio @dentflow.ai: aplica el mismo reset de admin que Credentials', async () => {
    const { eq } = await import('drizzle-orm');
    const authUser: any = { id: MASTER_USER, email: 'test-google-master-user@dentflow.ai' };
    const result = await signInCallback({ user: authUser, account: { provider: 'google' } });
    expect(result).toBe(true);

    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, MASTER_USER)).limit(1);
    expect(row.role).toBe('admin');
    expect(row.onboardingStep).toBe(100);
  });
});
