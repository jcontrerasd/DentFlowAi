'use client';

import { CheckCircle2, Building2 } from 'lucide-react';

interface AcceptedProposalSummaryProps {
  proposedPrice: number;
  proposedDeliveryDays: number;
  platformFee?: string | null;
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
  platformFee,
  technicianName,
  technicianOrganization,
  technicianImage,
  forDentist = false,
}: AcceptedProposalSummaryProps) {
  const fee = parseFloat(platformFee ?? '0.15');
  const basePrice = proposedPrice / (1 + fee);
  const feeAmount = proposedPrice - basePrice;

  return (
    <div className="bg-slate-800/40 border border-teal-500/20 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-400" />
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Propuesta Aceptada</span>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border text-teal-400 bg-teal-500/10 border-teal-500/20">
          Confirmada ✓
        </span>
      </div>

      {!forDentist ? (
        (technicianName || technicianOrganization) && (
          <div className="flex items-center gap-2 bg-slate-900/40 border border-white/5 rounded-lg px-2 py-1.5">
            <div className="w-6 h-6 rounded-md bg-teal-500/10 border border-teal-500/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {technicianImage ? (
                <img src={technicianImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-3 h-3 text-teal-400/70" />
              )}
            </div>
            <div className="min-w-0">
              {technicianOrganization && (
                <p className="text-[10px] font-bold text-white truncate">{technicianOrganization}</p>
              )}
              {technicianName && (
                <p className="text-[9px] text-slate-500 truncate">{technicianName}</p>
              )}
            </div>
          </div>
        )
      ) : null}

      <div className="space-y-1">
        {forDentist ? (
          <>
            <p className="text-[11px] text-white">
              Importe total: <span className="font-bold">{formatCLP(proposedPrice)}</span>
            </p>
            <p className="text-[9px] text-slate-500 leading-snug">
              Incluye remuneración del proveedor técnico (importe no desglosado por confidencialidad) y comisión de plataforma DentFlowAi.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-white">
            Precio: <span className="font-bold">{formatCLP(proposedPrice)}</span>
            <span className="text-[9px] text-slate-500">
              {' '}
              (lab {formatCLP(basePrice)} + plataforma {formatCLP(feeAmount)})
            </span>
          </p>
        )}
        <p className="text-[11px] text-white">
          Plazo: <span className="font-bold">
            {proposedDeliveryDays} {proposedDeliveryDays === 1 ? 'día hábil' : 'días hábiles'}
          </span>
        </p>
      </div>
    </div>
  );
}
