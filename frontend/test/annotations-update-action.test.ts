/**
 * Unit — updatePolylineAnnotationAction (edición de nodos del lazo flexible).
 * Cubre: autenticación, existencia, discriminador pin/trazado, permisos autor/admin
 * y validación de puntos. Sin DB real (contrato CI).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { identityMock, dbSelectMock, dbUpdateMock, updateSetMock } = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  updateSetMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({ getServerIdentity: identityMock }));
vi.mock('@/lib/contactGuard/guardOrFail', () => ({ guardTextOrFail: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

import { updatePolylineAnnotationAction } from '@/lib/db/actions/annotations';

function queueSelect(rows: unknown[]) {
  dbSelectMock.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
  }));
}

const AUTHOR = 'user-author';
const POINTS = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 1, z: 0 },
  { x: 2, y: 0, z: 1 },
];
const POLYLINE_ROW = { userId: AUTHOR, coordinates: [{ x: 9, y: 9, z: 9 }, { x: 8, y: 8, z: 8 }] };
const PIN_ROW = { userId: AUTHOR, coordinates: { x: 1, y: 2, z: 3 } };

describe('updatePolylineAnnotationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue({ id: AUTHOR, role: 'dentista', isSystemAdmin: false });
    updateSetMock.mockReturnValue({ where: () => Promise.resolve() });
    dbUpdateMock.mockReturnValue({ set: updateSetMock });
  });

  it('rechaza si no hay identidad', async () => {
    identityMock.mockResolvedValue(null);
    const res = await updatePolylineAnnotationAction('anno-1', POINTS);
    expect(res).toEqual({ success: false, error: 'No autenticado' });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('rechaza trazados con menos de 2 puntos', async () => {
    const res = await updatePolylineAnnotationAction('anno-1', [POINTS[0]]);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Trazado inválido');
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  it('rechaza trazados con más de 500 puntos', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ x: i, y: 0, z: 0 }));
    const res = await updatePolylineAnnotationAction('anno-1', tooMany);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Trazado inválido');
  });

  it('rechaza puntos con coordenadas no finitas', async () => {
    const res = await updatePolylineAnnotationAction('anno-1', [
      { x: 0, y: 0, z: 0 },
      { x: NaN, y: 1, z: 1 },
    ]);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Trazado inválido');
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('rechaza si la anotación no existe', async () => {
    queueSelect([]);
    const res = await updatePolylineAnnotationAction('anno-x', POINTS);
    expect(res).toEqual({ success: false, error: 'Trazado no encontrado' });
  });

  it('rechaza si la fila es un pin (coordinates no-array)', async () => {
    queueSelect([PIN_ROW]);
    const res = await updatePolylineAnnotationAction('anno-1', POINTS);
    expect(res).toEqual({ success: false, error: 'Operación no permitida' });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('rechaza a un usuario que no es autor ni admin', async () => {
    identityMock.mockResolvedValue({ id: 'otro-user', role: 'tecnico', isSystemAdmin: false });
    queueSelect([POLYLINE_ROW]);
    const res = await updatePolylineAnnotationAction('anno-1', POINTS);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Solo el autor puede editar este trazado');
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('permite al autor actualizar los puntos', async () => {
    queueSelect([POLYLINE_ROW]);
    const res = await updatePolylineAnnotationAction('anno-1', POINTS);
    expect(res).toEqual({ success: true });
    expect(dbUpdateMock).toHaveBeenCalled();
    const setArg = updateSetMock.mock.calls[0][0];
    expect(setArg.coordinates).toEqual(POINTS);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('permite a un admin actualizar trazados ajenos', async () => {
    identityMock.mockResolvedValue({ id: 'admin-1', role: 'admin', isSystemAdmin: true });
    queueSelect([POLYLINE_ROW]);
    const res = await updatePolylineAnnotationAction('anno-1', POINTS);
    expect(res).toEqual({ success: true });
    expect(dbUpdateMock).toHaveBeenCalled();
  });

  it('normaliza los puntos persistidos a {x,y,z} planos (descarta campos extra)', async () => {
    queueSelect([POLYLINE_ROW]);
    const dirty = [
      { x: 0, y: 0, z: 0, extra: 'nope' },
      { x: 1, y: 1, z: 1 },
    ] as Array<{ x: number; y: number; z: number }>;
    await updatePolylineAnnotationAction('anno-1', dirty);
    const setArg = updateSetMock.mock.calls[0][0];
    expect(setArg.coordinates).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
    ]);
  });
});
