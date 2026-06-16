import { describe, it, expect } from 'vitest';
import type { ExclusionReason } from '@/lib/db/actions/assignment';
import { CASE_COMPLEXITY } from '@/lib/constants/dental';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import { buildPoolEmptyExplanation } from '@/lib/fauchard/simulationHelpers';

const emptyExcluded: Record<ExclusionReason, number> = {
  not_available: 0,
  suspended: 0,
  inactive: 0,
  league_mismatch: 0,
  cooldown: 0,
  insufficient_skill: 0,
  availability_filter: 0,
  excluded_manually: 0,
};

const baseScenario = {
  workType: 'corona_multiple_corta',
  caseLeague: 'bronce',
  caseComplexity: CASE_COMPLEXITY.BASICO,
  category: 'coronas' as const,
};

function makePoolEmptyResult(
  excluded: Partial<Record<ExclusionReason, number>>,
  universe = 18,
  bottleneck: 'availability_filter' | 'insufficient_skill' = 'availability_filter',
): SimulationResult {
  const dominant = Object.entries(excluded).find(([, c]) => (c ?? 0) > 0)?.[0] as ExclusionReason | undefined;
  const hasExcluded = dominant != null;
  const stageReason = dominant ?? bottleneck;
  const dropped = hasExcluded ? (excluded[stageReason] ?? universe) : 0;
  return {
    scenario: baseScenario,
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
      universe,
      eligible: 0,
      excluded: { ...emptyExcluded, ...excluded },
      stages: hasExcluded
        ? [
            { id: 'universe', label: 'Universo', countAfter: universe, dropped: 0, fixHint: '' },
            {
              id: stageReason === 'insufficient_skill' ? 'insufficient_skill' : 'availability_filter',
              label: stageReason === 'insufficient_skill' ? 'Skill diseño' : 'Disponibilidad CAD · Coronas',
              countAfter: 0,
              dropped,
              fixHint: stageReason === 'insufficient_skill' ? 'Matriz de skills' : 'Perfil → Disponibilidad',
              reason: stageReason,
              isBottleneck: true,
            },
            { id: 'eligible', label: 'Elegibles', countAfter: 0, dropped: 0, fixHint: '' },
          ]
        : [],
    },
    ranked: [],
    assignmentPreview: {
      selectedTechnicianId: null,
      attemptsBudget: 3,
      retryChain: [],
      retryChainDetails: [],
    },
    pricePreview: null,
    poolEmpty: true,
  };
}

describe('buildPoolEmptyExplanation', () => {
  it('lista criterio explícito de disponibilidad CAD con cómo resolver', () => {
    const explanation = buildPoolEmptyExplanation(
      makePoolEmptyResult({ availability_filter: 18 }),
    );
    expect(explanation.dominantReason).toBe('availability_filter');
    expect(explanation.failedCriteria).toHaveLength(1);
    expect(explanation.failedCriteria[0]?.criterionName).toMatch(/Disponibilidad CAD/i);
    expect(explanation.failedCriteria[0]?.howToFix).toMatch(/Disponibilidad|Perfil/i);
    expect(explanation.summaryLine).toMatch(/Se vació en/i);
    expect(explanation.caseRequirements).toMatch(/Coronas Múltiples/i);
  });

  it('lista criterio de skill con nivel mínimo y liga', () => {
    const explanation = buildPoolEmptyExplanation(
      makePoolEmptyResult({ insufficient_skill: 15 }, 15, 'insufficient_skill'),
    );
    expect(explanation.failedCriteria[0]?.criterionName).toMatch(/Skill diseño/i);
    expect(explanation.failedCriteria[0]?.howToFix).toMatch(/Matriz de skills|skills/i);
  });

  it('enumera etapas con pérdidas cuando hay mezcla en stages', () => {
    const result = makePoolEmptyResult({ availability_filter: 10, insufficient_skill: 8 }, 18);
    result.funnel.stages = [
      { id: 'universe', label: 'Universo', countAfter: 18, dropped: 0, fixHint: '' },
      { id: 'insufficient_skill', label: 'Skill', countAfter: 8, dropped: 10, fixHint: 'skills', reason: 'insufficient_skill' },
      { id: 'availability_filter', label: 'CAD', countAfter: 0, dropped: 8, fixHint: 'disp', reason: 'availability_filter', isBottleneck: true },
      { id: 'eligible', label: 'Elegibles', countAfter: 0, dropped: 0, fixHint: '' },
    ];
    const explanation = buildPoolEmptyExplanation(result);
    expect(explanation.failedCriteria).toHaveLength(2);
    expect(explanation.summaryLine).toMatch(/Se vació en.*CAD/i);
  });

  it('sin exclusiones registradas incluye criterio de diagnóstico y fix', () => {
    const explanation = buildPoolEmptyExplanation(makePoolEmptyResult({}));
    expect(explanation.dominantReason).toBeNull();
    expect(explanation.failedCriteria[0]?.criterionName).toBe('Diagnóstico no registrado');
    expect(explanation.failedCriteria[0]?.howToFix).toMatch(/Vuelve a simular/i);
  });

  it('incluye requisitos del caso y nota de producción', () => {
    const explanation = buildPoolEmptyExplanation(
      makePoolEmptyResult({ not_available: 5 }, 5),
    );
    expect(explanation.caseRequirements).toMatch(/liga bronce/i);
    expect(explanation.productionNote).toMatch(/pendiente_pool|producción/i);
  });
});
