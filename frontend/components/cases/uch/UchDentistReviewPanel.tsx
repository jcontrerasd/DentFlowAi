'use client';

import React, { useEffect, useState } from 'react';
import { Activity, ArrowLeft, CheckCircle2, Download, X, XCircle } from 'lucide-react';

type UchDentistReviewPanelProps = {
  reviewComment: string;
  setReviewComment: (v: string) => void;
  isSubmittingReview: boolean;
  isSubmittingRevision: boolean;
  onRequestRevision: () => Promise<void>;
  onApprove: () => Promise<void>;
  onDownloadAll: (eventId: string, versionLabel: string, files: string[]) => void | Promise<void>;
  downloadingVersionId: string | null;
  pendingDelivery: { id?: string; version?: number; files?: string[] } | undefined;
  expanded: boolean;
  onToggleExpanded: () => void;
};

type ApproveStep = 'choose' | 'confirm';

export default function UchDentistReviewPanel({
  reviewComment,
  setReviewComment,
  isSubmittingReview,
  isSubmittingRevision,
  onRequestRevision,
  onApprove,
  onDownloadAll,
  downloadingVersionId,
  pendingDelivery,
  expanded,
  onToggleExpanded,
}: UchDentistReviewPanelProps) {
  const [approveStep, setApproveStep] = useState<ApproveStep>('choose');
  const pendingDesignFiles = Array.isArray(pendingDelivery?.files) ? pendingDelivery.files.filter(Boolean) : [];
  const pendingZipId = pendingDelivery?.id ? `dent-pending-${pendingDelivery.id}` : 'dent-pending';

  useEffect(() => {
    if (!expanded) setApproveStep('choose');
  }, [expanded]);

  useEffect(() => {
    setApproveStep('choose');
  }, [pendingDelivery?.id, pendingDelivery?.version]);

  const busy = isSubmittingReview || isSubmittingRevision;

  if (!expanded) {
    return (
      <div data-testid="uch-dentist-review-collapsed" className="rounded-xl border border-primary/20 bg-surface px-3 py-2.5 transition-colors duration-150 hover:bg-surface-off/60 focus-within:bg-surface-off">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="w-full text-left text-[11px] font-semibold text-indigo-200 hover:text-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-sm"
        >
          Revisar entrega — tocar para desplegar
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="uch-dentist-review-panel"
      role="region"
      aria-label="Revisar entrega"
      className="rounded-xl border border-primary/20 bg-surface/95 p-4 shadow-xl space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Revisar entrega</h2>
        <button
          type="button"
          onClick={() => {
            if (busy) return;
            setApproveStep('choose');
            onToggleExpanded();
          }}
          disabled={busy}
          className="rounded-full p-2 text-faint hover:bg-surface-off hover:text-foreground disabled:opacity-30"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="rounded-xl border border-divider bg-surface-2/40 px-3 py-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-medium text-foreground">Entrega pendiente de revisión</p>
          {pendingDesignFiles.length > 0 && (
            <button
              type="button"
              onClick={() =>
                void onDownloadAll(pendingZipId, `v${pendingDelivery?.version ?? 1}`, pendingDesignFiles as string[])
              }
              disabled={downloadingVersionId === pendingZipId}
              className="text-[11px] font-medium text-primary/90 hover:text-primary whitespace-nowrap disabled:opacity-40 inline-flex items-center gap-1 shrink-0"
            >
              {downloadingVersionId === pendingZipId ? (
                <Activity className="w-3 h-3 animate-spin" />
              ) : (
                <Download className="w-3 h-3" />
              )}
              v{pendingDelivery?.version ?? '—'} ZIP
            </button>
          )}
        </div>
        <textarea
          value={reviewComment}
          onChange={(e) => setReviewComment(e.target.value)}
          placeholder="Comentario (obligatorio solo si pides ajustes)"
          className="w-full bg-background/50 border border-divider rounded-lg p-2.5 text-xs text-foreground placeholder:text-faint focus:border-primary/30 outline-none min-h-[56px] resize-none"
        />
        {approveStep === 'confirm' && (
          <div className="rounded-lg border border-primary/30/25 bg-surface-2/20 px-3 py-2.5 space-y-2">
            <p className="text-[11px] leading-relaxed text-foreground">
              Al confirmar, aprobarás esta entrega de diseño. El caso dejará la revisión y continuará el flujo (por
              ejemplo, diseño aprobado o paso a fabricación si aplica). Esta acción no se deshace desde aquí.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          {approveStep === 'choose' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setApproveStep('choose');
                  void onRequestRevision();
                }}
                disabled={isSubmittingRevision || isSubmittingReview || !reviewComment.trim()}
                className="flex-1 py-2 text-xs font-medium rounded-lg bg-warning-hl text-warning border border-warning/20 hover:bg-warning-hl transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {isSubmittingRevision ? (
                  <div className="w-3 h-3 border-2 border-warning/30 border-t-amber-400 rounded-full animate-spin" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                Pedir ajustes
              </button>
              <button
                type="button"
                onClick={() => setApproveStep('confirm')}
                disabled={isSubmittingReview || isSubmittingRevision}
                className="flex-1 py-2 text-xs font-medium rounded-lg bg-primary text-inverse hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {isSubmittingReview ? (
                  <div className="w-3 h-3 border-2 border-border border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                Aprobar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setApproveStep('choose')}
                disabled={busy}
                className="flex-1 py-2 text-xs font-medium rounded-lg border border-divider text-foreground hover:bg-surface-2 transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3 h-3" />
                Volver
              </button>
              <button
                type="button"
                onClick={() => void onApprove()}
                disabled={isSubmittingReview || isSubmittingRevision}
                className="flex-1 py-2 text-xs font-medium rounded-lg bg-primary text-inverse hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {isSubmittingReview ? (
                  <div className="w-3 h-3 border-2 border-border border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                Confirmar aprobación
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
