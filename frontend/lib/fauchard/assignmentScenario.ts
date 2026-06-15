/**
 * Escenario virtual de asignación — inputs equivalentes a classifyCase + buildEligiblePool.
 */

import {
  CASE_COMPLEXITY,
  type CaseComplexity,
} from '@/lib/constants/dental';
import { categoryForWorkType, getWorkTypeForCase } from '@/lib/fauchard/caseWorkType';

export type AssignmentScenario = {
  restorationLabel: string;
  teeth: number[];
  caseComplexity?: CaseComplexity;
  caseLeague?: string;
  notesEstheticLength?: number;
};

export const COMPLEXITY_TO_LEAGUE: Record<string, string> = {
  [CASE_COMPLEXITY.BASICO]: 'bronce',
  [CASE_COMPLEXITY.INTERMEDIO]: 'plata',
  [CASE_COMPLEXITY.AVANZADO]: 'oro',
  [CASE_COMPLEXITY.CRITICO]: 'elite',
};

export type ResolvedScenario = AssignmentScenario & {
  workType: string;
  caseComplexity: CaseComplexity;
  caseLeague: string;
  category: ReturnType<typeof categoryForWorkType>;
};

/** Deriva complejidad con las mismas reglas que classifyCaseAction. */
export function deriveCaseComplexity(
  restorationLabel: string,
  teeth: number[],
  notesEstheticLength = 0,
): CaseComplexity {
  const workTypeHint = getWorkTypeForCase(restorationLabel, teeth);
  if (
    teeth.length >= 10 ||
    ['full_arch', 'protesis_parcial_removible', 'protesis_total', 'sobredentadura', 'barra_implantes'].includes(
      workTypeHint,
    )
  ) {
    return CASE_COMPLEXITY.AVANZADO;
  }
  if (
    teeth.length >= 4 ||
    ['puente_4mas', 'carillas_multiples'].includes(workTypeHint) ||
    (teeth.length >= 4 && restorationLabel === 'Carilla') ||
    (teeth.length >= 4 && restorationLabel === 'Puente')
  ) {
    return CASE_COMPLEXITY.INTERMEDIO;
  }
  if (restorationLabel === 'Guía Quirúrgica' || notesEstheticLength > 100) {
    return CASE_COMPLEXITY.CRITICO;
  }
  return CASE_COMPLEXITY.BASICO;
}

export function deriveScenarioFromInputs(
  restorationLabel: string,
  teeth: number[] = [],
  caseComplexity?: CaseComplexity,
  notesEstheticLength = 0,
): ResolvedScenario {
  const complexity = caseComplexity ?? deriveCaseComplexity(restorationLabel, teeth, notesEstheticLength);
  const workType = getWorkTypeForCase(restorationLabel, teeth);
  const caseLeague = COMPLEXITY_TO_LEAGUE[complexity] ?? 'bronce';
  return {
    restorationLabel,
    teeth,
    caseComplexity: complexity,
    caseLeague,
    notesEstheticLength,
    workType,
    category: categoryForWorkType(workType),
  };
}
