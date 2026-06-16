import Link from 'next/link';
import { DollarSign } from 'lucide-react';
import { formatUchQuoteClp } from '@/lib/uchQuoteDisplay';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import type { SimulatorLivePrice } from '../simulatorTypes';
import SimulatorStatCard from './SimulatorStatCard';

export function SimulatorLivePriceBlock({
  livePrice,
  compact = false,
}: {
  livePrice: SimulatorLivePrice;
  compact?: boolean;
}) {
  const boxClass = `rounded-xl border text-xs ${
    livePrice.salePrice != null ? 'bg-primary/5 border-primary/20' : 'bg-surface border-divider'
  } ${compact ? 'p-2.5' : 'p-4 rounded-2xl text-sm'}`;

  return (
    <div className={boxClass}>
      {livePrice.loading ? (
        <span className="text-faint text-[10px]">Resolviendo precio…</span>
      ) : livePrice.salePrice != null ? (
        compact ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {livePrice.ruleCode && (
              <div className="col-span-2 flex justify-between gap-2">
                <span className="text-[9px] font-bold uppercase text-faint">Regla</span>
                <span className="font-mono text-[10px] text-primary font-bold">{livePrice.ruleCode}</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[9px] font-bold uppercase text-faint">Comp. técnico</span>
              <span className="font-mono font-bold text-foreground text-xs">{formatUchQuoteClp(livePrice.cost!)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold uppercase text-faint">Fee</span>
              <span className="font-mono text-muted text-xs">{((livePrice.feePercent ?? 0) * 100).toFixed(0)}%</span>
            </div>
            <div className="col-span-2 flex justify-between border-t border-divider pt-1.5 mt-0.5">
              <span className="text-[9px] font-bold uppercase text-primary">Precio dentista</span>
              <span className="font-mono font-black text-primary text-xs">{formatUchQuoteClp(livePrice.salePrice)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {livePrice.ruleCode && (
              <div className="flex justify-between">
                <span className="text-[10px] font-bold uppercase text-faint">Regla</span>
                <span className="font-mono text-xs text-primary font-bold">{livePrice.ruleCode}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-faint">Compensación técnico</span>
              <span className="font-mono font-bold text-foreground">{formatUchQuoteClp(livePrice.cost!)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] font-bold uppercase text-faint">Fee plataforma</span>
              <span className="font-mono text-muted">{((livePrice.feePercent ?? 0) * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between border-t border-divider pt-2">
              <span className="text-[10px] font-bold uppercase text-primary">Precio dentista</span>
              <span className="font-mono font-black text-primary">{formatUchQuoteClp(livePrice.salePrice)}</span>
            </div>
          </div>
        )
      ) : livePrice.checked ? (
        <div className="space-y-2">
          <p className="text-xs text-error font-medium">Sin regla de precio para esta combinación.</p>
          <Link href="/dashboard/admin/prices" className="text-[10px] font-bold uppercase text-primary hover:underline">
            Admin → Precios
          </Link>
        </div>
      ) : (
        <span className="text-faint text-xs">Completa las 4 dimensiones para ver el precio.</span>
      )}
    </div>
  );
}

export function SimulatorPriceResultCard({ preview }: { preview: SimulationResult['pricePreview'] }) {
  if (!preview) return null;
  if (!preview.resolved) {
    return (
      <div className="p-4 rounded-2xl border border-warning/30 bg-warning-hl text-sm flex items-center justify-between gap-4 flex-wrap">
        <span className="text-warning text-xs font-medium">
          Sin regla de precio — el caso no sería publicable en producción.
        </span>
        <Link href="/dashboard/admin/prices" className="text-[10px] font-bold uppercase text-primary hover:underline">
          Admin → Precios
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {preview.ruleCode && (
        <span className="inline-flex text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-surface border border-divider text-muted">
          Regla: <span className="text-primary font-mono ml-1">{preview.ruleCode}</span>
        </span>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SimulatorStatCard icon={DollarSign} label="Compensación técnico" value={formatUchQuoteClp(preview.cost!)} />
        <SimulatorStatCard icon={DollarSign} label="Fee plataforma" value={`${((preview.feePercent ?? 0) * 100).toFixed(0)}%`} />
        <SimulatorStatCard icon={DollarSign} label="Precio dentista" value={formatUchQuoteClp(preview.salePrice!)} highlight />
      </div>
    </div>
  );
}
