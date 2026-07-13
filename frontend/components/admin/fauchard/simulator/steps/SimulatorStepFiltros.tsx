import { ArrowRight } from 'lucide-react';
import { PARAM_GROUPS_BY_STEP } from '../simulatorConstants';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import { buildPoolEmptyExplanation } from '@/lib/fauchard/simulationHelpers';
import SimulatorActiveConfigRows from '../shared/SimulatorActiveConfigRows';

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

      <div className="p-6 rounded-[2rem] border border-dashed border-divider bg-surface/20 flex items-center gap-3">
        <ArrowRight className="w-5 h-5 text-primary shrink-0" />
        <p className="text-xs text-muted leading-relaxed">
          {result
            ? poolEmptyExplanation?.summaryLine ??
              'El embudo de filtros con el resultado de la simulación está en el panel de la derecha.'
            : 'Ejecuta la simulación para ver el embudo de filtros en el panel de la derecha.'}
        </p>
      </div>
    </div>
  );
}
