import { describe, expect, it, vi, beforeEach } from 'vitest';

const { identityMock, dbExecuteMock, dbSelectMock, dbTransactionMock } = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbExecuteMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbTransactionMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: identityMock,
}));

vi.mock('@/lib/services/gcp-storage', () => ({
  default: {
    copyFile: vi.fn().mockResolvedValue(undefined),
    deleteFiles: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
    transaction: dbTransactionMock,
    execute: dbExecuteMock,
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('cloneCaseFromTerminalAction — caseNumber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue({ id: 'dent-1', orgId: 'org-1', role: 'dentista' });
    dbExecuteMock.mockResolvedValue([{ val: 1248 }]);

    let selectCall = 0;
    dbSelectMock.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          selectCall += 1;
          if (selectCall === 1) {
            return {
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'source-1',
                  organizationId: 'org-1',
                  doctorId: 'dent-1',
                  status: 'completado',
                  caseNumber: 'DF-1247',
                  internalName: 'Caso origen',
                  material: 'Zirconio',
                  needsFabrication: false,
                  patientIdAnon: 'PAC-1',
                  restorationType: 'Corona',
                  shade: null,
                  teeth: [],
                  urgency: 'normal',
                  serviceType: 'solo_diseno',
                  caseComplexity: null,
                  specialInstructions: null,
                  caseLeague: null,
                  notesEsthetic: null,
                  notesOclusal: null,
                },
              ]),
            };
          }
          return Promise.resolve([]);
        }),
      })),
    }));
  });

  it('asigna caseNumber distinto al origen sin archivar el origen', async () => {
    let insertedCaseNumber: string | undefined;
    let archiveInsertCount = 0;

    dbTransactionMock.mockImplementation(async (cb) => {
      const tx = {
        insert: vi.fn(() => ({
          values: vi.fn((vals: { caseNumber?: string; clinicalCaseId?: string; archivedAt?: Date }) => {
            if (vals?.caseNumber) insertedCaseNumber = vals.caseNumber;
            if (vals?.clinicalCaseId && vals?.archivedAt) archiveInsertCount += 1;
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            };
          }),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
        })),
      };
      await cb(tx);
    });

    const { cloneCaseFromTerminalAction } = await import('@/lib/db/actions/cases');
    const res = await cloneCaseFromTerminalAction('source-1');

    expect(res.success).toBe(true);
    expect(res.caseNumber).toBe('DF-1248');
    expect(res.caseNumber).not.toBe('DF-1247');
    expect(insertedCaseNumber).toBe('DF-1248');
    expect(archiveInsertCount).toBe(0);
  });
});
