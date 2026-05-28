'use client';

import { CheckCircle2, Building2 } from 'lucide-react';
import { formatTurnaround } from '@/lib/uchQuoteDisplay';

interface AcceptedProposalSummaryProps {
  proposedPrice: number;
  proposedDeliveryDays: number | null;
  /** v4.6 — total en horas (alternativa a proposedDeliveryDays). */
  proposedDeliveryHours?: number | null;
  platformFee?: string | null;
  /** Flete pactado (v4.4): se excluye del cálculo base/fee y se muestra aparte. */
  proposedShippingPrice?: number | null;
  proposedShippingDays?: number | null;
  proposedShippingHours?: number | null;
  technicianName?: string;
  technicianOrganization?: string;
  technicianImage?: string | null;
  /** Vista dentista: ocultar identidad del laboratorio en el resumen. */
  forDentist?: boolean;
}

function formatCLP(amount: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AcceptedProposalSummary({
  proposedPrice,
  proposedDeliveryDays,
  proposedDeliveryHours,
  platformFee,
  proposedShippingPrice,
  proposedShippingDays,
  proposedShippingHours,
  technicianName,
  technicianOrganization,
  technicianImage,
  forDentist = false,
}: AcceptedProposalSummaryProps) {
  const fee = parseFloat(platformFee ?? '0.15');
  // v4.4 — Flete NO está sujeto a fee. Lo descontamos antes de calcular base/fee.
  const shipping = proposedShippingPrice ?? 0;
  const priceExcludingShipping = proposedPrice - shipping;
  const basePrice = priceExcludingShipping / (1 + fee);
  const feeAmount = priceExcludingShipping - basePrice;

  return (
    <div className="bg-surface-2/40 border border-primary/20 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-black text-muted uppercase tracking-widest">Propuesta Aceptada</span>
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border text-primary bg-primary-hl border-primary/20">
          Confirmada ✓
        </span>
      </div>

      {!forDentist ? (
        (technicianName || technicianOrganization) && (
          <div className="flex items-center gap-2 bg-surface/40 border border-divider rounded-lg px-2 py-1.5">
            <div className="w-6 h-6 rounded-md bg-primary-hl border border-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {technicianImage ? (
                <img src={technicianImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-3 h-3 text-primary/70" />
              )}
            </div>
            <div className="min-w-0">
              {technicianOrganization && (
                <p className="text-[10px] font-bold text-foreground truncate">{technicianOrganization}</p>
              )}
              {technicianName && (
                <p className="text-[9px] text-faint truncate">{technicianName}</p>
              )}
            </div>
          </div>
        )
      ) : null}

      <div className="space-y-1">
        {forDentist ? (
          <>
            <p className="text-[11px] text-foreground">
              Importe total: <span className="font-bold">{formatCLP(proposedPrice)}</span>
            </p>
            <p className="text-[9px] text-faint leading-snug">
              Incluye remuneración del proveedor técnico (importe no desglosado por confidencialidad) y comisión de plataforma DentFlowAi.
              {shipping > 0 && (
                <> {' '}Incluye además flete por entrega física: <span className="text-foreground font-semibold">{formatCLP(shipping)}</span> (sin comisión).</>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] text-foreground">
              Precio: <span className="font-bold">{formatCLP(proposedPrice)}</span>
              <span className="text-[9px] text-faint">
                {' '}
                (lab {formatCLP(basePrice)} + plataforma {formatCLP(feeAmount)}
                {shipping > 0 && <> + flete {formatCLP(shipping)}</>})
              </span>
            </p>
          </>
        )}
        <p className="text-[11px] text-foreground">
          Plazo: <span className="font-bold">
            {formatTurnaround({ days: proposedDeliveryDays, hours: proposedDeliveryHours })}
          </span>
          {((proposedShippingDays != null && proposedShippingDays > 0) ||
            (proposedShippingHours != null && proposedShippingHours > 0)) && (
            <span className="text-[9px] text-faint"> (incluye {formatTurnaround({ days: proposedShippingDays, hours: proposedShippingHours })} de traslado)</span>
          )}
        </p>
      </div>
    </div>
  );
}
