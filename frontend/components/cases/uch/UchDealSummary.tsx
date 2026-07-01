'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { InvitationStatus } from '@/lib/db/actions/invitations';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';
import { formatTurnaround, formatUchQuoteClp, quoteDisplayFromInvitation } from '@/lib/uchQuoteDisplay';

export interface UchDealSummaryProps {
  caseStatus: string;
  actingAsDentista: boolean;
  actingAsTecnico: boolean;
  viewingAsAdmin?: boolean;
  currentUserId?: string;
  clinicalCase: {
    proposedPrice?: number | null;
    proposedDeliveryDays?: number | null;
    proposedDeliveryHours?: number | null;
    serviceType?: string | null;
    workDeadline?: string | Date | null;
    assignedTechnicianId?: string | null;
  } | null;
  invitation?: {
    compensation?: number | null;
    quotedPrice?: number | null;
    deadlineDays?: number | null;
    deadlineHours?: number | null;
    respondedAt?: string | Date | null;
    status?: InvitationStatus | null;
  } | null;
  techOfferRejectedView?: boolean;
}

function formatDeliveryDate(workDeadline: string | Date) {
  const d = new Date(workDeadline);
  const day = d.toLocaleDateString('es-CL', { weekday: 'long' });
  const date = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return { day, date, time, full: `${day} · ${date} · ${time}` };
}

