import { describe, it, expect, vi, beforeEach } from 'vitest';

const { identityMock, dbSelectMock, dbUpdateMock } = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: identityMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

describe('reclassifyCaseDraftAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue({ id: 'dent-1', orgId: 'org-1', role: 'dentista' });
  });

  it('rechaza si el caso no es borrador', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                cc: { status: 'enEvaluacion', teeth: [11], notesEsthetic: null, replacesMissingTeeth: false },
                restorationLabel: 'Corona Unitaria',
              },
            ]),
          })),
        })),
      })),
    });

    const { reclassifyCaseDraftAction } = await import('@/lib/db/actions/cases');
    const res = await reclassifyCaseDraftAction('case-1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/borrador/i);
  });

  it('actualiza derived_* en borrador con corona unitaria', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                cc: {
                  status: 'borrador',
                  teeth: [36],
                  notesEsthetic: null,
                  replacesMissingTeeth: false,
                },
                restorationLabel: 'Corona Unitaria',
              },
            ]),
          })),
        })),
      })),
    });

    const setMock = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    dbUpdateMock.mockReturnValue({ set: setMock });

    const { reclassifyCaseDraftAction } = await import('@/lib/db/actions/cases');
    const res = await reclassifyCaseDraftAction('case-1');
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data?.derivedWorkType).toBe('corona_unitaria');
      expect(res.data?.derivedCategory).toBe('coronas');
    }
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        derivedWorkType: 'corona_unitaria',
        derivedCategory: 'coronas',
      }),
    );
  });
});
