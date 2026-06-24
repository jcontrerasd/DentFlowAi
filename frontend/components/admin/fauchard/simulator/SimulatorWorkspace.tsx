'use client';

import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { simulateFauchardAction } from '@/lib/db/actions/fauchard';
import { getSimulatorSeedFromCaseAction } from '@/lib/db/actions/assignment';
import { resolveListPriceAction } from '@/lib/db/actions/priceRules';
import { CASE_COMPLEXITY } from '@/lib/constants/dental';
import { deriveScenarioFromInputs } from '@/lib/fauchard/assignmentScenario';
import { resolvePonticFlag } from '@/lib/fauchard/caseWorkType';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import Button from '@/components/ui/Button';
import SimulatorFunnelStepper from './SimulatorFunnelStepper';
import SimulatorResultPanel from './SimulatorResultPanel';
import SimulatorStepCaso from './steps/SimulatorStepCaso';
import SimulatorStepClasificacion from './steps/SimulatorStepClasificacion';
import SimulatorStepFiltros from './steps/SimulatorStepFiltros';
import SimulatorStepRanking from './steps/SimulatorStepRanking';
import SimulatorStepAsignacion from './steps/SimulatorStepAsignacion';
import SimulatorPoolEmptyExplanation from './results/SimulatorPoolEmptyExplanation';
import { renormalizeActiveAlphas, roundAlphaWeight } from '@/lib/fauchard/alphaWeightNormalize';
import type {
  SimulatorConfigOverride,
  SimulatorFormParams,
  SimulatorFunnelStep,
  SimulatorLivePrice,
  SimulatorWorkspaceProps,
} from './simulatorTypes';

