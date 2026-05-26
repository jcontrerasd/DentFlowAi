'use client';

import {
  formatUchQuoteClp,
  hasIntegralBreakdown,
  type UchQuoteDisplay,
} from '@/lib/uchQuoteDisplay';

export type UchQuoteBreakdownVariant = 'compact' | 'detail';
export type UchQuoteBreakdownTone = 'neutral' | 'self' | 'thread';

type UchQuoteBreakdownProps = {
  quote: UchQuoteDisplay;
  variant?: UchQuoteBreakdownVariant;
  tone?: UchQuoteBreakdownTone;
  showCostLabels?: boolean;
  className?: string;
};

function toneClasses(tone: UchQuoteBreakdownTone) {
  if (tone === 'self') {
    return {
      label: 'text-cyan-100/75',
      value: 'text-cyan-50/95',
      nums: 'text-cyan-50',
      sep: 'text-cyan-700/60',
      splitLabel: 'text-cyan-200/80',
      border: 'border-cyan-800/40',
    };
  }
  if (tone === 'thread') {
    return {
      label: 'text-slate-500',
      value: 'text-slate-300/95',
      nums: 'text-slate-200',
      sep: 'text-slate-600',
      splitLabel: 'text-slate-400',
      border: 'border-white/[0.06]',
    };
  }
  return {
    label: 'text-slate-500',
    value: 'text-slate-100',
    nums: 'text-white',
    sep: 'text-slate-600',
    splitLabel: 'text-slate-400',
    border: 'border-white/5',
  };
}

function formatDays(days: number | null | undefined): string {
  if (days == null || days <= 0) return '—';
  return `${days} ${days === 1 ? 'día hábil' : 'días hábiles'}`;
}

export default function UchQuoteBreakdown({
  quote,
  variant = 'compact',
  tone = 'neutral',
  showCostLabels = false,
  className = '',
}: UchQuoteBreakdownProps) {
  const tc = toneClasses(tone);
  const split = hasIntegralBreakdown(quote);
  const totalPriceLabel =
    quote.totalPrice != null ? formatUchQuoteClp(quote.totalPrice) : '—';
  const totalDaysLabel = formatDays(quote.totalDays);

  const splitGrid = split ? (
    <div
      className={`grid grid-cols-2 gap-2 text-[10px] ${variant === 'detail' ? `pb-2 border-b ${tc.border}` : ''}`}
    >
      {quote.designPrice != null && (
        <div className={`rounded-lg bg-slate-800/40 px-2 py-1.5 border ${tc.border}`}>
          <p className={`text-[8px] uppercase font-bold tracking-widest ${tc.splitLabel}`}>Diseño</p>
          <p className={`font-bold tabular-nums ${tc.nums}`}>{formatUchQuoteClp(quote.designPrice)}</p>
          {quote.designDays != null && (
            <p className={`text-[9px] ${tc.splitLabel}`}>
              {quote.designDays} {quote.designDays === 1 ? 'día' : 'días'}
            </p>
          )}
        </div>
      )}
      {quote.fabricationPrice != null && (
        <div className={`rounded-lg bg-slate-800/40 px-2 py-1.5 border ${tc.border}`}>
          <p className={`text-[8px] uppercase font-bold tracking-widest ${tc.splitLabel}`}>Fabricación</p>
          <p className={`font-bold tabular-nums ${tc.nums}`}>{formatUchQuoteClp(quote.fabricationPrice)}</p>
          {quote.fabricationDays != null && (
            <p className={`text-[9px] ${tc.splitLabel}`}>
              {quote.fabricationDays} {quote.fabricationDays === 1 ? 'día' : 'días'}
            </p>
          )}
        </div>
      )}
    </div>
  ) : null;

  if (variant === 'compact') {
    return (
      <div className={`space-y-1.5 ${className}`} data-testid="uch-quote-breakdown">
        {splitGrid}
        <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] ${tc.value}`}>
          <span>
            <span className={`text-[10px] font-medium uppercase tracking-wide ${tc.label}`}>Total</span>
            <span className={`mx-1 ${tc.sep}`}>·</span>
            <span className={`font-bold tabular-nums ${tc.nums}`}>{totalPriceLabel}</span>
          </span>
          <span>
            <span className={`text-[10px] font-medium uppercase tracking-wide ${tc.label}`}>Plazo</span>
            <span className={`mx-1 ${tc.sep}`}>·</span>
            <span className="font-bold">{totalDaysLabel}</span>
          </span>
        </div>
      </div>
    );
  }

  const costLabel = showCostLabels ? 'Costo' : 'Precio';

  return (
    <div className={`space-y-2 ${className}`} data-testid="uch-quote-breakdown">
      {splitGrid}
      <div className={`space-y-1 text-[11px] leading-snug ${tc.value}`}>
        <p>
          <span className={`text-[10px] font-medium uppercase tracking-wide ${tc.label}`}>{costLabel}</span>
          <span className={`mx-1.5 ${tc.sep}`}>·</span>
          <span className={`tabular-nums ${tc.nums}`}>{totalPriceLabel}</span>
        </p>
        <p>
          <span className={`text-[10px] font-medium uppercase tracking-wide ${tc.label}`}>Plazo</span>
          <span className={`mx-1.5 ${tc.sep}`}>·</span>
          <span>{totalDaysLabel}</span>
        </p>
      </div>
    </div>
  );
}
