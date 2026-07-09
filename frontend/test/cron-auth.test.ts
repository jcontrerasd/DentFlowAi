import { describe, it, expect, afterEach, vi } from 'vitest';
import { requireCronAuth } from '@/lib/cronAuth';

function makeReq(authHeader?: string): any {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? authHeader ?? null : null) },
  };
}

const ORIGINAL_SECRET = process.env.CRON_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('requireCronAuth', () => {
  it('sin secreto en producción → 500 (fail-closed)', async () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = requireCronAuth(makeReq());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
  });

  it('sin secreto fuera de producción → permite (null)', () => {
    delete process.env.CRON_SECRET;
    vi.stubEnv('NODE_ENV', 'development');
    expect(requireCronAuth(makeReq())).toBeNull();
  });

  it('con secreto y header correcto → permite (null)', () => {
    process.env.CRON_SECRET = 's3cr3t';
    expect(requireCronAuth(makeReq('Bearer s3cr3t'))).toBeNull();
  });

  it('con secreto y header incorrecto → 401', () => {
    process.env.CRON_SECRET = 's3cr3t';
    const res = requireCronAuth(makeReq('Bearer wrong'));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it('con secreto y sin header → 401', () => {
    process.env.CRON_SECRET = 's3cr3t';
    const res = requireCronAuth(makeReq());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
});
