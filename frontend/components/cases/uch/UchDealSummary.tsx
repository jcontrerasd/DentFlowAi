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

  const deliveryFallback = showPactada && ['aceptadaPendienteInicio'].includes(caseStatus)
    ? 'Se definirá al iniciar el trabajo.'
    : actingAsDentista && caseStatus === 'propuestaLista'
      ? 'Se definirá al aceptar una oferta.'
      : 'Sin fecha aún.';

  return (
    <div
      className="mt-1 rounded-lg border border-divider bg-surface px-3 pt-1.5 pb-1.5"
      data-testid="uch-deal-summary"
    >
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

        type Cell = { label: string; price: number; days: number | null; hours: number | null };
        const cells: Cell[] = [];
        if (hasSplit) {
          if (designPrice != null) cells.push({ label: 'Diseño', price: designPrice, days: designDays, hours: designHours });
          if (fabPrice != null) cells.push({ label: 'Fabricación', price: fabPrice, days: fabDays, hours: fabHours });
        } else {
          const workPrice = hasShipping ? clinicalCase.proposedPrice - shipping : clinicalCase.proposedPrice;
          cells.push({ label: 'Trabajo', price: workPrice, days: clinicalCase.proposedDeliveryDays ?? null, hours: clinicalCase.proposedDeliveryHours ?? null });
        }
        if (hasShipping) cells.push({ label: 'Flete', price: shipping, days: shippingDays, hours: shippingHours });

        const totalTurnaround = formatTurnaround({
          days: clinicalCase.proposedDeliveryDays,
          hours: clinicalCase.proposedDeliveryHours,
        });

        return (
          <div className="space-y-1.5">
            {/* Fila 1 — desglose */}
            <div className="flex items-stretch">
              {cells.map((c, idx) => {
                const turnaround = formatTurnaround({ days: c.days, hours: c.hours });
                return (
                  <div
                    key={c.label}
                    className={`flex-1 min-w-0 px-2 ${idx > 0 ? 'border-l border-divider' : ''}`}
                  >
                    <p className="text-[8px] uppercase font-bold tracking-normal text-muted truncate">{c.label}</p>
                    <p className="text-[12px] font-bold tabular-nums text-foreground truncate">{formatUchQuoteClp(c.price)}</p>
                    {turnaround !== '—' && (
                      <p className="text-[9px] text-muted truncate">{turnaround}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Fila 2 — total + entrega, agrupados visualmente */}
            <div className="flex items-stretch border-t border-divider pt-1.5">
              <div className="flex-1 min-w-0 px-2">
                <p className="text-[8px] uppercase font-bold tracking-normal text-muted truncate">Total</p>
                <p className="text-[13px] font-bold tabular-nums text-primary truncate">{formatUchQuoteClp(clinicalCase.proposedPrice)}</p>
                {totalTurnaround !== '—' && (
                  <p className="text-[9px] text-muted truncate">Plazo · {totalTurnaround}</p>
                )}
              </div>

              <div className="flex-1 min-w-0 px-2 border-l border-divider">
                <p className="text-[8px] uppercase font-bold tracking-normal text-muted truncate">Entrega</p>
                {deadlineFmt ? (
                  <div title={deadlineFmt.full}>
                    <p className="text-[11px] font-medium text-foreground capitalize truncate">
                      <span className="text-muted">{deadlineFmt.day}</span>
                      <span className="mx-1 text-faint">·</span>
                      <span className="tabular-nums">{deadlineFmt.date}</span>
                    </p>
                    <p className="text-[9px] text-faint tabular-nums truncate">{deadlineFmt.time}</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-faint leading-snug">{deliveryFallback}</p>
                )}
              </div>
            </div>

          </div>
        );
      })()}

      {showTechQuote && !showPactada && invitation && quotedPrice != null && (
        <div className="space-y-1.5">
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
        <UchQuoteBreakdown quote={quoteDisplayFromInvitation(invitation)} variant="compact" tone="neutral" />
      )}

      {techRejectedSummary && !showTechQuoteRejectedOnly && (
        <p className="text-[11px] text-muted leading-snug">Solo lectura — no hay cotización registrada en tu invitación.</p>
      )}

      {!showPactada && !showTechQuote && !showTechQuoteRejectedOnly && !techRejectedSummary && (
        <p className="text-[10px] text-faint">Se fijará al aceptar la propuesta.</p>
      )}
    </div>
  );
}
