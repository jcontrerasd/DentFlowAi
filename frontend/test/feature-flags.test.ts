/**
 * Unit — lib/featureFlags.ts (v5.28). Caché, fallback a env y TTL numérico.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, selectMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: selectMock },
}));
vi.mock('@/lib/db/schema', () => ({ featureFlag: {} }));

selectMock.mockImplementation(() => ({ from: fromMock }));

describe('lib/featureFlags', () => {
  const FLAG_KEY = 'POOL_PENDIENTE_ENABLED';
  const TTL_KEY = 'EMAIL_VERIFICATION_TTL_MINUTES';
  const envSnapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    fromMock.mockReset();
    envSnapshot[FLAG_KEY] = process.env[FLAG_KEY];
    envSnapshot[TTL_KEY] = process.env[TTL_KEY];
    delete process.env[FLAG_KEY];
    delete process.env[TTL_KEY];
    (global as any).__featureFlagCache = null;
  });

  afterEach(() => {
    for (const k of [FLAG_KEY, TTL_KEY]) {
      if (envSnapshot[k] === undefined) delete process.env[k];
      else process.env[k] = envSnapshot[k];
    }
  });

  it('lee el valor desde la tabla cuando existe', async () => {
    fromMock.mockResolvedValue([{ key: FLAG_KEY, value: 'true' }]);
    const { getFlag } = await import('@/lib/featureFlags');
    expect(await getFlag(FLAG_KEY)).toBe(true);
  });

  it('cae a env cuando la key no está en la tabla', async () => {
    process.env[FLAG_KEY] = 'true';
    fromMock.mockResolvedValue([]);
    const { getFlag } = await import('@/lib/featureFlags');
    expect(await getFlag(FLAG_KEY)).toBe(true);
  });

  it('cae a env cuando la DB falla', async () => {
    process.env[FLAG_KEY] = 'true';
    fromMock.mockRejectedValue(new Error('conexión caída'));
    const { getFlag } = await import('@/lib/featureFlags');
    expect(await getFlag(FLAG_KEY)).toBe(true);
  });

  it('usa caché: una sola query para llamadas repetidas dentro del TTL', async () => {
    fromMock.mockResolvedValue([{ key: FLAG_KEY, value: 'true' }]);
    const { getFlag } = await import('@/lib/featureFlags');
    await getFlag(FLAG_KEY);
    await getFlag(FLAG_KEY);
    await getFlag(FLAG_KEY);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('invalidateFlagCache fuerza una nueva lectura', async () => {
    fromMock.mockResolvedValue([{ key: FLAG_KEY, value: 'false' }]);
    const { getFlag, invalidateFlagCache } = await import('@/lib/featureFlags');
    expect(await getFlag(FLAG_KEY)).toBe(false);

    fromMock.mockResolvedValue([{ key: FLAG_KEY, value: 'true' }]);
    invalidateFlagCache();
    expect(await getFlag(FLAG_KEY)).toBe(true);
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('getNumericSetting: tabla → env → default, en ese orden', async () => {
    const { getNumericSetting } = await import('@/lib/featureFlags');

    fromMock.mockResolvedValue([{ key: TTL_KEY, value: '30' }]);
    expect(await getNumericSetting(TTL_KEY, 15)).toBe(30);

    (global as any).__featureFlagCache = null;
    fromMock.mockResolvedValue([]);
    process.env[TTL_KEY] = '60';
    expect(await getNumericSetting(TTL_KEY, 15)).toBe(60);

    (global as any).__featureFlagCache = null;
    delete process.env[TTL_KEY];
    fromMock.mockResolvedValue([]);
    expect(await getNumericSetting(TTL_KEY, 15)).toBe(15);
  });

  it('getNumericSetting ignora valores no positivos o no finitos', async () => {
    fromMock.mockResolvedValue([{ key: TTL_KEY, value: '-5' }]);
    const { getNumericSetting } = await import('@/lib/featureFlags');
    expect(await getNumericSetting(TTL_KEY, 15)).toBe(15);
  });
});
