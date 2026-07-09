import { describe, it, expect, vi } from 'vitest';
import { createInflightDedup } from '@/lib/inflightDedup';

describe('createInflightDedup', () => {
  it('colapsa dos llamadas concurrentes con la misma key en una sola ejecución', async () => {
    const dedup = createInflightDedup<string>();
    let resolve!: (v: string) => void;
    const factory = vi.fn(() => new Promise<string>((r) => { resolve = r; }));

    const p1 = dedup('perfil:u1', factory);
    const p2 = dedup('perfil:u1', factory);

    expect(factory).toHaveBeenCalledTimes(1);
    resolve('ok');
    await expect(p1).resolves.toBe('ok');
    await expect(p2).resolves.toBe('ok');
  });

  it('no colapsa llamadas con keys distintas', async () => {
    const dedup = createInflightDedup<string>();
    const factory = vi.fn(async () => 'ok');

    await Promise.all([dedup('a', factory), dedup('b', factory)]);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('ejecuta de nuevo tras resolverse (no cachea resultados)', async () => {
    const dedup = createInflightDedup<string>();
    const factory = vi.fn(async () => 'ok');

    await dedup('k', factory);
    await dedup('k', factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('un rechazo no queda cacheado: la siguiente llamada re-ejecuta la factory', async () => {
    const dedup = createInflightDedup<string>();
    const factory = vi.fn()
      .mockRejectedValueOnce(new Error('falla'))
      .mockResolvedValueOnce('ok');

    await expect(dedup('k', factory)).rejects.toThrow('falla');
    await expect(dedup('k', factory)).resolves.toBe('ok');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('las llamadas concurrentes comparten también el rechazo', async () => {
    const dedup = createInflightDedup<string>();
    let reject!: (e: Error) => void;
    const factory = vi.fn(() => new Promise<string>((_, rj) => { reject = rj; }));

    const p1 = dedup('k', factory);
    const p2 = dedup('k', factory);
    expect(factory).toHaveBeenCalledTimes(1);

    reject(new Error('falla'));
    await expect(p1).rejects.toThrow('falla');
    await expect(p2).rejects.toThrow('falla');
  });
});
