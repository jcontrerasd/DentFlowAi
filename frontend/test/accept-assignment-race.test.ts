/**
 * Unit — acceptAssignmentAction: guard de atomicidad (TOCTOU).
 * El UPDATE de aceptación solo procede si la asignación sigue `pending`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { identityMock, dbSelectMock, txUpdateReturningMock, logCaseEventMock, notifyMock } = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  txUpdateReturningMock: vi.fn(),
  logCaseEventMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({ getServerIdentity: identityMock }));
vi.mock('@/lib/db/actions/cases', () => ({ logCaseEvent: logCaseEventMock }));
vi.mock('@/lib/services/notifications', () => ({ notifyUser: notifyMock }));

// tx.update().set().where() es awaitable (case update, sin returning) y además
// expone .returning() (guarded assignment update).
function makeTx() {
  const whereResult: any = Object.assign(Promise.resolve(undefined), {
    returning: txUpdateReturningMock,
  });
  return {
    update: () => ({ set: () => ({ where: () => whereResult }) }),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
    transaction: async (cb: (tx: any) => Promise<void>) => cb(makeTx()),
  },
}));

import { acceptAssignmentAction } from '@/lib/db/actions/assignment';

const TECH = 'tech-1';
const ASSIGNMENT = {
  id: 'inv-1',
  clinicalCaseId: 'case-1',
  technicianId: TECH,
  status: 'pending',
  expiresAt: null,
};
const CASE_ROW = {
  id: 'case-1',
  status: 'enEvaluacion',
  doctorId: 'doc-1',
  listPriceSale: '5750',
  publishedAt: new Date('2026-07-01'),
  desiredDeliveryAt: new Date('2026-07-10'),
};

function queueSelects(...batches: unknown[][]) {
  let i = 0;
  dbSelectMock.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(batches[i++] ?? []) }) }),
  }));
}

describe('acceptAssignmentAction — guard TOCTOU', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue({ id: TECH, role: 'tecnico' });
    logCaseEventMock.mockResolvedValue(undefined);
    notifyMock.mockResolvedValue(undefined);
  });

  it('acepta cuando el UPDATE guardado devuelve fila (sigue pending)', async () => {
    queueSelects([ASSIGNMENT], [CASE_ROW]);
    txUpdateReturningMock.mockResolvedValue([{ id: 'inv-1' }]);

    const res = await acceptAssignmentAction('inv-1');
    expect(res.success).toBe(true);
    expect(logCaseEventMock).toHaveBeenCalled();
  });

  it('rechaza sin marcar aceptado si el UPDATE guardado no afecta filas (carrera)', async () => {
    queueSelects([ASSIGNMENT], [CASE_ROW]);
    // La asignación dejó de estar pending entre el select y el update.
    txUpdateReturningMock.mockResolvedValue([]);

    const res = await acceptAssignmentAction('inv-1');
    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toBe('Esta asignación ya no está pendiente');
    // No se emite evento de aceptación porque la transacción abortó.
    expect(logCaseEventMock).not.toHaveBeenCalled();
  });
});
