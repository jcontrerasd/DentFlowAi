import type { CatalogOption } from '@/lib/db/actions/catalogs';
import type { CaseComplexity } from '@/lib/constants/dental';
import type { ResolvedScenario } from '@/lib/fauchard/assignmentScenario';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';

export type SimulatorFunnelStep = 'caso' | 'clasificacion' | 'filtros' | 'ranking' | 'asignacion';

export type SimulatorFormParams = {
  restorationCode: string;
  materialCode: string;
  shadeCode: string;
  urgencyLabel: string;
  teethCount: number;
  complexityMode: 'auto' | 'manual';
  caseComplexity: CaseComplexity;
  replacesMissingTeeth?: boolean | null;
};

export type SimulatorLivePrice = {
  cost: number | null;
  feePercent: number | null;
  salePrice: number | null;
  ruleCode: string | null;
  loading: boolean;
  checked: boolean;
};

export type SimulatorConfigOverride = {
  alphaQuality: number;
  alphaPunctuality: number;
  alphaExperience: number;
  alphaBonus: number;
  alphaLoad: number;
  alphaNoResponse: number;
};

export type LiveScenario = ResolvedScenario;

export interface SimulatorWorkspaceProps {
  currentConfig: Record<string, unknown>;
  catalogOptions: {
    restorations: CatalogOption[];
    materials: CatalogOption[];
    shades: CatalogOption[];
    urgencies: CatalogOption[];
  };
}

export type StepPanelProps = {
  currentConfig: Record<string, unknown>;
  result: SimulationResult | null;
};
