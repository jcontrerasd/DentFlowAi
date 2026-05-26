import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  identityMock,
  dbSelectMock,
  dbTransactionMock,
  deleteFilesStrictMock,
} = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  deleteFilesStrictMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: identityMock,
}));

vi.mock('@/lib/services/gcp-storage', () => ({
  default: {
    deleteFilesStrict: deleteFilesStrictMock,
    deleteFile: vi.fn(),
    deleteFiles: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function mockEligibleCaseSelects(
  fileRows: Array<{ gcsPath: string | null; thumbnailPath: string | null }>,
  opts?: { activeCopy?: { id: string; caseNumber: string | null } },
) {
  let selectCall = 0;
  dbSelectMock.mockImplementation(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        selectCall += 1;
        if (selectCall === 1) {
          return Promise.resolve([{ count: 0 }]);
        }
        if (selectCall === 2) {
          return {
            limit: vi.fn().mockResolvedValue([
              { status: 'borrador', assignedId: null },
            ]),
          };
        }
        if (selectCall === 3) {
          return {
            limit: vi.fn().mockResolvedValue([
              { doctorId: 'dent-1', organizationId: 'org-1' },
            ]),
          };
        }
        if (selectCall === 4) {
          return {
            limit: vi.fn().mockResolvedValue(opts?.activeCopy ? [opts.activeCopy] : []),
          };
        }
        return Promise.resolve(fileRows);
      }),
    })),
  }));
}

describe('deleteClinicalCaseAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue({
      id: 'dent-1',
      orgId: 'org-1',
      role: 'dentista',
      isSystemAdmin: false,
    });
    deleteFilesStrictMock.mockResolvedValue(undefined);
    dbTransactionMock.mockImplementation(async (cb) => {
      const tx = {
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      };
      await cb(tx);
    });
  });

  it('no elegible: no borra GCS ni BD', async () => {
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      })),
    }));

    const { deleteClinicalCaseAction } = await import('@/lib/db/actions/cases');
    const res = await deleteClinicalCaseAction('case-1');

    expect(res.success).toBe(false);
    expect(deleteFilesStrictMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it('éxito: borra GCS y luego transacción BD', async () => {
    mockEligibleCaseSelects([
      { gcsPath: 'organizations/org-1/cases/case-1/a.stl', thumbnailPath: 'organizations/org-1/cases/case-1/a.png' },
    ]);

    const { deleteClinicalCaseAction } = await import('@/lib/db/actions/cases');
    const res = await deleteClinicalCaseAction('case-1');

    expect(res.success).toBe(true);
    expect(deleteFilesStrictMock).toHaveBeenCalledWith([
      'organizations/org-1/cases/case-1/a.stl',
      'organizations/org-1/cases/case-1/a.png',
    ]);
    expect(dbTransactionMock).toHaveBeenCalled();
  });

  it('fallo GCS: aborta sin transacción', async () => {
    mockEligibleCaseSelects([
      { gcsPath: 'organizations/org-1/cases/case-1/a.stl', thumbnailPath: null },
    ]);
    deleteFilesStrictMock.mockRejectedValue(new Error('GCS down'));

    const { deleteClinicalCaseAction } = await import('@/lib/db/actions/cases');
    const res = await deleteClinicalCaseAction('case-1');

    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toMatch(/archivos del caso/i);
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it('sin archivos: omite GCS y borra BD', async () => {
    mockEligibleCaseSelects([]);

    const { deleteClinicalCaseAction } = await import('@/lib/db/actions/cases');
    const res = await deleteClinicalCaseAction('case-1');

    expect(res.success).toBe(true);
    expect(deleteFilesStrictMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).toHaveBeenCalled();
  });

  it('bloquea borrar origen si existe copia en borrador', async () => {
    mockEligibleCaseSelects([], {
      activeCopy: { id: 'copy-1', caseNumber: 'DF-1248' },
    });

    const { deleteClinicalCaseAction } = await import('@/lib/db/actions/cases');
    const res = await deleteClinicalCaseAction('case-orig');

    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toMatch(/copia en borrador/i);
    expect(deleteFilesStrictMock).not.toHaveBeenCalled();
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });
});
