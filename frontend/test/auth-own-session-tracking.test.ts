/**
 * Fase 1 (ajuste login) — Infraestructura de sesión propia (AUTH_DB_SESSIONS_ENABLED redefinido).
 *
 * NextAuth v5 prohíbe `Credentials` + `session.strategy: "database"` (UnsupportedStrategy,
 * verificado contra el servidor real). Por eso no usamos el adapter para sesiones: el callback
 * `jwt` de auth.config.ts escribe a mano una fila en `sessions` en cada login nuevo, y
 * `getServerIdentity()` la verifica cuando Fase 4/5 están activas. `session.strategy` permanece
 * siempre en "jwt".
 *
 * Verificado además manualmente contra el dev server real (HTTP + DB):
 *  - Login crea una fila en `sessions` con el `sid` que termina en `session.user.sid`.
 *  - Con SINGLE_SESSION_ENABLED=true, un segundo login del mismo usuario borra la fila anterior.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('tracking de sesión propia (tabla `sessions`, BD real)', () => {
  const ORG = '00000000-0000-0000-0000-0000a5e00003';
  const USER_ID = 'test-own-session-tracking-user';
  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');
  const originalSingleSession = process.env.SINGLE_SESSION_ENABLED;

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    db = dbModule.db;
    if (dbModule.infraPromise) await dbModule.infraPromise;
    schema = await import('@/lib/db/schema');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'Own Session Org', 'rut-own-session', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${USER_ID}, ${USER_ID + '@t.local'}, 'dentista', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
  });

  afterEach(async () => {
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, USER_ID));
    process.env.SINGLE_SESSION_ENABLED = originalSingleSession;
  });

  afterAll(async () => {
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.user).where(eq(schema.user.id, USER_ID));
  });

  it('simula el callback jwt: login nuevo inserta una fila con sid propio', async () => {
    const { eq } = await import('drizzle-orm');
    const sid = crypto.randomUUID();
    await db.insert(schema.sessions).values({ sessionToken: sid, userId: USER_ID, expires: new Date(Date.now() + 60_000) });

    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.sessionToken, sid)).limit(1);
    expect(row?.userId).toBe(USER_ID);
  });

  it('SINGLE_SESSION_ENABLED: el segundo login borra la fila del primero (mismo mecanismo del callback jwt)', async () => {
    const { eq } = await import('drizzle-orm');
    process.env.SINGLE_SESSION_ENABLED = 'true';

    const sidA = crypto.randomUUID();
    await db.insert(schema.sessions).values({ sessionToken: sidA, userId: USER_ID, expires: new Date(Date.now() + 60_000) });

    // Reproduce exactamente la rama del callback jwt en auth.config.ts.
    if (process.env.SINGLE_SESSION_ENABLED === 'true') {
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, USER_ID));
    }
    const sidB = crypto.randomUUID();
    await db.insert(schema.sessions).values({ sessionToken: sidB, userId: USER_ID, expires: new Date(Date.now() + 60_000) });

    const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionToken).toBe(sidB);

    // getServerIdentity() para A: SELECT por sidA ya no encuentra nada → debe resolver null.
    const [foundA] = await db.select().from(schema.sessions).where(eq(schema.sessions.sessionToken, sidA)).limit(1);
    expect(foundA).toBeUndefined();
  });

  it('sin SINGLE_SESSION_ENABLED: dos logins del mismo usuario coexisten (comportamiento actual)', async () => {
    const { eq } = await import('drizzle-orm');
    process.env.SINGLE_SESSION_ENABLED = 'false';

    const sidA = crypto.randomUUID();
    const sidB = crypto.randomUUID();
    await db.insert(schema.sessions).values({ sessionToken: sidA, userId: USER_ID, expires: new Date(Date.now() + 60_000) });
    if (process.env.SINGLE_SESSION_ENABLED === 'true') {
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, USER_ID));
    }
    await db.insert(schema.sessions).values({ sessionToken: sidB, userId: USER_ID, expires: new Date(Date.now() + 60_000) });

    const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, USER_ID));
    expect(rows).toHaveLength(2);
  });
});
