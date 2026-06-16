import { Filter } from 'lucide-react';
import { PARAM_GROUPS_BY_STEP } from '../simulatorConstants';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import { buildPoolEmptyExplanation } from '@/lib/fauchard/simulationHelpers';
import SimulatorActiveConfigRows from '../shared/SimulatorActiveConfigRows';
import SimulatorFunnelSummary from '../results/SimulatorFunnelSummary';
import SimulatorFilterFunnel from '../results/SimulatorFilterFunnel';
import SimulatorExclusionChips from '../shared/SimulatorExclusionChips';

export default function SimulatorStepFiltros({
  currentConfig,
  result,
}: {
  currentConfig: Record<string, unknown>;
  result: SimulationResult | null;
}) {
  const poolEmptyExplanation = result?.poolEmpty ? buildPoolEmptyExplanation(result) : null;

  return (
    <div className="space-y-8">
      <div className="p-8 rounded-[2.5rem] bg-surface/40 border border-divider shadow-xl">
        <SimulatorActiveConfigRows
          groups={PARAM_GROUPS_BY_STEP.filtros}
          currentConfig={currentConfig}
          title="Parámetros de exclusión"
          subtitle="Cooldown e inactividad de la config activa — mismos umbrales que en producción."
        />
      </div>

      {result ? (
        <div className="p-6 rounded-[2rem] border border-divider bg-surface/20 space-y-5">
          <div className="flex items-center gap-3">
            <Filter className={`w-5 h-5 ${result.poolEmpty ? 'text-error' : 'text-primary'}`} />
            <div>
              <h4 className="text-sm font-bold text-foreground">Embudo de filtrado</h4>
              {poolEmptyExplanation && (
                <p className="text-[11px] text-muted mt-0.5">{poolEmptyExplanation.summaryLine}</p>
              )}
            </div>
          </div>

          {result.funnel.stages?.length > 0 && (
            <SimulatorFilterFunnel
              stages={result.funnel.stages}
              universe={result.funnel.universe}
              poolEmpty={result.poolEmpty}
            />
          )}

          {!result.poolEmpty && (
            <details className="group">
              <summary className="text-[10px] font-bold uppercase tracking-wider text-faint cursor-pointer list-none flex items-center gap-1">
                Detalle por motivo (primer fallo)
              </summary>
              <div className="mt-3">
                <SimulatorExclusionChips excluded={result.funnel.excluded} />
              </div>
            </details>
          )}
        </div>
      ) : (
        <div className="p-10 rounded-[2.5rem] border-2 border-dashed border-divider text-center space-y-3">
          <Filter className="w-8 h-8 text-faint mx-auto" />
          <h4 className="text-sm font-bold text-foreground">Embudo de filtros</h4>
          <p className="text-faint text-xs max-w-sm mx-auto">
            Ejecuta la simulación para ver cuántos técnicos pasan cada filtro en orden hasta los elegibles.
          </p>
        </div>
      )}
    </div>
  );
}
