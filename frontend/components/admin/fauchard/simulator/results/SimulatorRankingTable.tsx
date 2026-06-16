import { AlertCircle, ListFilter, Trophy } from 'lucide-react';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import { EXCLUSION_LABELS } from '../simulatorConstants';

function RankingRow({ row }: { row: SimulationResult['ranked'][number] }) {
  const chainPos = row.chainPosition;
  const isWinner = chainPos === 1;
  const isBackup = chainPos != null && chainPos > 1;

  let rowClass = 'hover:bg-surface-2/30';
  if (row.excluded) rowClass = 'opacity-40';
  else if (isWinner) rowClass = 'bg-emerald-500/5 border-l-4 border-l-emerald-500';
  else if (isBackup) rowClass = 'bg-amber-500/5 border-l-4 border-l-amber-500/60';

  return (
    <tr className={`transition-colors ${rowClass}`}>
      <td className="px-6 py-4 text-xs font-mono font-bold text-muted">{row.rank}</td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold text-foreground">{row.fullName}</span>
          <span className="text-[9px] font-bold uppercase text-faint">{row.leagueLevel}</span>
          {row.excluded && (
            <span className="text-[8px] font-black uppercase text-error mt-1 flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" />{' '}
              {row.exclusionReason
                ? EXCLUSION_LABELS[row.exclusionReason] ?? row.exclusionReason
                : 'Excluido'}
            </span>
          )}
          {isWinner && (
            <span className="text-[8px] font-black uppercase text-emerald-600 mt-1 flex items-center gap-1">
              <Trophy className="w-2.5 h-2.5" /> Vista previa #1
            </span>
          )}
          {isBackup && (
            <span className="text-[8px] font-black uppercase text-amber-600 mt-1">Respaldo #{chainPos}</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-xs font-mono font-bold text-primary">{row.score.toFixed(3)}</span>
      </td>
      <td className="px-6 py-4">
        <div className="flex gap-1.5">
          {(['Q', 'P', 'E', 'B', 'L', 'N'] as const).map((k) => (
            <div key={k} className="flex flex-col items-center">
              <span className="text-[7px] font-black text-faint">{k}</span>
              <span className="text-[9px] font-mono text-muted">{row.components[k].toFixed(2)}</span>
            </div>
          ))}
        </div>
      </td>
      <td className="px-6 py-4 text-[10px] font-mono text-muted">{row.activeLoad}</td>
    </tr>
  );
}

export default function SimulatorRankingTable({
  displayRanked,
  chainOnlyFilter,
  onChainOnlyFilterChange,
}: {
  displayRanked: SimulationResult['ranked'];
  chainOnlyFilter: boolean;
  onChainOnlyFilterChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h4 className="text-sm font-bold uppercase tracking-wider text-foreground">Ranking Q/P/E/B/L/N</h4>
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-muted cursor-pointer">
          <ListFilter className="w-3.5 h-3.5" />
          <input
            type="checkbox"
            checked={chainOnlyFilter}
            onChange={(e) => onChainOnlyFilterChange(e.target.checked)}
            className="rounded"
          />
          Solo cadena de asignación
        </label>
      </div>

      <div className="rounded-[2rem] border border-divider bg-surface/20 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-surface border-b border-divider text-[9px] font-bold uppercase tracking-wider text-faint">
              <th className="px-6 py-5">#</th>
              <th className="px-6 py-5">Técnico</th>
              <th className="px-6 py-5">Score</th>
              <th className="px-6 py-5">Q/P/E/B/L/N</th>
              <th className="px-6 py-5">Carga</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {displayRanked.map((d) => (
              <RankingRow key={d.technicianId} row={d} />
            ))}
          </tbody>
        </table>
        {displayRanked.length === 0 && (
          <p className="p-6 text-center text-faint text-sm">Sin filas que mostrar con el filtro actual.</p>
        )}
      </div>
    </div>
  );
}