export default function UchDealSummary({
  caseStatus,
  actingAsDentista,
  actingAsTecnico,
  viewingAsAdmin = false,
  currentUserId,
  clinicalCase,
  invitation,
  techOfferRejectedView = false,
}: UchDealSummaryProps) {
  if (!clinicalCase) return null;

  const assigned = clinicalCase.assignedTechnicianId === currentUserId;
  const techRejectedSummary = !!(techOfferRejectedView && actingAsTecnico && !assigned);

  const showPactada =
    clinicalCase.proposedPrice != null &&
    !['propuestaLista', 'enEvaluacion', 'publicado', 'borrador'].includes(caseStatus) &&
    (actingAsDentista || viewingAsAdmin || (actingAsTecnico && assigned)) &&
    !techRejectedSummary;

  const quotedPrice = invitation?.compensation ?? invitation?.quotedPrice ?? null;
  const techQuoteStatusExcluded = caseStatus === 'borrador' || caseStatus === 'publicado';
  const showTechQuote =
    actingAsTecnico &&
    quotedPrice != null &&
    !showPactada &&
    !techQuoteStatusExcluded &&
    !techRejectedSummary &&
    (assigned || (!assigned && (caseStatus === 'enEvaluacion' || caseStatus === 'propuestaLista')));

  const sentLabel =
    invitation?.respondedAt != null
      ? format(new Date(invitation.respondedAt), "d 'de' MMMM yyyy · HH:mm", { locale: es })
      : null;

  const showTechQuoteRejectedOnly = techRejectedSummary && quotedPrice != null;

  const showWorkDeadline =
    !techRejectedSummary &&
    clinicalCase.workDeadline != null &&
    ['enEjecucion', 'enRevision', 'cambiosEnProceso', 'completado'].includes(caseStatus) &&
    (actingAsDentista || viewingAsAdmin || (actingAsTecnico && assigned));

  if (!showPactada && !showTechQuote && !showWorkDeadline && !techRejectedSummary) {
    return (
      <div
        className="mt-2 rounded-lg border border-divider bg-surface/40 px-3 py-2"
        data-testid="uch-deal-summary"
      >
        <p className="text-xs text-muted leading-snug">
          {(actingAsDentista || viewingAsAdmin) && caseStatus === 'propuestaLista'
            ? 'El resumen del acuerdo se mostrará aquí cuando el técnico acepte la asignación.'
            : 'La compensación y la fecha de entrega se mostrarán aquí cuando el caso avance en el flujo.'}
        </p>
      </div>
    );
  }

  const deadlineFmt = showWorkDeadline && clinicalCase.workDeadline
    ? formatDeliveryDate(clinicalCase.workDeadline)
    : null;

  const deliveryFallback = showPactada && ['aceptadaPendienteInicio'].includes(caseStatus)
    ? 'Se definirá al iniciar el trabajo.'
    : actingAsDentista && caseStatus === 'propuestaLista'
      ? 'Se definirá al aceptar la asignación.'
      : 'Sin fecha aún.';

  return (
    <div
      className="mt-1 rounded-lg border border-divider bg-surface px-3 pt-1.5 pb-1.5"
      data-testid="uch-deal-summary"
    >
      {showPactada && clinicalCase.proposedPrice != null && (() => {
        const useTechValues = actingAsTecnico && assigned && invitation != null;
        const totalPrice = useTechValues
          ? (invitation?.quotedPrice ?? clinicalCase.proposedPrice)
          : clinicalCase.proposedPrice;
        const totalDays = useTechValues
          ? (invitation?.deadlineDays ?? clinicalCase.proposedDeliveryDays ?? null)
          : (clinicalCase.proposedDeliveryDays ?? null);
        const totalHours = useTechValues
          ? (invitation?.deadlineHours ?? clinicalCase.proposedDeliveryHours ?? null)
          : (clinicalCase.proposedDeliveryHours ?? null);

        const totalTurnaround = formatTurnaround({ days: totalDays, hours: totalHours });

        return (
          <div className="space-y-1.5">
            {/* Fila 1 — trabajo */}
            <div className="flex items-stretch">
              <div className="flex-1 min-w-0 px-2">
                <p className="text-[11px] uppercase font-bold tracking-normal text-muted truncate">Trabajo</p>
                <p className="text-xs font-bold tabular-nums text-foreground truncate">{formatUchQuoteClp(totalPrice)}</p>
                {totalTurnaround !== '—' && (
                  <p className="text-[11px] text-muted truncate">{totalTurnaround}</p>
                )}
              </div>
            </div>

            {/* Fila 2 — total + entrega */}
            <div className="flex items-stretch border-t border-divider pt-1.5">
              <div className="flex-1 min-w-0 px-2">
                <p className="text-[11px] uppercase font-bold tracking-normal text-muted truncate">Total</p>
                <p className="text-sm font-bold tabular-nums text-primary truncate">{formatUchQuoteClp(totalPrice)}</p>
                {totalTurnaround !== '—' && (
                  <p className="text-[11px] text-muted truncate">Plazo · {totalTurnaround}</p>
                )}
              </div>

              <div className="flex-1 min-w-0 px-2 border-l border-divider">
                <p className="text-[11px] uppercase font-bold tracking-normal text-muted truncate">Entrega</p>
                {deadlineFmt ? (
                  <div title={deadlineFmt.full}>
                    <p className="text-[11px] font-medium text-foreground capitalize truncate">
                      <span className="text-muted">{deadlineFmt.day}</span>
                      <span className="mx-1 text-muted">·</span>
                      <span className="tabular-nums">{deadlineFmt.date}</span>
                    </p>
                    <p className="text-[11px] text-muted tabular-nums truncate">{deadlineFmt.time}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted leading-snug">{deliveryFallback}</p>
                )}
              </div>
            </div>

          </div>
        );
      })()}

      {showTechQuote && !showPactada && invitation && quotedPrice != null && (
        <div className="space-y-1.5">
          {sentLabel ? (
            <p className="text-xs text-muted tabular-nums">{sentLabel}</p>
          ) : null}
          <UchQuoteBreakdown
            quote={quoteDisplayFromInvitation(invitation)}
            variant="compact"
            tone="neutral"
          />
        </div>
      )}

      {showTechQuoteRejectedOnly && invitation && (
        <UchQuoteBreakdown quote={quoteDisplayFromInvitation(invitation)} variant="compact" tone="neutral" />
      )}

      {techRejectedSummary && !showTechQuoteRejectedOnly && (
        <p className="text-[11px] text-muted leading-snug">Solo lectura — no hay cotización registrada en tu invitación.</p>
      )}

      {!showPactada && !showTechQuote && !showTechQuoteRejectedOnly && !techRejectedSummary && (
        <p className="text-xs text-muted">Se fijará al aceptar la propuesta.</p>
      )}
    </div>
  );
}
