/**
 * Fase 4 (ajuste login) — Una sola sesión activa por usuario (SINGLE_SESSION_ENABLED).
 *
 * El mecanismo de borrado (delete-before-insert en el callback jwt) ya está cubierto en
 * test/auth-own-session-tracking.test.ts. Este archivo cubre la pieza que cierra el ciclo:
 * `validateOwnSessionAction()`, que dashboard/layout.tsx usa para detectar que la sesión
 * actual fue invalidada y cerrarla client-side.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { clearForcedIdentity } from './helpers/test-identity';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('validateOwnSessionAction (BD real)', () => {
  const ORG = '00000000-0000-0000-0000-0000a5e00007';
  const USER_ID = 'test-single-session-user';
  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');
  const originalFlag = process.env.SINGLE_SESSION_ENABLED;

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    db = dbModule.db;
    if (dbModule.infraPromise) await dbModule.infraPromise;
    schema = await import('@/lib/db/schema');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'Single Session Org', 'rut-single-session', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${USER_ID}, ${USER_ID + '@t.local'}, 'dentista', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
  });

  afterEach(async () => {
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, USER_ID));
    process.env.SINGLE_SESSION_ENABLED = originalFlag;
    clearForcedIdentity();
  });

  afterAll(async () => {
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.user).where(eq(schema.user.id, USER_ID));
  });

  it('flag off: siempre válido sin consultar la tabla', async () => {
    process.env.SINGLE_SESSION_ENABLED = 'false';
    process.env.TAB_CLOSE_LOGOUT_ENABLED = 'false';
    const { validateOwnSessionAction } = await import('@/lib/db/actions/impersonation');
    const result = await validateOwnSessionAction();
    expect(result.valid).toBe(true);
  });

  // Nota: con flag ON, validateOwnSessionAction depende de auth() (request real, cookies()) —
  // no se puede invocar de forma aislada en este harness de tests (getServerIdentity() sí tiene
  // el bypass de test-identity.ts, pero validateOwnSessionAction llama a auth() directo a
  // propósito, igual que getServerIdentity, para reflejar la sesión real). La cobertura del
  // mecanismo subyacente (sid borrado → fila ausente) ya está en auth-own-session-tracking.test.ts
  // y se verificó manualmente end-to-end vía HTTP real contra el dev server (ver commit Fase 1).
});
