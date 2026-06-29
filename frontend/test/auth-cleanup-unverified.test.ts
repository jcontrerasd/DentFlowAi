/**
 * Fase 3 follow-up (ajuste login) — cron de limpieza de cuentas abandonadas sin verificar
 * (cleanupAbandonedUnverifiedAccountsAction, lib/db/actions/user.ts).
 * Gateado por RUN_DB_INTEGRATION_TESTS=true (mismo patrón que el resto de tests de auth).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@/lib/services/gcp-storage', () => ({
  default: { deleteFiles: vi.fn(async () => undefined) },
}));

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('cleanupAbandonedUnverifiedAccountsAction (BD real)', () => {
  const ORG = '00000000-0000-0000-0000-0000a5e00006';
  const OLD_ABANDONED = 'cleanup-old-abandoned';
  const RECENT_ABANDONED = 'cleanup-recent-abandoned';
  const OLD_VERIFIED = 'cleanup-old-verified';
  const OLD_COMPLETE = 'cleanup-old-complete';
  const OLD_ADMIN = 'cleanup-old-admin';

  const old3Days = new Date(Date.now() - 3 * 24 * 3600_000);
  const recent1Hour = new Date(Date.now() - 3600_000);

  let db: typeof import('@/lib/db').db;
  let schema: typeof import('@/lib/db/schema');

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    db = dbModule.db;
    if (dbModule.infraPromise) await dbModule.infraPromise;
    schema = await import('@/lib/db/schema');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'Cleanup Org', 'rut-cleanup', 'clinica', true) ON CONFLICT (id) DO NOTHING`);

    const insertUser = (id: string, opts: { emailVerified: Date | null; onboardingStep: number; role: string; createdAt: Date }) =>
      db.insert(schema.user).values({
        id,
        email: id + '@t.local',
        role: opts.role,
        organizationId: ORG,
        isActive: true,
        emailVerified: opts.emailVerified,
        onboardingStep: opts.onboardingStep,
        createdAt: opts.createdAt,
      }).onConflictDoNothing();

    await insertUser(OLD_ABANDONED, { emailVerified: null, onboardingStep: 20, role: 'dentista', createdAt: old3Days });
    await insertUser(RECENT_ABANDONED, { emailVerified: null, onboardingStep: 20, role: 'dentista', createdAt: recent1Hour });
    await insertUser(OLD_VERIFIED, { emailVerified: old3Days, onboardingStep: 20, role: 'dentista', createdAt: old3Days });
    await insertUser(OLD_COMPLETE, { emailVerified: null, onboardingStep: 100, role: 'dentista', createdAt: old3Days });
    await insertUser(OLD_ADMIN, { emailVerified: null, onboardingStep: 20, role: 'admin', createdAt: old3Days });
  });

  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await db.delete(schema.user).where(inArray(schema.user.id, [OLD_ABANDONED, RECENT_ABANDONED, OLD_VERIFIED, OLD_COMPLETE, OLD_ADMIN]));
    const { eq } = await import('drizzle-orm');
    await db.delete(schema.organization).where(eq(schema.organization.id, ORG));
  });

  it('borra solo la cuenta abandonada sin verificar y vieja, dejando el resto intacto', async () => {
    const { eq } = await import('drizzle-orm');
    const { cleanupAbandonedUnverifiedAccountsAction } = await import('@/lib/db/actions/user');

    const result = await cleanupAbandonedUnverifiedAccountsAction();
    expect(result.success).toBe(true);

    const [deleted] = await db.select().from(schema.user).where(eq(schema.user.id, OLD_ABANDONED)).limit(1);
    expect(deleted).toBeUndefined();

    const survivors = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.organizationId, ORG));
    const survivorIds = survivors.map(s => s.id);
    expect(survivorIds).toContain(RECENT_ABANDONED);
    expect(survivorIds).toContain(OLD_VERIFIED);
    expect(survivorIds).toContain(OLD_COMPLETE);
    expect(survivorIds).toContain(OLD_ADMIN);
  });
});
