/**
 * Fase 5 (ajuste login) — Logout real al cerrar pestaña (TAB_CLOSE_LOGOUT_ENABLED).
 *
 * Las rutas /api/auth/heartbeat, /api/auth/close y /api/cron/cleanup-stale-sessions ya se
 * verificaron manualmente vía HTTP real contra el dev server local (login real → heartbeat
 * actualiza lastSeenAt → close borra la fila → el cron borra solo las filas vencidas, no las
 * frescas). Este archivo cubre la lógica pura del cron (el filtro de antigüedad) contra la
 * BD real, gateado por RUN_DB_INTEGRATION_TESTS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('cleanup-stale-sessions — filtro de antigüedad (BD real)', () => {
  const ORG = '00000000-0000-0000-0000-0000a5e00008';
  const USER_ID = 'test-heartbeat-cron-user';
  const STALE_SID = 'test-stale-session-token';
  const FRESH_SID = 'test-fresh-session-token';
  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    db = dbModule.db;
    if (dbModule.infraPromise) await dbModule.infraPromise;
    schema = await import('@/lib/db/schema');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'Heartbeat Cron Org', 'rut-heartbeat-cron', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${USER_ID}, ${USER_ID + '@t.local'}, 'dentista', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, USER_ID));
    await db.delete(schema.user).where(eq(schema.user.id, USER_ID));
  });

  it('borra solo las filas con lastSeenAt más viejo que el TTL', async () => {
    const { eq, sql } = await import('drizzle-orm');
    const ttlSeconds = 90;

    await db.insert(schema.sessions).values({
      sessionToken: STALE_SID,
      userId: USER_ID,
      expires: new Date(Date.now() + 30 * 24 * 3600_000),
      lastSeenAt: new Date(Date.now() - 200_000),
    });
    await db.insert(schema.sessions).values({
      sessionToken: FRESH_SID,
      userId: USER_ID,
      expires: new Date(Date.now() + 30 * 24 * 3600_000),
      lastSeenAt: new Date(Date.now() - 10_000),
    });

    // Misma query que ejecuta el endpoint del cron.
    await db.execute(sql`
      DELETE FROM sessions
      WHERE "lastSeenAt" IS NOT NULL AND "lastSeenAt" < NOW() - INTERVAL '1 second' * ${ttlSeconds}
    `);

    const [stale] = await db.select().from(schema.sessions).where(eq(schema.sessions.sessionToken, STALE_SID)).limit(1);
    const [fresh] = await db.select().from(schema.sessions).where(eq(schema.sessions.sessionToken, FRESH_SID)).limit(1);
    expect(stale).toBeUndefined();
    expect(fresh).toBeDefined();
  });

  it('no toca filas con lastSeenAt NULL (sesión recién creada, sin heartbeat todavía)', async () => {
    const { eq, sql } = await import('drizzle-orm');
    const NULL_SID = 'test-null-lastseen-session';
    await db.insert(schema.sessions).values({
      sessionToken: NULL_SID,
      userId: USER_ID,
      expires: new Date(Date.now() + 30 * 24 * 3600_000),
      lastSeenAt: null,
    });

    await db.execute(sql`
      DELETE FROM sessions
      WHERE "lastSeenAt" IS NOT NULL AND "lastSeenAt" < NOW() - INTERVAL '1 second' * 90
    `);

    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.sessionToken, NULL_SID)).limit(1);
    expect(row).toBeDefined();
    await db.delete(schema.sessions).where(eq(schema.sessions.sessionToken, NULL_SID));
  });
});
