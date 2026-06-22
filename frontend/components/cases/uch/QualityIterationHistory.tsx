'use client';

import React, { useState } from 'react';
import { ChevronDown, CheckCircle2, AlertCircle, Clock, Eye } from 'lucide-react';

type DeliveryRow = {
  id: string;
  version: number;
  status: string;            // 'pending' | 'approved' | 'rejected'
  reviewComment?: string | null;     // rechazo del dentista
  qualityStatus?: string | null;     // 'pending' | 'certified' | 'rejected'
  qualityComment?: string | null;    // rechazo de Calidad
  files?: string[] | unknown;
  createdAt?: string | Date | null;
};

type Props = {
  deliveries: DeliveryRow[];
  onViewDelivery?: (deliveryId: string, version: number, files: string[]) => void;
};

function statusLabel(d: DeliveryRow): { label: string; color: string } {
  if (d.status === 'approved') return { label: 'Aprobado', color: 'text-success' };
  if (d.status === 'pending') {
    if (d.qualityStatus === 'certified') return { label: 'Certificado — pendiente envío', color: 'text-primary' };
    if (d.qualityStatus === 'rejected') return { label: 'Ajuste Calidad', color: 'text-warning' };
    return { label: 'En revisión', color: 'text-muted' };
  }
  if (d.status === 'rejected') {
    if (d.qualityStatus === 'rejected') return { label: 'Ajuste Calidad', color: 'text-warning' };
    if (d.reviewComment) return { label: 'Ajuste dentista', color: 'text-warning' };
    return { label: 'Rechazado', color: 'text-error' };
  }
  return { label: d.status, color: 'text-muted' };
}

function StatusIcon({ status, qualityStatus }: { status: string; qualityStatus?: string | null }) {
  if (status === 'approved') return <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" aria-hidden />;
  if (status === 'rejected') return <AlertCircle className="w-3.5 h-3.5 text-warning flex-shrink-0" aria-hidden />;
  if (qualityStatus === 'certified') return <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" aria-hidden />;
  return <Clock className="w-3.5 h-3.5 text-muted flex-shrink-0" aria-hidden />;
}

export default function QualityIterationHistory({ deliveries, onViewDelivery }: Props) {
  const [expanded, setExpanded] = useState(false);

  const sorted = [...deliveries].sort((a, b) => (a.version ?? 0) - (b.version ?? 0));

  return (
    <div className="rounded-lg border border-divider bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
          Historial de entregas ({sorted.length})
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="border-t border-divider divide-y divide-divider">
          {sorted.map((d) => {
            const { label, color } = statusLabel(d);
            const files = Array.isArray(d.files) ? (d.files as string[]).filter(Boolean) : [];
            const canView = !!onViewDelivery && files.length > 0;

            // Motivos de rechazo ordenados por quién los emitió
            const rejections: { actor: string; text: string }[] = [];
            if (d.qualityStatus === 'rejected' && d.qualityComment) {
              rejections.push({ actor: 'Calidad', text: d.qualityComment });
            }
            if (d.reviewComment) {
              rejections.push({ actor: 'Solicitante', text: d.reviewComment });
            }

            return (
              <div key={d.id} className="px-3 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon status={d.status} qualityStatus={d.qualityStatus} />
                    <span className="text-[11px] font-semibold text-foreground">v{d.version}</span>
                    <span className={`text-[11px] ${color}`}>{label}</span>
                  </div>
                  {canView && (
                    <button
                      type="button"
                      onClick={() => onViewDelivery!(d.id, d.version, files)}
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
                    >
                      <Eye className="w-3 h-3" aria-hidden />
                      Ver
                    </button>
                  )}
                </div>
                {rejections.map((r) => (
                  <p key={r.actor} className="text-[10px] text-faint leading-relaxed pl-5">
                    <span className="font-medium text-muted">{r.actor}:</span> {r.text}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
