import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  identityMock,
  dbSelectMock,
  dbTransactionMock,
  notifyUserMock,
  logCaseEventMock,
} = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  notifyUserMock: vi.fn(),
  logCaseEventMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: identityMock,
}));

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: notifyUserMock,
}));

// Mock Drizzle ORM
vi.mock('@/lib/db', () => {
  const queryBid = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  const queryClinicalCase = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  };
  return {
    db: {
      select: dbSelectMock,
      transaction: dbTransactionMock,
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
      query: { bid: queryBid, clinicalCase: queryClinicalCase },
      execute: vi.fn(),
    },
  };
});

vi.mock('@/lib/gcs', () => ({ getSignedUrl: vi.fn(), getUploadUrl: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({ canActAsTecnico: vi.fn(), canActAsDentista: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('STAB-031 — acceptBidAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna error cuando no hay identidad', async () => {
    identityMock.mockResolvedValue(null);
    const { acceptBidAction } = await import('@/lib/db/actions/cases');
    const result = await acceptBidAction('case-1', 'bid-1', 'tech-1');
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/autenticado/i);
  });

  it('propaga el error de transacción como failure', async () => {
    identityMock.mockResolvedValue({ id: 'dentist-1', role: 'dentista', orgId: 'org-1' });
    dbTransactionMock.mockRejectedValue(new Error('DB failure'));

    const { acceptBidAction } = await import('@/lib/db/actions/cases');
    const result = await acceptBidAction('case-1', 'bid-1', 'tech-1');
    expect(result.success).toBe(false);
    expect((result as any).error).toContain('DB failure');
  });

  it('devuelve success:true cuando la transacción se completa', async () => {
    identityMock.mockResolvedValue({ id: 'dentist-1', role: 'dentista', orgId: 'org-1' });

    dbTransactionMock.mockImplementation(async (cb: any) => {
      let selectCall = 0;
      const makeSelect = () => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            selectCall++;
            if (selectCall === 1) {
              // tx.select para roundId del bid ganador
              return { limit: vi.fn().mockResolvedValue([{ roundId: null }]) };
            }
            // tx.select para rejected bids (sin pendientes)
            return Promise.resolve([]);
          }),
        })),
      });
      const tx = {
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
        select: vi.fn(makeSelect),
        insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      };
      return await cb(tx);
    });

    const { acceptBidAction } = await import('@/lib/db/actions/cases');
    const result = await acceptBidAction('case-1', 'bid-1', 'tech-1');
    expect(result.success).toBe(true);
  });
});

describe('STAB-032 — canDeleteCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna false cuando hay ofertas existentes', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      })),
    });

    const { canDeleteCase } = await import('@/lib/db/actions/cases');
    const result = await canDeleteCase('case-1');
    expect(result).toBe(false);
  });

  it('retorna false cuando el caso tiene estado no eliminable (fabricacion)', async () => {
    let callCount = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([{ count: 0 }]);
          return { limit: vi.fn().mockResolvedValue([{ status: 'fabricacion', assignedId: null, isArchived: false }]) };
        }),
      })),
    }));

    const { canDeleteCase } = await import('@/lib/db/actions/cases');
    const result = await canDeleteCase('case-2');
    expect(result).toBe(false);
  });

  it('retorna false cuando el caso no está en borrador', async () => {
    let callCount = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([{ count: 0 }]);
          return { limit: vi.fn().mockResolvedValue([{ status: 'enEvaluacion', assignedId: null }]) };
        }),
      })),
    }));

    const { canDeleteCase } = await import('@/lib/db/actions/cases');
    const result = await canDeleteCase('case-3');
    expect(result).toBe(false);
  });

  it('retorna true para un borrador sin ofertas ni asignación', async () => {
    let callCount = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([{ count: 0 }]);
          return { limit: vi.fn().mockResolvedValue([{ status: 'borrador', assignedId: null, isArchived: false }]) };
        }),
      })),
    }));

    const { canDeleteCase } = await import('@/lib/db/actions/cases');
    const result = await canDeleteCase('case-4');
    expect(result).toBe(true);
  });

  it('retorna false para status enProgreso', async () => {
    let callCount = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([{ count: 0 }]);
          return { limit: vi.fn().mockResolvedValue([{ status: 'enProgreso', assignedId: 'tech-1', isArchived: false }]) };
        }),
      })),
    }));

    const { canDeleteCase } = await import('@/lib/db/actions/cases');
    const result = await canDeleteCase('case-5');
    expect(result).toBe(false);
  });
});
