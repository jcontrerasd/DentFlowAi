import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(),
}));

vi.mock('@/lib/db/actions/cases', () => ({
  logCaseEvent: vi.fn(),
}));

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
  },
}));

describe('deriveScenarioFromCase — workType para asignación', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefiere derived_work_type persistido sobre recálculo', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                cc: {
                  teeth: [11, 12, 13],
                  notesEsthetic: null,
                  replacesMissingTeeth: true,
                  caseComplexity: 'intermedio',
                  caseLeague: 'plata',
                  derivedWorkType: 'puente_corto',
                  derivedCategory: 'puentes',
                },
                restorationLabel: 'Puente',
              },
            ]),
          })),
        })),
      })),
    });

    const { deriveScenarioFromCase } = await import('@/lib/db/actions/assignment');
    const scenario = await deriveScenarioFromCase('case-1');
    expect(scenario.workType).toBe('puente_corto');
    expect(scenario.category).toBe('puentes');
  });

  it('recalcula con pónticos cuando derived_* es null', async () => {
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                cc: {
                  teeth: [11, 12, 13],
                  notesEsthetic: null,
                  replacesMissingTeeth: true,
                  caseComplexity: null,
                  caseLeague: null,
                  derivedWorkType: null,
                  derivedCategory: null,
                },
                restorationLabel: 'Puente',
              },
            ]),
          })),
        })),
      })),
    });

    const { deriveScenarioFromCase } = await import('@/lib/db/actions/assignment');
    const scenario = await deriveScenarioFromCase('case-1');
    expect(scenario.workType).toBe('puente_corto');
    expect(scenario.category).toBe('puentes');
  });
});
