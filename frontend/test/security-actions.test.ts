import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  identityMock,
  dbSelectMock,
  dbTransactionMock,
  getSignedUrlMock,
} = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  getSignedUrlMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: identityMock,
}));

vi.mock('@/lib/services/notifications', () => ({ notifyUser: vi.fn() }));

vi.mock('@/lib/gcs', () => ({
  getSignedUrl: getSignedUrlMock,
  getUploadUrl: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  return {
    db: {
      select: dbSelectMock,
      transaction: dbTransactionMock,
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      delete: vi.fn(() => ({ where: vi.fn() })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
      query: { bid: { findFirst: vi.fn(), findMany: vi.fn() }, clinicalCase: { findFirst: vi.fn() } },
      execute: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock('@/lib/auth-helpers', () => ({ canActAsTecnico: vi.fn(), canActAsDentista: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_cache: (fn: any) => fn }));

// ─── STAB-033: withdrawCaseAction security ───────────────────────────────────

describe('STAB-033 — withdrawCaseAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bloquea a usuarios no autenticados', async () => {
    identityMock.mockResolvedValue(null);
    const { withdrawCaseAction } = await import('@/lib/db/actions/cases');
    const result = await withdrawCaseAction('case-1');
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/autorizado/i);
  });

  it('rechaza retirar un caso que no está publicado', async () => {
    identityMock.mockResolvedValue({ id: 'dent-1', orgId: 'org-1', role: 'dentista' });
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ status: 'borrador', doctorId: 'dent-1' }]),
        })),
      })),
    });

    const { withdrawCaseAction } = await import('@/lib/db/actions/cases');
    const result = await withdrawCaseAction('case-1');
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/retirar|estado actual/i);
  });

  it('impide retirar si el caso no pertenece a la organización (caso no encontrado)', async () => {
    identityMock.mockResolvedValue({ id: 'dent-2', orgId: 'org-B', role: 'dentista' });
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    });

    const { withdrawCaseAction } = await import('@/lib/db/actions/cases');
    const result = await withdrawCaseAction('case-1');
    expect(result.success).toBe(false);
    expect((result as any).error).toMatch(/no encontrado/i);
  });
});

// ─── STAB-034: createBidAction security ──────────────────────────────────────

// STAB-034 removed — createBidAction deleted (replaced by submitQuoteAction via caseInvitation)

// ─── STAB-035: getSignedUrlAction security ───────────────────────────────────

describe('STAB-035 — getSignedUrlAction security', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bloquea a usuarios no autenticados', async () => {
    identityMock.mockResolvedValue(null);
    const { getSignedUrlAction } = await import('@/lib/db/actions/cases');
    await expect(getSignedUrlAction('organizations/other-org/file.stl')).rejects.toThrow(/autorizado/i);
  });

  it('permite acceso a archivos de la propia organización', async () => {
    identityMock.mockResolvedValue({ id: 'user-1', orgId: 'org-A', role: 'dentista', isSystemAdmin: false });
    getSignedUrlMock.mockResolvedValue('https://signed-url.example.com/file.stl');

    const { getSignedUrlAction } = await import('@/lib/db/actions/cases');
    const url = await getSignedUrlAction('organizations/org-A/cases/case-1/file.stl');
    expect(url).toContain('signed-url.example.com');
  });

  it('deniega acceso a archivos de otra organización para dentistas', async () => {
    identityMock.mockResolvedValue({ id: 'user-2', orgId: 'org-B', role: 'dentista', isSystemAdmin: false });

    const { getSignedUrlAction } = await import('@/lib/db/actions/cases');
    await expect(getSignedUrlAction('organizations/org-A/cases/case-1/file.stl')).rejects.toThrow(/acceso denegado/i);
  });

  it('permite acceso a sistema admin independientemente del org', async () => {
    identityMock.mockResolvedValue({ id: 'admin-1', orgId: 'org-X', role: 'admin', isSystemAdmin: true });
    getSignedUrlMock.mockResolvedValue('https://signed-url.example.com/admin.stl');

    const { getSignedUrlAction } = await import('@/lib/db/actions/cases');
    const url = await getSignedUrlAction('organizations/org-Y/cases/c2/model.stl');
    expect(url).toContain('signed-url.example.com');
  });

  it('permite a técnico acceder a casos publicados de otras orgs', async () => {
    identityMock.mockResolvedValue({ id: 'tech-1', orgId: 'org-T', role: 'tecnico', isSystemAdmin: false });
    getSignedUrlMock.mockResolvedValue('https://signed-url.example.com/case.stl');
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ status: 'publicado', assignedId: null }]),
        })),
      })),
    });

    const { getSignedUrlAction } = await import('@/lib/db/actions/cases');
    const url = await getSignedUrlAction('organizations/org-A/cases/case-pub/scan.stl');
    expect(url).toContain('signed-url.example.com');
  });
});
