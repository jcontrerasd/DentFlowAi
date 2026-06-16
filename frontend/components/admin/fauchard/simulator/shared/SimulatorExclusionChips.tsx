import { XCircle } from 'lucide-react';
import type { ExclusionReason } from '@/lib/db/actions/assignment';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import { EXCLUSION_CRITERION_NAMES } from '@/lib/fauchard/simulationHelpers';

export default function SimulatorExclusionChips({
  excluded,
  emptyMessage = 'Sin exclusiones registradas en el embudo.',
}: {
  excluded: SimulationResult['funnel']['excluded'];
  emptyMessage?: string;
}) {
  const entries = Object.entries(excluded).filter(([, n]) => n > 0);

  if (entries.length === 0) {
    return <span className="text-[10px] text-faint">{emptyMessage}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([key, count]) => (
        <span
          key={key}
          className="text-[10px] font-bold px-3 py-1 rounded-full bg-error-hl border border-error/30 text-error flex items-center gap-1.5"
        >
          <XCircle className="w-3 h-3" />
          {EXCLUSION_CRITERION_NAMES[key as ExclusionReason] ?? key}: {count}
        </span>
      ))}
    </div>
  );
}
