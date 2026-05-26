'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText } from 'lucide-react';
import type { InvitationStatus } from '@/lib/db/actions/invitations';
import UchQuoteBreakdown from '@/components/cases/uch/UchQuoteBreakdown';
import { formatUchQuoteClp, quoteDisplayFromInvitation } from '@/lib/uchQuoteDisplay';

export interface UchDealSummaryProps {
  caseStatus: string;
  actingAsDentista: boolean;
  actingAsTecnico: boolean;
  viewingAsAdmin?: boolean;
  currentUserId?: string;
  clinicalCase: {
    proposedPrice?: number | null;
    proposedDeliveryDays?: number | null;
    workDeadline?: string | Date | null;
    assignedTechnicianId?: string | null;
  } | null;
  invitation?: {
    quotedPrice?: number | null;
    quotedDays?: number | null;
    quotedDesignPrice?: number | null;
    quotedDesignDays?: number | null;
    quotedFabricationPrice?: number | null;
    quotedFabricationDays?: number | null;
    respondedAt?: string | Date | null;
    techNotes?: string | null;
    status?: InvitationStatus | null;
  } | null;
  techOfferRejectedView?: boolean;
}

function formatDeliveryDate(workDeadline: string | Date) {
  const d = new Date(workDeadline);
  const day = d.toLocaleDateString('es-CL', { weekday: 'long' });
  const date = d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
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

  const quotedPrice = invitation?.quotedPrice ?? null;
  const techQuoteStatusExcluded = caseStatus === 'borrador' || caseStatus === 'publicado';
  const showTechQuote =
    actingAsTecnico &&
    quotedPrice != null &&
    !showPactada &&
    !techQuoteStatusExcluded &&
    (assigned || (!assigned && (caseStatus === 'enEvaluacion' || caseStatus === 'propuestaLista')));

  const sentLabel =
    invitation?.respondedAt != null
      ? format(new Date(invitation.respondedAt), "d 'de' MMMM yyyy · HH:mm", { locale: es })
      : null;

  const showTechQuoteRejectedOnly = techRejectedSummary && quotedPrice != null;

  const showWorkDeadline =
    !techRejectedSummary &&
    clinicalCase.workDeadline != null &&
    ['enEjecucion', 'enRevision', 'cambiosEnProceso', 'disenoAprobado', 'enFabricacion', 'enviado', 'completado'].includes(caseStatus) &&
    (actingAsDentista || viewingAsAdmin || (actingAsTecnico && assigned));

  if (!showPactada && !showTechQuote && !showWorkDeadline && !techRejectedSummary) {
    return (
      <div
        className="mt-2 rounded-lg border border-white/[0.06] bg-slate-900/40 px-3 py-2"
        data-testid="uch-deal-summary"
      >
        <p className="text-[10px] text-slate-500 leading-snug">
          {(actingAsDentista || viewingAsAdmin) && caseStatus === 'propuestaLista'
            ? 'El comparativo de ofertas está en el hilo. Al elegir una, el total pactado se mostrará aquí.'
            : 'La oferta y la fecha de entrega se mostrarán aquí cuando el caso avance en el flujo.'}
        </p>
      </div>
    );
  }

  const deadlineFmt = showWorkDeadline && clinicalCase.workDeadline
    ? formatDeliveryDate(clinicalCase.workDeadline)
    : null;

  return (
    <div
      className="mt-2 grid gap-2 sm:grid-cols-2 rounded-lg border border-white/[0.08] bg-slate-900/50 px-3 py-2.5"
      data-testid="uch-deal-summary"
    >
      <div className="min-w-0 flex items-start gap-2 sm:col-span-1">
        <FileText className="w-3.5 h-3.5 text-teal-400/90 flex-shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">La oferta</p>

          {showPactada && clinicalCase.proposedPrice != null && (
            <p className="text-[11px] text-slate-100 leading-snug mt-1">
              {actingAsDentista ? (
                <>
                  Total pactado{' '}
                  <span className="font-semibold tabular-nums">{formatUchQuoteClp(clinicalCase.proposedPrice)}</span>
                  {clinicalCase.proposedDeliveryDays != null && (
                    <span className="text-slate-400"> · {clinicalCase.proposedDeliveryDays} días hábiles pactados</span>
                  )}
                </>
              ) : (
                <>
                  <span className="font-semibold tabular-nums">{formatUchQuoteClp(clinicalCase.proposedPrice)}</span>
                  {clinicalCase.proposedDeliveryDays != null && (
                    <span className="text-slate-400"> · plazo {clinicalCase.proposedDeliveryDays} días hábiles</span>
                  )}
                </>
              )}
            </p>
          )}

          {showTechQuote && !showPactada && invitation && quotedPrice != null && (
            <div className="mt-1 space-y-1.5">
              {sentLabel ? (
                <p className="text-[10px] text-slate-400 tabular-nums">{sentLabel}</p>
              ) : null}
              <UchQuoteBreakdown
                quote={quoteDisplayFromInvitation(invitation)}
                variant="compact"
                tone="neutral"
              />
            </div>
          )}

          {showTechQuoteRejectedOnly && invitation && (
            <div className="mt-1">
              <UchQuoteBreakdown quote={quoteDisplayFromInvitation(invitation)} variant="compact" tone="neutral" />
            </div>
          )}

          {techRejectedSummary && !showTechQuoteRejectedOnly && (
            <p className="text-[11px] text-slate-400 leading-snug mt-1">Solo lectura — no hay cotización registrada en tu invitación.</p>
          )}

          {!showPactada && !showTechQuote && !showTechQuoteRejectedOnly && !techRejectedSummary && (
            <p className="text-[10px] text-slate-500 mt-1">Se fijará al aceptar la propuesta.</p>
          )}
        </div>
      </div>

      <div className="min-w-0 sm:border-l sm:border-white/[0.06] sm:pl-3">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Entrega del trabajo</p>
        {techRejectedSummary ? (
          <p className="text-[10px] text-slate-400 leading-snug">No Aplica</p>
        ) : deadlineFmt ? (
          <p className="text-[11px] text-slate-100 capitalize leading-snug" title={deadlineFmt.full}>
            <span className="text-slate-400">{deadlineFmt.day}</span>
            <br />
            <span className="font-medium tabular-nums">{deadlineFmt.date}</span>
            <span className="text-slate-500"> · {deadlineFmt.time}</span>
          </p>
        ) : (
          <p className="text-[10px] text-slate-500 leading-snug">
            {showPactada && ['aceptadaPendienteInicio'].includes(caseStatus)
              ? 'Se definirá al iniciar el trabajo en laboratorio.'
              : actingAsDentista && caseStatus === 'propuestaLista'
                ? 'Se definirá al aceptar una oferta del comparativo en el hilo.'
                : 'Aún sin fecha de entrega operativa.'}
          </p>
        )}
      </div>
    </div>
  );
}
