/**
 * Unit — lib/db/actions/featureFlags.ts (v5.28). Guards, whitelist, rango TTL,
 * escritura de log y no-op cuando el valor no cambia.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { identityMock, dbSelectMock, dbTransactionMock, invalidateCacheMock } = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  invalidateCacheMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({ getServerIdentity: identityMock }));
vi.mock('@/lib/featureFlags', () => ({ invalidateFlagCache: invalidateCacheMock }));
vi.mock('@/lib/db', () => ({
  db: { select: dbSelectMock, transaction: dbTransactionMock },
  infraPromise: null,
}));
vi.mock('@/lib/db/schema', () => ({ featureFlag: {}, featureFlagLog: {}, user: {} }));

import { getFeatureFlagsAction, setFeatureFlagAction, getFeatureFlagLogAction } from '@/lib/db/actions/featureFlags';

const ADMIN = { id: 'admin-1', role: 'admin', isSystemAdmin: true };

function queueSelect(result: unknown[]) {
  dbSelectMock.mockReturnValue({
    from: () => ({
      leftJoin: () => ({
        orderBy: () => Promise.resolve(result),
      }),
      where: () => ({ limit: () => Promise.resolve(result) }),
      orderBy: () => Promise.resolve(result),
    }),
  });
}

function queueLogSelect(result: unknown[]) {
  dbSelectMock.mockReturnValue({
    from: () => ({
      leftJoin: () => ({
        orderBy: () => ({ limit: () => Promise.resolve(result) }),
      }),
    }),
  });
}

describe('featureFlags admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue(ADMIN);
  });

  describe('guards', () => {
    it('getFeatureFlagsAction rechaza a no-admin', async () => {
      identityMock.mockResolvedValue({ id: 'u1', role: 'tecnico', isSystemAdmin: false });
      const res = await getFeatureFlagsAction();
      expect(res.success).toBe(false);
    });

    it('setFeatureFlagAction rechaza a no-admin', async () => {
      identityMock.mockResolvedValue(null);
      const res = await setFeatureFlagAction('LEAGUE_ENGINE_ENABLED', 'true');
      expect(res.success).toBe(false);
    });

    it('getFeatureFlagLogAction rechaza a no-admin', async () => {
      identityMock.mockResolvedValue({ id: 'u1', role: 'dentista', isSystemAdmin: false });
      const res = await getFeatureFlagLogAction();
      expect(res.success).toBe(false);
    });
  });

  it('getFeatureFlagsAction filtra a solo las keys administrables', async () => {
    queueSelect([
      { key: 'LEAGUE_ENGINE_ENABLED', value: 'true', valueType: 'boolean', description: null, updatedAt: new Date(), updatedByName: null },
      { key: 'UNKNOWN_LEGACY_KEY', value: 'true', valueType: 'boolean', description: null, updatedAt: new Date(), updatedByName: null },
    ]);
    const res = await getFeatureFlagsAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.flags).toHaveLength(1);
      expect(res.flags[0].key).toBe('LEAGUE_ENGINE_ENABLED');
    }
  });

  it('setFeatureFlagAction rechaza una key no whitelisteada', async () => {
    const res = await setFeatureFlagAction('SOME_RANDOM_FLAG', 'true');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/desconocido/i);
  });

  it('setFeatureFlagAction rechaza un valor booleano inválido', async () => {
    const res = await setFeatureFlagAction('LEAGUE_ENGINE_ENABLED', 'yes');
    expect(res.success).toBe(false);
  });

  it('setFeatureFlagAction valida el rango del TTL (5–1440)', async () => {
    const tooLow = await setFeatureFlagAction('EMAIL_VERIFICATION_TTL_MINUTES', '1');
    expect(tooLow.success).toBe(false);
    const tooHigh = await setFeatureFlagAction('EMAIL_VERIFICATION_TTL_MINUTES', '2000');
    expect(tooHigh.success).toBe(false);
    const notInt = await setFeatureFlagAction('EMAIL_VERIFICATION_TTL_MINUTES', '30.5');
    expect(notInt.success).toBe(false);
  });

  it('setFeatureFlagAction escribe log y actualiza cuando el valor cambia', async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbTransactionMock.mockImplementation(async (cb: any) => cb({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'row-1', value: 'false' }]) }) }) }),
      update: () => ({ set: updateSet }),
      insert: () => ({ values: insertValues }),
    }));

    const res = await setFeatureFlagAction('LEAGUE_ENGINE_ENABLED', 'true');
    expect(res.success).toBe(true);
    if (res.success) expect(res.persisted).toBe(true);
    expect(updateSet).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      flagKey: 'LEAGUE_ENGINE_ENABLED',
      oldValue: 'false',
      newValue: 'true',
      changedBy: ADMIN.id,
    }));
    expect(invalidateCacheMock).toHaveBeenCalled();
  });

  it('setFeatureFlagAction es no-op si el valor no cambió (sin log, sin invalidar caché)', async () => {
    const updateSet = vi.fn();
    const insertValues = vi.fn();
    dbTransactionMock.mockImplementation(async (cb: any) => cb({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 'row-1', value: 'true' }]) }) }) }),
      update: () => ({ set: updateSet }),
      insert: () => ({ values: insertValues }),
    }));

    const res = await setFeatureFlagAction('LEAGUE_ENGINE_ENABLED', 'true');
    expect(res.success).toBe(true);
    if (res.success) expect(res.persisted).toBe(false);
    expect(updateSet).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(invalidateCacheMock).not.toHaveBeenCalled();
  });

  it('getFeatureFlagLogAction retorna el historial ordenado', async () => {
    queueLogSelect([
      { flagKey: 'LEAGUE_ENGINE_ENABLED', oldValue: 'false', newValue: 'true', changedAt: new Date(), changedByName: 'Admin' },
    ]);
    const res = await getFeatureFlagLogAction();
    expect(res.success).toBe(true);
    if (res.success) expect(res.logs).toHaveLength(1);
  });
});
