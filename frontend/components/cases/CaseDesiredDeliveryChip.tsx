'use client';

import { Calendar } from 'lucide-react';
import {
  formatDesiredDeliveryCompact,
  formatDesiredDeliveryForSummary,
} from '@/lib/cases/caseDeliveryPresentation';
import { formatDesiredDeliverySummaryFromDate } from '@/lib/desiredDelivery';

export type CaseDesiredDeliveryChipProps = {
  value: string | Date | null | undefined;
  variant?: 'full' | 'compact';
  className?: string;
  /** Prefijo opcional (ej. en panel de cotización). */
  prefix?: string;
};

export function CaseDesiredDeliveryChip({
  value,
  variant = 'full',
  className = '',
  prefix,
}: CaseDesiredDeliveryChipProps) {
  const text =
    variant === 'compact'
      ? formatDesiredDeliveryCompact(value)
      : formatDesiredDeliverySummaryFromDate(value);

  if (!text) return null;

  const display = prefix ? `${prefix} ${text}` : text;

  return (
    <div
      className={`inline-flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 ${className}`}
    >
      <Calendar className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <p className={`leading-snug text-foreground ${variant === 'compact' ? 'text-[11px] font-medium' : 'text-xs font-semibold'}`}>
        {display}
      </p>
    </div>
  );
}

/** Texto de solo lectura con fallback unificado (ficha / resumen). */
export function CaseDesiredDeliveryReadOnly({
  value,
  className = '',
}: {
  value: string | Date | null | undefined;
  className?: string;
}) {
  const text = formatDesiredDeliveryForSummary(value);
  return (
    <span className={`text-xs text-foreground font-medium leading-snug ${className}`}>
      {text}
    </span>
  );
}
