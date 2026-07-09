/**
 * Unit — computeEligibleBatch: AND triple en lote + reporte de filas faltantes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbSelectMock } = vi.hoisted(() => ({ dbSelectMock: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: { select: dbSelectMock },
}));

// Corta la cadena de import que carga auth.ts (DrizzleAdapter) al mockear db.
vi.mock('@/lib/db/actions/impersonation', () => ({ getServerIdentity: vi.fn() }));

import { computeEligibleBatch } from '@/lib/db/actions/availability';

// La categoría 'coronas' + capacidad 'cad' mapea a la columna hija catCoronasCad.
function row(userId: string, over: Record<string, unknown> = {}) {
  return { userId, levelGlobal: true, levelCad: true, catCoronasCad: true, ...over };
}

function mockRows(rows: unknown[]) {
  dbSelectMock.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  });
}

describe('computeEligibleBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista vacía → sin query, sets vacíos', async () => {
    const res = await computeEligibleBatch([], 'coronas', 'cad');
    expect(res.eligible.size).toBe(0);
    expect(res.missing).toEqual([]);
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it('marca elegible solo si levelGlobal ∧ levelCad ∧ categoría', async () => {
    mockRows([
      row('t1'),                                   // elegible
      row('t2', { levelGlobal: false }),           // padre global off
      row('t3', { levelCad: false }),              // CAD off
      row('t4', { catCoronasCad: false }),         // categoría off
    ]);
    const res = await computeEligibleBatch(['t1', 't2', 't3', 't4'], 'coronas', 'cad');
    expect([...res.eligible]).toEqual(['t1']);
    expect(res.missing).toEqual([]);
  });

  it('reporta como missing a los técnicos sin fila (no los marca elegibles)', async () => {
    mockRows([row('t1')]);
    const res = await computeEligibleBatch(['t1', 't2'], 'coronas', 'cad');
    expect([...res.eligible]).toEqual(['t1']);
    expect(res.missing).toEqual(['t2']);
  });
});