export default function SimulatorWorkspace({ currentConfig, catalogOptions }: SimulatorWorkspaceProps) {
  const { restorations, materials, shades, urgencies } = catalogOptions;
  const defaultRestorationCode = restorations[0]?.code ?? 'rest_001';

  const [activeStep, setActiveStep] = useState<SimulatorFunnelStep>('caso');
  const [params, setParams] = useState<SimulatorFormParams>({
    restorationCode: defaultRestorationCode,
    materialCode: materials[0]?.code ?? '',
    shadeCode: shades[0]?.code ?? '',
    urgencyLabel: urgencies.find((u) => u.label === 'Normal')?.label ?? urgencies[0]?.label ?? 'Normal',
    teethCount: 1,
    complexityMode: 'auto',
    caseComplexity: CASE_COMPLEXITY.INTERMEDIO,
    replacesMissingTeeth: false,
  });

  const [useOverride, setUseOverride] = useState(false);
  const [useAnchoredConfig, setUseAnchoredConfig] = useState(false);
  const [anchoredConfigId, setAnchoredConfigId] = useState('');
  const [seedCaseId, setSeedCaseId] = useState('');
  const [seedLoading, setSeedLoading] = useState(false);
  const [teethOverride, setTeethOverride] = useState<number[] | null>(null);
  const [configOverride, setConfigOverride] = useState<SimulatorConfigOverride>({
    alphaQuality: Number(currentConfig.alphaQuality),
    alphaPunctuality: Number(currentConfig.alphaPunctuality),
    alphaExperience: Number(currentConfig.alphaExperience),
    alphaBonus: Number(currentConfig.alphaBonus ?? 0.10),
    alphaLoad: Number(currentConfig.alphaLoad),
    alphaNoResponse: Number(currentConfig.alphaNoResponse ?? 0.25),
  });

  const [excludedTechIds, setExcludedTechIds] = useState<string[]>([]);
  const [chainOnlyFilter, setChainOnlyFilter] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [livePrice, setLivePrice] = useState<SimulatorLivePrice>({
    cost: null,
    feePercent: null,
    salePrice: null,
    ruleCode: null,
    loading: false,
    checked: false,
  });

  const restorationLabel = useMemo(
    () => restorations.find((r) => r.code === params.restorationCode)?.label ?? '',
    [restorations, params.restorationCode],
  );

  const teeth = useMemo(() => {
    if (teethOverride?.length) return teethOverride;
    return params.teethCount > 1 ? Array.from({ length: params.teethCount }, (_, i) => i + 11) : [];
  }, [params.teethCount, teethOverride]);

  const liveScenario = useMemo(() => {
    const complexityOverride = params.complexityMode === 'auto' ? undefined : params.caseComplexity;
    return deriveScenarioFromInputs(
      restorationLabel,
      teeth,
      complexityOverride,
      params.replacesMissingTeeth,
    );
  }, [params, teeth, restorationLabel]);

  useEffect(() => {
    const { restorationCode, materialCode, shadeCode, urgencyLabel } = params;
    if (!restorationCode || !materialCode || !shadeCode || !urgencyLabel) {
      setLivePrice({ cost: null, feePercent: null, salePrice: null, ruleCode: null, loading: false, checked: false });
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLivePrice((p) => ({ ...p, loading: true }));
      const res = await resolveListPriceAction({
        restorationType: restorationCode,
        material: materialCode,
        shade: shadeCode,
        urgency: urgencyLabel,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setLivePrice({
          cost: res.data.cost,
          feePercent: res.data.feePercent,
          salePrice: res.data.salePrice,
          ruleCode: res.data.ruleCode ?? null,
          loading: false,
          checked: true,
        });
      } else {
        setLivePrice({ cost: null, feePercent: null, salePrice: null, ruleCode: null, loading: false, checked: true });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params.restorationCode, params.materialCode, params.shadeCode, params.urgencyLabel]);

  const handleSimulate = async (extraExclude?: string[]) => {
    setLoading(true);
    const excludeIds = extraExclude ?? excludedTechIds;

    const res = await simulateFauchardAction({
      restorationType: restorationLabel,
      restorationCode: params.restorationCode,
      complexityMode: params.complexityMode,
      caseComplexity: params.complexityMode === 'manual' ? params.caseComplexity : undefined,
      teeth,
      replacesMissingTeeth: params.replacesMissingTeeth,
      materialCode: params.materialCode,
      shadeCode: params.shadeCode,
      urgencyLabel: params.urgencyLabel,
      excludeTechnicianIds: excludeIds,
      configOverride: useOverride ? configOverride : undefined,
      fauchardConfigId: useAnchoredConfig && anchoredConfigId.trim() ? anchoredConfigId.trim() : undefined,
    });
    if (res.success) {
      setResult(res.simulation);
      if (extraExclude) setExcludedTechIds(extraExclude);
    }
    setLoading(false);
  };

  const handleSimulateReject = async () => {
    const current = result?.assignmentPreview.selectedTechnicianId;
    if (!current) return;
    const nextExclude = [...excludedTechIds, current];
    await handleSimulate(nextExclude);
  };

  const handleResetRejects = () => {
    setExcludedTechIds([]);
    handleSimulate([]);
  };

  const handleOverrideChange = (key: keyof SimulatorConfigOverride, val: number) => {
    const rounded = roundAlphaWeight(val);
    setConfigOverride((prev) => ({ ...prev, [key]: rounded }));
  };

  const balanceOverride = () => {
    setConfigOverride((prev) => renormalizeActiveAlphas(prev) as SimulatorConfigOverride);
  };

  const handleLoadCaseSeed = async () => {
    const id = seedCaseId.trim();
    if (!id) return;
    setSeedLoading(true);
    const res = await getSimulatorSeedFromCaseAction(id);
    setSeedLoading(false);
    if (!res.success) return;
    const restorationLabel = restorations.find((r) => r.code === res.restorationCode)?.label ?? '';
    const pontics =
      res.replacesMissingTeeth === true || res.replacesMissingTeeth === false
        ? res.replacesMissingTeeth
        : resolvePonticFlag(null, restorationLabel);
    setParams((p) => ({
      ...p,
      restorationCode: res.restorationCode,
      materialCode: res.materialCode,
      shadeCode: res.shadeCode,
      urgencyLabel: res.urgencyLabel,
      teethCount: res.teethCount,
      replacesMissingTeeth: pontics,
      complexityMode: res.complexityMode,
      caseComplexity: res.caseComplexity ?? p.caseComplexity,
    }));
    setTeethOverride(res.teeth);
    setActiveStep('caso');
  };

  const sumOverride = Object.values(configOverride).reduce((a, b) => a + b, 0);
  const isSumValid = Math.abs(sumOverride - 1.0) < 0.001;

  const displayRanked = useMemo(() => {
    if (!result) return [];
    if (!chainOnlyFilter) return result.ranked;
    const maxPos = result.assignmentPreview.attemptsBudget;
    return result.ranked.filter(
      (r) => r.excluded || (r.chainPosition != null && r.chainPosition <= maxPos),
    );
  }, [result, chainOnlyFilter]);

  const renderActiveStep = () => {
    switch (activeStep) {
      case 'caso':
        return (
          <SimulatorStepCaso
            params={params}
            onParamsChange={setParams}
            catalogOptions={catalogOptions}
            livePrice={livePrice}
          />
        );
      case 'clasificacion':
        return <SimulatorStepClasificacion liveScenario={liveScenario} />;
      case 'filtros':
        return <SimulatorStepFiltros currentConfig={currentConfig} result={result} />;
      case 'ranking':
        return (
          <SimulatorStepRanking
            currentConfig={currentConfig}
            result={result}
            useOverride={useOverride}
            onUseOverrideChange={setUseOverride}
            configOverride={configOverride}
            onOverrideChange={handleOverrideChange}
            onBalanceOverride={balanceOverride}
            sumOverride={sumOverride}
            isSumValid={isSumValid}
          />
        );
      case 'asignacion':
        return (
          <SimulatorStepAsignacion currentConfig={currentConfig} result={result} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-divider bg-surface/40 px-3 py-2 flex flex-wrap items-center gap-3 text-[10px]">
        <div className="flex items-center gap-2 min-w-[12rem] flex-1">
          <input
            type="text"
            value={seedCaseId}
            onChange={(e) => setSeedCaseId(e.target.value)}
            placeholder="DF-0001 o UUID — cargar escenario real"
            title="Acepta el número de caso (DF-XXXX) o el UUID interno. Copia los parámetros clínicos del caso al simulador."
            className="flex-1 min-w-[10rem] bg-surface border border-divider rounded-lg px-2 py-1 text-foreground"
          />
          <Button
            type="button"
            onClick={() => void handleLoadCaseSeed()}
            disabled={seedLoading || !seedCaseId.trim()}
            loading={seedLoading}
            className="py-1 px-2.5 text-[10px] rounded-lg"
          >
            Cargar caso
          </Button>
        </div>
        <label className="flex items-center gap-2 text-muted">
          <input
            type="checkbox"
            checked={useAnchoredConfig}
            onChange={e => setUseAnchoredConfig(e.target.checked)}
            className="rounded border-divider"
          />
          Config anclada (caso publicado)
        </label>
        {useAnchoredConfig && (
          <input
            type="text"
            value={anchoredConfigId}
            onChange={e => setAnchoredConfigId(e.target.value)}
            placeholder="fauchard_config_id (UUID)"
            title="Usa la misma config que un caso publicado; si está vacío, se usa la config activa."
            className="flex-1 min-w-[12rem] bg-surface border border-divider rounded-lg px-2 py-1 text-foreground"
          />
        )}
      </div>
      <div className="flex flex-col xl:flex-row xl:items-center gap-2 xl:gap-3">
        <div className="flex-1 min-w-0">
          <SimulatorFunnelStepper
            activeStep={activeStep}
            onStepChange={setActiveStep}
            result={result}
            liveScenario={liveScenario}
          />
        </div>
        <Button
          onClick={() => {
            setExcludedTechIds([]);
            handleSimulate([]);
          }}
          disabled={loading || (useOverride && !isSumValid)}
          loading={loading}
          className="py-2.5 px-5 rounded-2xl shrink-0 w-full xl:w-auto"
          icon={<Play className="w-4 h-4" />}
        >
          Simular asignación
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
        <div className="lg:col-span-5 min-w-0">{renderActiveStep()}</div>
        <div className="lg:col-span-7 min-w-0">
          <SimulatorResultPanel
            activeStep={activeStep}
            result={result}
            displayRanked={displayRanked}
            chainOnlyFilter={chainOnlyFilter}
            onChainOnlyFilterChange={setChainOnlyFilter}
            excludedTechIds={excludedTechIds}
            loading={loading}
            onSimulateReject={handleSimulateReject}
            onResetRejects={handleResetRejects}
          />
        </div>
      </div>

      {result?.poolEmpty && (
        <SimulatorPoolEmptyExplanation
          result={result}
          variant="footer"
          onViewDetail={() => setActiveStep('filtros')}
        />
      )}
    </div>
  );
}
