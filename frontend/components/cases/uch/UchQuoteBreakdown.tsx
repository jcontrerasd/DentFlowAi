'use client';

import {
  formatTurnaround,
  formatUchQuoteClp,
  hasIntegralBreakdown,
  hasShippingLine,
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
      splitLabel: 'text-primary',
      border: 'border-primary/30',
    };
  }
  if (tone === 'thread') {
    return {
      label: 'text-faint',
      value: 'text-muted/95',
      nums: 'text-foreground',
      sep: 'text-faint',
      splitLabel: 'text-muted',
      border: 'border-divider',
    };
  }
  return {
    label: 'text-faint',
    value: 'text-foreground',
    nums: 'text-foreground',
    sep: 'text-faint',
    splitLabel: 'text-muted',
    border: 'border-divider',
  };
}

/** v4.6 — Formatea plazo en horas para slots (sin "hábil/es" porque son slots cortos). */
function formatSlot(days: number | null | undefined, hours: number | null | undefined): string | null {
  const d = days != null && days > 0 ? Math.trunc(days) : 0;
  const h = hours != null && hours > 0 ? Math.trunc(hours) : 0;
  if (d === 0 && h === 0) return null;
  if (h > 0 && d === 0) return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  if (d > 0 && h === 0) return `${d} ${d === 1 ? 'día' : 'días'}`;
  return `${d} ${d === 1 ? 'día' : 'días'} · ${h} h`;
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
  const shipping = hasShippingLine(quote);
  const totalPriceLabel =
    quote.totalPrice != null ? formatUchQuoteClp(quote.totalPrice) : '—';
  const totalDaysLabel = formatTurnaround({ days: quote.totalDays, hours: quote.totalHours });

  // Si hay desglose integral Y flete: 3 columnas. Si solo split: 2. Si solo flete (solo_fabricacion): 1 fila aparte.
  const cardCount = (split ? 2 : 0) + (split && shipping ? 1 : 0);
  const gridCols = cardCount === 3 ? 'grid-cols-3' : 'grid-cols-2';

  const splitGrid = split ? (
    <div
      className={`grid ${gridCols} gap-2 text-[10px] ${variant === 'detail' ? `pb-2 border-b ${tc.border}` : ''}`}
    >
      {quote.designPrice != null && (
        <div className={`rounded-lg bg-surface-2/40 px-2 py-1.5 border ${tc.border}`}>
          <p className={`text-[8px] uppercase font-bold tracking-widest ${tc.splitLabel}`}>Diseño</p>
          <p className={`font-bold tabular-nums ${tc.nums}`}>{formatUchQuoteClp(quote.designPrice)}</p>
          {formatSlot(quote.designDays, quote.designHours) && (
            <p className={`text-[9px] ${tc.splitLabel}`}>
              {formatSlot(quote.designDays, quote.designHours)}
            </p>
          )}
        </div>
      )}
      {quote.fabricationPrice != null && (
        <div className={`rounded-lg bg-surface-2/40 px-2 py-1.5 border ${tc.border}`}>
          <p className={`text-[8px] uppercase font-bold tracking-widest ${tc.splitLabel}`}>Fabricación</p>
          <p className={`font-bold tabular-nums ${tc.nums}`}>{formatUchQuoteClp(quote.fabricationPrice)}</p>
          {formatSlot(quote.fabricationDays, quote.fabricationHours) && (
            <p className={`text-[9px] ${tc.splitLabel}`}>
              {formatSlot(quote.fabricationDays, quote.fabricationHours)}
            </p>
          )}
        </div>
      )}
      {shipping && (
        <div className={`rounded-lg bg-surface-2/40 px-2 py-1.5 border ${tc.border}`}>
          <p className={`text-[8px] uppercase font-bold tracking-widest ${tc.splitLabel}`}>Flete</p>
          <p className={`font-bold tabular-nums ${tc.nums}`}>{formatUchQuoteClp(quote.shippingPrice ?? 0)}</p>
          {formatSlot(quote.shippingDays, quote.shippingHours) && (
            <p className={`text-[9px] ${tc.splitLabel}`}>
              {formatSlot(quote.shippingDays, quote.shippingHours)}
            </p>
          )}
        </div>
      )}
    </div>
  ) : null;

  // Caso `solo_fabricacion` (sin split) con flete: fila aparte tipo "Incluye flete".
  const shippingSlotLabel = formatSlot(quote.shippingDays, quote.shippingHours);
  const shippingStandalone = !split && shipping ? (
    <p className={`text-[10px] ${tc.label}`}>
      <span className="font-medium uppercase tracking-wide">Incluye flete</span>
      <span className={`mx-1.5 ${tc.sep}`}>·</span>
      <span className={`tabular-nums ${tc.nums}`}>{formatUchQuoteClp(quote.shippingPrice ?? 0)}</span>
      {shippingSlotLabel && (
        <> <span className={`mx-1 ${tc.sep}`}>·</span><span>{shippingSlotLabel} de traslado</span></>
      )}
    </p>
  ) : null;

  if (variant === 'compact') {
    return (
      <div className={`space-y-1.5 ${className}`} data-testid="uch-quote-breakdown">
        {splitGrid}
        {shippingStandalone}
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
      {shippingStandalone}
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
