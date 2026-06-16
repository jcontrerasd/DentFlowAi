'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FunnelStage } from '@/lib/fauchard/simulationTypes';

export default function SimulatorFilterFunnel({
  stages,
  universe,
  poolEmpty,
  compact = false,
}: {
  stages: FunnelStage[];
  universe: number;
  poolEmpty: boolean;
  compact?: boolean;
}) {
  const [expandedHint, setExpandedHint] = useState<string | null>(null);
  const base = Math.max(universe, 1);

  if (!stages.length) return null;

  return (
    <ol
      className="space-y-1 list-none m-0 p-0"
      aria-label="Embudo secuencial de filtrado de técnicos"
    >
      {stages.map((stage, index) => {
        const isEligible = stage.id === 'eligible';
        const isUniverse = stage.id === 'universe';
        const widthPct = Math.max(4, (stage.countAfter / base) * 100);
        const showDrop = !isUniverse && !isEligible && stage.dropped > 0 && !stage.skipped;
        const isErrorEnd = poolEmpty && isEligible && stage.countAfter === 0;
        const isSuccessEnd = isEligible && stage.countAfter > 0;
        const highlight = stage.isBottleneck || isErrorEnd;

        const barColor = stage.skipped
          ? 'bg-faint/30'
          : isEligible
            ? isSuccessEnd
              ? 'bg-success'
              : 'bg-error'
            : highlight
              ? 'bg-error/80'
              : 'bg-primary/70';

        const showFixHint = highlight && stage.fixHint && !stage.skipped;
        const hintOpen = expandedHint === stage.id || (!compact && showFixHint);

        return (
          <li key={stage.id} className="list-none">
            {showDrop && (
              <div
                className="flex items-center gap-2 pl-2 py-0.5 text-[10px] font-semibold text-warning"
                aria-hidden
              >
                <span className="text-faint">↓</span>
                <span>−{stage.dropped}</span>
              </div>
            )}

            <div
              className={`flex items-center gap-3 py-1.5 ${highlight ? 'rounded-xl px-2 -mx-2 bg-error-hl/50' : ''}`}
              aria-label={`${stage.label}: ${stage.countAfter} técnicos${showDrop ? `, menos ${stage.dropped}` : ''}`}
            >
              <div className="flex-1 min-w-0 h-7 rounded-lg bg-surface/60 border border-divider overflow-hidden">
                <div
                  className={`h-full rounded-lg transition-all ${barColor}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <div className="shrink-0 text-right min-w-[7rem]">
                <span
                  className={`text-sm font-black tabular-nums ${
                    isEligible ? (isSuccessEnd ? 'text-success' : 'text-error') : 'text-foreground'
                  }`}
                >
                  {stage.countAfter}
                </span>
                <p
                  className={`text-[10px] leading-tight ${
                    highlight ? 'text-error font-semibold' : stage.skipped ? 'text-faint' : 'text-muted'
                  }`}
                >
                  {stage.label}
                </p>
              </div>
            </div>

            {showFixHint && compact && (
              <button
                type="button"
                onClick={() => setExpandedHint(hintOpen ? null : stage.id)}
                className="ml-2 text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
              >
                Cómo resolver
                {hintOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}

            {showFixHint && hintOpen && (
              <p className="text-[11px] text-muted leading-snug pl-2 pb-2 border-l-2 border-error/30 ml-1">
                {stage.fixHint}
              </p>
            )}

            {index < stages.length - 1 && !showDrop && !stage.skipped && stage.id !== 'eligible' && (
              <div className="h-0.5" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
