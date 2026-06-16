import { describe, it, expect } from 'vitest';
import type { ExclusionReason } from '@/lib/db/actions/assignment';
import { CASE_COMPLEXITY } from '@/lib/constants/dental';
import type { ResolvedScenario } from '@/lib/fauchard/assignmentScenario';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import {
  EXCLUSION_LABELS,
  PARAM_GROUPS,
  PARAM_GROUPS_BY_STEP,
  FUNNEL_STEPS,
  resolveStepBadge,
  isStepDone,
} from '@/components/admin/fauchard/simulator/simulatorConstants';

const EXCLUSION_REASONS: ExclusionReason[] = [
  'not_available',
  'suspended',
  'inactive',
  'league_mismatch',
  'cooldown',
  'insufficient_skill',
  'availability_filter',
  'excluded_manually',
];

const mockScenario = {
  workType: 'corona_unitaria',
  caseLeague: 'plata',
  caseComplexity: CASE_COMPLEXITY.INTERMEDIO,
  category: 'coronas' as const,
};

const mockLiveScenario: ResolvedScenario = {
  restorationLabel: 'Corona',
  teeth: [11],
  workType: 'corona_unitaria',
  caseLeague: 'plata',
  caseComplexity: CASE_COMPLEXITY.INTERMEDIO,
  category: 'coronas',
};

function makeResult(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    scenario: mockScenario,
    config: {
      maxAssignmentAttempts: 3,
      tQuoteMinutes: 30,
      tCooldownMinutes: 60,
      weights: {
        alphaQuality: 0.20,
        alphaPunctuality: 0.15,
        alphaExperience: 0.15,
        alphaBonus: 0.10,
        alphaLoad: 0.15,
        alphaNoResponse: 0.25,
      },
    },
    funnel: {
      universe: 10,
      eligible: 4,
      excluded: {
        not_available: 1,
        suspended: 0,
        inactive: 0,
        league_mismatch: 2,
        cooldown: 1,
        insufficient_skill: 1,
        availability_filter: 1,
        excluded_manually: 0,
      },
      stages: [
        { id: 'universe', label: 'Universo', countAfter: 10, dropped: 0, fixHint: '' },
        { id: 'not_available', label: 'Disponible global', countAfter: 9, dropped: 1, fixHint: '', reason: 'not_available' },
        { id: 'league', label: 'Liga', countAfter: 7, dropped: 2, fixHint: '', reason: 'league_mismatch' },
        { id: 'eligible', label: 'Elegibles', countAfter: 4, dropped: 0, fixHint: '' },
      ],
    },
    ranked: [
      {
        technicianId: 't1',
        fullName: 'Ana López',
        leagueLevel: 'plata',
        rank: 1,
        score: 0.82,
        components: { Q: 0.9, P: 0.8, E: 0.7, B: 0.5, L: 0.1, N: 0 },
        activeLoad: 2,
        excluded: false,
        wouldAssign: true,
        chainPosition: 1,
      },
    ],
    assignmentPreview: {
      selectedTechnicianId: 't1',
      attemptsBudget: 3,
      retryChain: ['t1'],
      retryChainDetails: [
        {
          position: 1,
          technicianId: 't1',
          fullName: 'Ana López',
          score: 0.82,
          leagueLevel: 'plata',
        },
      ],
    },
    pricePreview: null,
    poolEmpty: false,
    ...overrides,
  };
}

describe('simulatorConstants', () => {
  it('EXCLUSION_LABELS covers every ExclusionReason', () => {
    for (const reason of EXCLUSION_REASONS) {
      expect(EXCLUSION_LABELS[reason]).toBeTruthy();
    }
  });

  it('PARAM_GROUPS_BY_STEP partitions PARAM_GROUPS without duplication', () => {
    const allKeys = new Set<string>();
    for (const groups of Object.values(PARAM_GROUPS_BY_STEP)) {
      for (const g of groups) {
        for (const item of g.items) {
          expect(allKeys.has(item.key)).toBe(false);
          allKeys.add(item.key);
        }
      }
    }
    const flatParamKeys = PARAM_GROUPS.flatMap((g) => g.items.map((i) => i.key));
    expect([...allKeys].sort()).toEqual(flatParamKeys.sort());
  });

  it('FUNNEL_STEPS has 5 steps in funnel order', () => {
    expect(FUNNEL_STEPS.map((s) => s.id)).toEqual([
      'caso',
      'clasificacion',
      'filtros',
      'ranking',
      'asignacion',
    ]);
  });
});

describe('resolveStepBadge', () => {
  const result = makeResult();

  it('returns workType for caso step', () => {
    expect(resolveStepBadge('caso', null, mockLiveScenario)).toBe('corona_unitaria');
  });

  it('returns eligible/universe for filtros after simulation', () => {
    expect(resolveStepBadge('filtros', result, mockLiveScenario)).toBe('4/10');
  });

  it('returns top ranked name for ranking step', () => {
    expect(resolveStepBadge('ranking', result, mockLiveScenario)).toBe('#1 Ana');
  });

  it('returns assigned first name for asignacion step', () => {
    expect(resolveStepBadge('asignacion', result, mockLiveScenario)).toBe('Ana');
  });

  it('returns null for motor steps without result', () => {
    expect(resolveStepBadge('filtros', null, mockLiveScenario)).toBeNull();
    expect(resolveStepBadge('ranking', null, mockLiveScenario)).toBeNull();
  });
});

describe('isStepDone', () => {
  it('caso and clasificacion are always done', () => {
    expect(isStepDone('caso', null)).toBe(true);
    expect(isStepDone('clasificacion', null)).toBe(true);
  });

  it('motor steps need non-empty result', () => {
    expect(isStepDone('filtros', null)).toBe(false);
    expect(isStepDone('filtros', makeResult())).toBe(true);
    expect(isStepDone('ranking', makeResult({ poolEmpty: true }))).toBe(false);
  });
});
