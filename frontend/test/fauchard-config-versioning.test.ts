import { describe, it, expect, vi } from 'vitest';
import { db } from '@/lib/db';
import { fauchardConfig, user } from '@/lib/db/schema';
import { eq, count, desc } from 'drizzle-orm';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';
import { forceIdentity, clearForcedIdentity } from '@/lib/db/actions/test-identity';

vi.mock('next/headers', () => ({
  headers: () => new Map(),
  cookies: () => ({ get: () => undefined }),
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn().mockResolvedValue({ success: true }),
  notifyOrganizationDentists: vi.fn().mockResolvedValue({ success: true }),
}));

const orgId = '77777777-7777-7777-7777-777777777777';

describe('Fauchard config versionado (DB)', () => {
  it('como máximo una fila activa en fauchard_config', async () => {
    const [{ c }] = await db
      .select({ c: count() })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true));
    expect(Number(c)).toBeLessThanOrEqual(1);
  });

  it('updateFauchardParamsAction deja exactamente una fila activa (copy-on-write)', async () => {
    const [adminUser] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'admin')).limit(1);
    if (!adminUser?.id) return;

    forceIdentity({
      id: adminUser.id,
      role: 'admin',
      orgId,
      fullName: 'Admin',
      email: 'admin@e2e.cl',
      isSimulating: false,
      isSystemAdmin: true,
    });

    const [before] = await db
      .select({ id: fauchardConfig.id, nInvited: fauchardConfig.nInvited })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .orderBy(desc(fauchardConfig.updatedAt), desc(fauchardConfig.version))
      .limit(1);

    if (!before) {
      clearForcedIdentity();
      return;
    }

    const target = before.nInvited <= 5 ? 6 : 5;
    const res = await updateFauchardParamsAction({ nInvited: target });
    expect(res.success).toBe(true);

    const [{ c }] = await db
      .select({ c: count() })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true));
    expect(Number(c)).toBe(1);

    await updateFauchardParamsAction({ nInvited: before.nInvited });
    clearForcedIdentity();
  });
});
