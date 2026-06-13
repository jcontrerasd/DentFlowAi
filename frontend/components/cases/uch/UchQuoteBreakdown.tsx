'use client';

import {
  formatTurnaround,
  formatUchQuoteClp,
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
      label: 'text-foreground',
      value: 'text-foreground',
      nums: 'text-foreground',
      sep: 'text-primary',
    };
  }
  if (tone === 'thread') {
    return {
      label: 'text-faint',
      value: 'text-muted/95',
      nums: 'text-foreground',
      sep: 'text-faint',
    };
  }
  return {
    label: 'text-faint',
    value: 'text-foreground',
    nums: 'text-foreground',
    sep: 'text-faint',
  };
}

export default function UchQuoteBreakdown({
  quote,
  variant = 'compact',
  tone = 'neutral',
  showCostLabels = false,
  className = '',
}: UchQuoteBreakdownProps) {
  const tc = toneClasses(tone);
  const totalPriceLabel =
    quote.totalPrice != null ? formatUchQuoteClp(quote.totalPrice) : '—';
  const totalDaysLabel = formatTurnaround({ days: quote.totalDays, hours: quote.totalHours });

  const costLabel = showCostLabels ? 'Costo' : 'Precio';

  if (variant === 'compact') {
    return (
      <div className={`space-y-1.5 ${className}`} data-testid="uch-quote-breakdown">
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

  return (
    <div className={`space-y-2 ${className}`} data-testid="uch-quote-breakdown">
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
