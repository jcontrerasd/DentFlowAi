import { ChevronRight, Trophy } from 'lucide-react';
import { formatUchQuoteClp } from '@/lib/uchQuoteDisplay';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import Button from '@/components/ui/Button';
import { RotateCcw } from 'lucide-react';

function ChainCard({
  entry,
  compensation,
}: {
  entry: SimulationResult['assignmentPreview']['retryChainDetails'][number];
  compensation?: number;
}) {
  const isWinner = entry.position === 1;
  const isBackup = entry.position > 1;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border min-w-[200px] ${
        isWinner
          ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm shadow-emerald-500/10'
          : isBackup
            ? 'bg-amber-500/10 border-amber-500/40'
            : 'bg-surface border-divider'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          isWinner ? 'bg-emerald-500 text-white' : 'bg-amber-500/20 text-amber-600'
        }`}
      >
        {isWinner ? <Trophy className="w-4 h-4" /> : <span className="text-xs font-black">#{entry.position}</span>}
      </div>
      <div className="min-w-0">
        <span className={`text-[8px] font-black uppercase block ${isWinner ? 'text-emerald-600' : 'text-amber-600'}`}>
          {isWinner ? 'Asignado' : `Respaldo #${entry.position}`}
        </span>
        <span className="text-[11px] font-bold text-foreground truncate block">{entry.fullName}</span>
        <span className="text-[9px] text-faint">
          {entry.leagueLevel} · score {entry.score.toFixed(3)}
          {compensation != null && ` · ${formatUchQuoteClp(compensation)}`}
        </span>
      </div>
      {isBackup && <ChevronRight className="w-4 h-4 text-amber-500/50 shrink-0" />}
    </div>
  );
}

export default function SimulatorChainCards({
  result,
  excludedTechIds,
  loading,
  onSimulateReject,
  onResetRejects,
}: {
  result: SimulationResult;
  excludedTechIds: string[];
  loading: boolean;
  onSimulateReject: () => void;
  onResetRejects: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-divider bg-surface/20 p-6 space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <span className="text-[9px] font-black uppercase text-primary/60 block">Cadena de asignación</span>
          <p className="text-sm text-foreground font-medium">
            Plazo {result.config.tQuoteMinutes} min · hasta {result.assignmentPreview.attemptsBudget} intentos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {excludedTechIds.length > 0 && (
            <button
              type="button"
              onClick={onResetRejects}
              className="text-[10px] font-bold uppercase text-muted hover:text-foreground px-3 py-1.5 rounded-lg border border-divider"
            >
              Reiniciar rechazos ({excludedTechIds.length})
            </button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={onSimulateReject}
            disabled={loading || !result.assignmentPreview.selectedTechnicianId}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Simular rechazo del asignado
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {result.assignmentPreview.retryChainDetails.map((entry) => (
          <ChainCard key={entry.technicianId} entry={entry} compensation={result.pricePreview?.cost} />
        ))}
        {result.assignmentPreview.retryChainDetails.length < result.assignmentPreview.attemptsBudget && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-divider text-faint text-[10px] font-bold uppercase">
            Cadena incompleta — solo {result.assignmentPreview.retryChainDetails.length} elegible(s)
          </div>
        )}
      </div>
    </div>
  );
}
