/**
 * Contrato tipado del simulador Fauchard (asignación directa + preview de precio).
 */

import type { CaseComplexity } from '@/lib/constants/dental';
import type { AssignmentScoreWeights } from '@/lib/fauchard/assignmentScore';
import type { ExclusionReason, RankedTechnicianRow } from '@/lib/db/actions/assignment';

export type PricePreview = {
  resolved: boolean;
  ruleId?: string;
  ruleCode?: string;
  cost?: number;
  feePercent?: number;
  salePrice?: number;
  missingDimensions?: string[];
};

export type RetryChainEntry = {
  position: number;
  technicianId: string;
  fullName: string;
  score: number;
  leagueLevel: string;
};

export type SimulationScenario = {
  workType: string;
  caseLeague: string;
  caseComplexity: CaseComplexity;
  category: string;
};

export type SimulationConfig = {
  maxAssignmentAttempts: number;
  tQuoteMinutes: number;
  tCooldownMinutes: number;
  weights: AssignmentScoreWeights;
};

export type SimulationFunnel = {
  universe: number;
  eligible: number;
  excluded: Record<ExclusionReason, number>;
};

export type AssignmentPreview = {
  selectedTechnicianId: string | null;
  attemptsBudget: number;
  retryChain: string[];
  retryChainDetails: RetryChainEntry[];
};

export type SimulationResult = {
  scenario: SimulationScenario;
  config: SimulationConfig;
  funnel: SimulationFunnel;
  ranked: RankedTechnicianRow[];
  assignmentPreview: AssignmentPreview;
  pricePreview: PricePreview | null;
  poolEmpty: boolean;
};

export type SimulateAssignmentParams = {
  restorationLabel: string;
  restorationCode?: string;
  teeth?: number[];
  caseComplexity?: CaseComplexity;
  complexityMode?: 'auto' | 'manual';
  excludeTechnicianIds?: string[];
  configOverride?: Record<string, unknown>;
  materialCode?: string;
  shadeCode?: string;
  urgencyLabel?: string;
  notesEstheticLength?: number;
};
