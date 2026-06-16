import { Filter, Users, Trophy } from 'lucide-react';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import SimulatorStatCard from '../shared/SimulatorStatCard';
import SimulatorBadge from '../shared/SimulatorBadge';
import SimulatorExclusionChips from '../shared/SimulatorExclusionChips';
import SimulatorFilterFunnel from './SimulatorFilterFunnel';

export default function SimulatorFunnelSummary({
  result,
  showFunnelChart = true,
}: {
  result: SimulationResult;
  /** En paso Filtros el embudo vive solo en el panel izquierdo. */
  showFunnelChart?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <SimulatorBadge label="workType" value={result.scenario.workType} />
        <SimulatorBadge label="liga" value={result.scenario.caseLeague} />
        <SimulatorBadge label="categoría" value={result.scenario.category} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SimulatorStatCard icon={Users} label="Universo" value={String(result.funnel.universe)} />
        <SimulatorStatCard icon={Filter} label="Elegibles" value={String(result.funnel.eligible)} />
        <SimulatorStatCard
          icon={Trophy}
          label="Asignado"
          value={result.assignmentPreview.retryChainDetails[0]?.fullName?.split(' ')[0] ?? '—'}
          highlight
        />
      </div>

      {showFunnelChart && (
        <div className="rounded-[2rem] border border-divider bg-surface/20 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-primary" />
            <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Embudo de filtros</h4>
          </div>
          {result.funnel.stages?.length > 0 ? (
            <SimulatorFilterFunnel
              stages={result.funnel.stages}
              universe={result.funnel.universe}
              poolEmpty={result.poolEmpty}
              compact
            />
          ) : (
            <SimulatorExclusionChips excluded={result.funnel.excluded} />
          )}
          {result.funnel.stages?.length > 0 && (
            <details className="group">
              <summary className="text-[10px] font-bold uppercase tracking-wider text-faint cursor-pointer list-none">
                Chips por primer fallo
              </summary>
              <div className="mt-3">
                <SimulatorExclusionChips excluded={result.funnel.excluded} />
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
