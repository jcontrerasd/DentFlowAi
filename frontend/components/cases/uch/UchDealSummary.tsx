'use client';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText } from 'lucide-react';
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
    /** Flete pactado (v4.4) — sin fee. */
    proposedShippingPrice?: number | null;
    proposedShippingDays?: number | null;
    proposedShippingHours?: number | null;
    /** Desglose diseño/fabricación pactado (v4.5, con fee aplicado). */
    proposedDesignPrice?: number | null;
    proposedDesignDays?: number | null;
    proposedDesignHours?: number | null;
    proposedFabricationPrice?: number | null;
    proposedFabricationDays?: number | null;
    proposedFabricationHours?: number | null;
    serviceType?: string | null;
    workDeadline?: string | Date | null;
    assignedTechnicianId?: string | null;
  } | null;
  invitation?: {
    quotedPrice?: number | null;
    quotedDays?: number | null;
    quotedHours?: number | null;
    quotedDesignPrice?: number | null;
    quotedDesignDays?: number | null;
    quotedDesignHours?: number | null;
    quotedFabricationPrice?: number | null;
    quotedFabricationDays?: number | null;
    quotedFabricationHours?: number | null;
    quotedShippingPrice?: number | null;
    quotedShippingDays?: number | null;
    quotedShippingHours?: number | null;
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
        className="mt-2 rounded-lg border border-divider bg-surface/40 px-3 py-2"
        data-testid="uch-deal-summary"
      >
        <p className="text-[10px] text-faint leading-snug">
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
      className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr] rounded-lg border border-divider bg-surface px-3 py-2.5"
      data-testid="uch-deal-summary"
    >
      <div className="min-w-0 flex items-start gap-2 sm:col-span-1">
        <FileText className="w-3.5 h-3.5 text-primary/90 flex-shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-faint">La oferta</p>

          {showPactada && clinicalCase.proposedPrice != null && (() => {
            const shipping = clinicalCase.proposedShippingPrice ?? 0;
            const shippingDays = clinicalCase.proposedShippingDays ?? null;
            const shippingHours = clinicalCase.proposedShippingHours ?? null;
            const hasShipping = shipping > 0;
            const designPrice = clinicalCase.proposedDesignPrice ?? null;
            const designDays = clinicalCase.proposedDesignDays ?? null;
            const designHours = clinicalCase.proposedDesignHours ?? null;
            const fabPrice = clinicalCase.proposedFabricationPrice ?? null;
            const fabDays = clinicalCase.proposedFabricationDays ?? null;
            const fabHours = clinicalCase.proposedFabricationHours ?? null;
            const hasSplit = designPrice != null || fabPrice != null;

            // Card config según serviceType + split disponible. Fallback a "Trabajo" si no hay split.
            type Card = { label: string; price: number; days: number | null; hours: number | null };
            const cards: Card[] = [];
            if (hasSplit) {
              if (designPrice != null) cards.push({ label: 'Diseño', price: designPrice, days: designDays, hours: designHours });
              if (fabPrice != null) cards.push({ label: 'Fabricación', price: fabPrice, days: fabDays, hours: fabHours });
            } else {
              const workPrice = hasShipping ? clinicalCase.proposedPrice - shipping : clinicalCase.proposedPrice;
              cards.push({ label: 'Trabajo', price: workPrice, days: clinicalCase.proposedDeliveryDays ?? null, hours: clinicalCase.proposedDeliveryHours ?? null });
            }
            if (hasShipping) cards.push({ label: 'Flete', price: shipping, days: shippingDays, hours: shippingHours });

            const gridCols = cards.length >= 3 ? 'grid-cols-3' : cards.length === 2 ? 'grid-cols-2' : 'grid-cols-1';

            return (
              <div className="mt-1 space-y-1.5">
                <div className={`grid ${gridCols} gap-2 text-[10px]`}>
                  {cards.map((c) => {
                    const turnaround = formatTurnaround({ days: c.days, hours: c.hours });
                    return (
                      <div key={c.label} className="rounded-lg bg-surface-2/40 px-2 py-1.5 border border-divider">
                        <p className="text-[8px] uppercase font-bold tracking-widest text-muted">{c.label}</p>
                        <p className="font-bold tabular-nums text-foreground">{formatUchQuoteClp(c.price)}</p>
                        {turnaround !== '—' && (
                          <p className="text-[9px] text-muted">{turnaround}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-foreground">
                  <span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-faint">Total</span>
                    <span className="mx-1 text-faint">·</span>
                    <span className="font-bold tabular-nums">{formatUchQuoteClp(clinicalCase.proposedPrice)}</span>
                  </span>
                  {(clinicalCase.proposedDeliveryDays != null || clinicalCase.proposedDeliveryHours != null) && (
                    <span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-faint">Plazo</span>
                      <span className="mx-1 text-faint">·</span>
                      <span className="font-bold">
                        {formatTurnaround({
                          days: clinicalCase.proposedDeliveryDays,
                          hours: clinicalCase.proposedDeliveryHours,
                        })}
                      </span>
                    </span>
                  )}
                </div>
                {hasShipping && (
                  <p className="text-[9px] text-faint">Flete sin comisión de plataforma.</p>
                )}
              </div>
            );
          })()}

          {showTechQuote && !showPactada && invitation && quotedPrice != null && (
            <div className="mt-1 space-y-1.5">
              {sentLabel ? (
                <p className="text-[10px] text-muted tabular-nums">{sentLabel}</p>
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
            <p className="text-[11px] text-muted leading-snug mt-1">Solo lectura — no hay cotización registrada en tu invitación.</p>
          )}

          {!showPactada && !showTechQuote && !showTechQuoteRejectedOnly && !techRejectedSummary && (
            <p className="text-[10px] text-faint mt-1">Se fijará al aceptar la propuesta.</p>
          )}
        </div>
      </div>

      <div className="min-w-0 sm:border-l sm:border-divider sm:pl-3">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-faint">Entrega del trabajo</p>
        {techRejectedSummary ? (
          <p className="text-[10px] text-muted leading-snug">No Aplica</p>
        ) : deadlineFmt ? (
          <p className="text-[11px] text-foreground capitalize leading-snug" title={deadlineFmt.full}>
            <span className="text-muted">{deadlineFmt.day}</span>
            <br />
            <span className="font-medium tabular-nums">{deadlineFmt.date}</span>
            <span className="text-faint"> · {deadlineFmt.time}</span>
          </p>
        ) : (
          <p className="text-[10px] text-faint leading-snug">
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
