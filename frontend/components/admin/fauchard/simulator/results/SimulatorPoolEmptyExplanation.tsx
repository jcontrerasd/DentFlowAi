'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, XCircle } from 'lucide-react';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import { WORK_CATEGORY_LABELS, WORK_TYPE_LABELS, type WorkCategory } from '@/lib/constants/dental';
import { buildPoolEmptyExplanation, getBottleneckStage } from '@/lib/fauchard/simulationHelpers';
import SimulatorBadge from '../shared/SimulatorBadge';
import SimulatorFilterFunnel from './SimulatorFilterFunnel';

export default function SimulatorPoolEmptyExplanation({
  result,
  variant = 'panel',
  onViewDetail,
}: {
  result: SimulationResult;
  variant?: 'panel' | 'footer';
  onViewDetail?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const explanation = buildPoolEmptyExplanation(result);
  const bottleneck = getBottleneckStage(result.funnel.stages ?? []);
  const categoryLabel =
    WORK_CATEGORY_LABELS[result.scenario.category as WorkCategory] ?? result.scenario.category;
  const workTypeLabel = WORK_TYPE_LABELS[result.scenario.workType] ?? result.scenario.workType;

  if (variant === 'footer') {
    return (
      <div className="rounded-2xl border border-error/30 bg-error-hl/80 p-3 md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <XCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground">{explanation.headline}</p>
              {bottleneck ? (
                <p className="text-[11px] text-muted leading-snug mt-0.5">
                  Se vació en: <span className="font-semibold text-foreground">{bottleneck.label}</span>
                  {' '}(−{bottleneck.dropped})
                </p>
              ) : (
                <p className="text-[11px] text-muted leading-snug mt-0.5">{explanation.summaryLine}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => (onViewDetail ? onViewDetail() : setExpanded((v) => !v))}
            className="text-[10px] font-bold uppercase text-primary hover:underline shrink-0"
          >
            {onViewDetail ? 'Ver embudo en Filtros' : expanded ? 'Ocultar' : 'Ver detalle'}
          </button>
        </div>
        {expanded && !onViewDetail && result.funnel.stages?.length > 0 && (
          <div className="border-t border-error/20 pt-3 mt-3">
            <SimulatorFilterFunnel
              stages={result.funnel.stages}
              universe={result.funnel.universe}
              poolEmpty
              compact
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 rounded-[2rem] border border-error/30 bg-error-hl space-y-5">
      <div className="text-center space-y-2">
        <XCircle className="w-10 h-10 text-error mx-auto" />
        <h4 className="text-lg font-black text-foreground">Pool vacío</h4>
        <p className="text-xs text-muted leading-relaxed max-w-xl mx-auto">{explanation.caseRequirements}</p>
        <p className="text-sm text-foreground leading-relaxed max-w-xl mx-auto font-medium">
          {explanation.summaryLine}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <SimulatorBadge label="tipo trabajo" value={workTypeLabel} />
        <SimulatorBadge label="liga" value={result.scenario.caseLeague} />
        <SimulatorBadge label="categoría" value={categoryLabel} />
      </div>

      {result.funnel.stages?.length > 0 && (
        <div className="rounded-2xl border border-divider bg-surface/40 p-4">
          <SimulatorFilterFunnel
            stages={result.funnel.stages}
            universe={result.funnel.universe}
            poolEmpty
          />
        </div>
      )}

      <p className="text-[10px] text-faint text-center leading-relaxed">{explanation.productionNote}</p>

      {result.pricePreview && !result.pricePreview.resolved && (
        <div className="flex items-center justify-center gap-2 text-xs text-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Además, no hay regla de precio — el caso no sería publicable.{' '}
            <Link href="/dashboard/admin/prices" className="font-bold underline">
              Admin → Precios
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
