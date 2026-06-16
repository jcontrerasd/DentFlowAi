/**
 * Escenario virtual de asignación — inputs equivalentes a classifyCase + buildEligiblePool.
 */

import {
  type CaseComplexity,
} from '@/lib/constants/dental';
import {
  COMPLEXITY_TO_LEAGUE,
  resolveCaseComplexity,
  resolveScenario,
  type CaseClassificationInput,
  type ResolvedScenario,
} from '@/lib/fauchard/caseWorkType';

export { COMPLEXITY_TO_LEAGUE };
export type { ResolvedScenario, CaseClassificationInput };

/** Deriva complejidad con las mismas reglas que classifyCaseAction. */
export function deriveCaseComplexity(
  restorationLabel: string,
  teeth: number[],
  replacesMissingTeeth?: boolean | null,
): CaseComplexity {
  return resolveCaseComplexity({
    restorationLabel,
    teeth,
    replacesMissingTeeth,
  });
}

export function deriveScenarioFromInputs(
  restorationLabel: string,
  teeth: number[] = [],
  caseComplexity?: CaseComplexity,
  replacesMissingTeeth?: boolean | null,
): ResolvedScenario {
  const base = resolveScenario({
    restorationLabel,
    teeth,
    replacesMissingTeeth,
  });
  if (caseComplexity) {
    return {
      ...base,
      caseComplexity,
      caseLeague: COMPLEXITY_TO_LEAGUE[caseComplexity] ?? 'bronce',
    };
  }
  return base;
}
