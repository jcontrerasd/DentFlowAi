'use client';

import type { ReactNode } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  resolveTechnicianViewerStripe,
  type CaseViewerStatusInput,
} from '@/lib/cases/caseViewerStatusPresentation';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useEffect, useState } from 'react';

const PILL_BASE =
  'inline-flex items-center gap-x-1 flex-wrap px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all duration-150 cursor-pointer hover:bg-foreground hover:text-inverse hover:border-foreground';

function SolicitudVigencia({ invitedAt }: { invitedAt: string | Date | null | undefined }) {
  const getLabel = () => {
    if (!invitedAt) return '…';
    const date = new Date(invitedAt);
    if (isNaN(date.getTime())) return '…';
    return formatDistanceToNow(date, { locale: es, addSuffix: true });
  };
  const [elapsed, setElapsed] = useState(getLabel);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(getLabel()), 60_000);
    return () => clearInterval(interval);
  }, [invitedAt]);

  return <span className="opacity-90 normal-case tracking-normal font-semibold">{elapsed}</span>;
}

type CaseViewerStatusStripeProps = {
  input: CaseViewerStatusInput;
  invitedAt?: string | Date | null;
  countdownRight?: ReactNode;
  compact?: boolean;
};

/** Franja de estado alineada a KPI técnico (listado, detalle, Kanban). */
export default function CaseViewerStatusStripe({
  input,
  invitedAt,
  countdownRight,
  compact = false,
}: CaseViewerStatusStripeProps) {
  const model = resolveTechnicianViewerStripe(input);
  const Icon = model.icon;

  const pill = model.useStatusBadgeStyles ? (
    <span className={`${PILL_BASE} ${model.pillClassName}`}>
      <Icon className="w-3 h-3 flex-shrink-0" aria-hidden />
      {model.label}
    </span>
  ) : (
    <span className={`${PILL_BASE} ${model.pillClassName}`}>
      <Icon className="w-3 h-3 flex-shrink-0" aria-hidden />
      {model.showSolicitudVigencia ? (
        <span className="inline-flex flex-wrap items-center gap-x-1 text-center leading-tight normal-case">
          {model.label} — <SolicitudVigencia invitedAt={invitedAt} />
        </span>
      ) : (
        model.label
      )}
    </span>
  );

  if (compact) {
    if (model.useStatusBadgeStyles && model.statusColorKey) {
      return <StatusBadge status={model.statusColorKey} />;
    }
    return pill;
  }

  const outer = `w-full min-h-10 flex items-center justify-between px-3 rounded-xl bg-background border text-[9px] font-bold uppercase tracking-wider text-faint ${
    model.highlightEval
      ? 'border-warning/20 shadow-[0_0_15px_-5px_rgba(245,158,11,0.2)]'
      : 'border-divider'
  }`;

  return (
    <div className={outer}>
      {pill}
      {model.showInviteCountdown && countdownRight ? countdownRight : null}
    </div>
  );
}
