'use client';

import { FlaskConical, Info } from 'lucide-react';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import type { SimulatorFunnelStep } from './simulatorTypes';
import { SimulatorPriceResultCard } from './shared/SimulatorPricePreview';
import SimulatorFunnelSummary from './results/SimulatorFunnelSummary';
import SimulatorRankingTable from './results/SimulatorRankingTable';
import SimulatorChainCards from './results/SimulatorChainCards';
import SimulatorPoolEmptyExplanation from './results/SimulatorPoolEmptyExplanation';

export default function SimulatorResultPanel({
  activeStep,
  result,
  displayRanked,
  chainOnlyFilter,
  onChainOnlyFilterChange,
  excludedTechIds,
  loading,
  onSimulateReject,
  onResetRejects,
}: {
  activeStep: SimulatorFunnelStep;
  result: SimulationResult | null;
  displayRanked: SimulationResult['ranked'];
  chainOnlyFilter: boolean;
  onChainOnlyFilterChange: (v: boolean) => void;
  excludedTechIds: string[];
  loading: boolean;
  onSimulateReject: () => void;
  onResetRejects: () => void;
}) {
  if (!result) {
    return (
      <div className="lg:sticky lg:top-6 h-full min-h-[320px] flex flex-col items-center justify-center p-12 lg:p-16 border-2 border-dashed border-divider rounded-[3rem] text-center gap-4">
        <div className="w-20 h-20 rounded-[2.5rem] bg-surface flex items-center justify-center text-muted opacity-50">
          <FlaskConical className="w-10 h-10" />
        </div>
        <div className="max-w-md">
          <h4 className="text-foreground font-bold mb-1">Listo para simular</h4>
          <p className="text-muted opacity-50 text-sm">
            Configura el caso virtual en el panel izquierdo y presiona &quot;Simular asignación&quot; para ver el
            embudo, ranking y cadena de respaldo aquí.
          </p>
        </div>
      </div>
    );
  }

  if (result.poolEmpty) {
    return (
      <div className="lg:sticky lg:top-6">
        <SimulatorPoolEmptyExplanation result={result} variant="panel" />
      </div>
    );
  }

  return (
    <div className="lg:sticky lg:top-6 space-y-6 animate-in fade-in zoom-in-95 duration-500">
      {result.pricePreview && <SimulatorPriceResultCard preview={result.pricePreview} />}

      {(activeStep === 'filtros' || activeStep === 'caso' || activeStep === 'clasificacion') && (
        <SimulatorFunnelSummary result={result} showFunnelChart={activeStep !== 'filtros'} />
      )}

      {(activeStep === 'ranking' || activeStep === 'asignacion') && (
        <SimulatorRankingTable
          displayRanked={displayRanked}
          chainOnlyFilter={chainOnlyFilter}
          onChainOnlyFilterChange={onChainOnlyFilterChange}
        />
      )}

      {activeStep === 'asignacion' && (
        <>
          <SimulatorChainCards
            result={result}
            excludedTechIds={excludedTechIds}
            loading={loading}
            onSimulateReject={onSimulateReject}
            onResetRejects={onResetRejects}
          />
          <div className="p-6 rounded-3xl bg-surface border border-divider flex gap-4">
            <Info className="w-5 h-5 text-muted shrink-0" />
            <p className="text-xs text-muted leading-relaxed">
              Asignación directa: el técnico #1 recibe el caso. Usa &quot;Simular rechazo&quot; para probar el
              respaldo siguiente en la cadena.
            </p>
          </div>
        </>
      )}

      {activeStep !== 'asignacion' && activeStep !== 'ranking' && (
        <p className="text-xs text-muted text-center">
          Navega a Ranking o Asignación para ver la tabla completa y la cadena de respaldo.
        </p>
      )}
    </div>
  );
}
