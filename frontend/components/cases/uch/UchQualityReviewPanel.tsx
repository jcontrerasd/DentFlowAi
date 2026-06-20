'use client';

import { useState } from 'react';
import { ShieldCheck, MessageSquareWarning, GitBranch, Download, FileCheck2 } from 'lucide-react';
import UchDeriveQualityDialog from './UchDeriveQualityDialog';

/**
 * Panel de revisión de Calidad (v5.19) — solo para el revisor de Calidad asignado
 * cuando el caso está en `enRevisionCalidad`. Espeja la revisión del dentista:
 * certificar (deja la entrega lista para que el técnico la envíe) o pedir ajustes.
 * Además permite derivar el caso a otro revisor de Calidad.
 */
export default function UchQualityReviewPanel({
  caseId,
  delivery,
  onCertify,
  onRequestChanges,
  onDownload,
  onDerived,
}: {
  caseId: string;
  delivery: { id?: string; version?: number; files?: string[] } | undefined;
  onCertify: (comment: string) => Promise<boolean | void>;
  onRequestChanges: (reason: string) => Promise<boolean | void>;
  onDownload: () => Promise<void> | void;
  onDerived: () => void;
}) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<null | 'certify' | 'changes'>(null);
  const [deriveOpen, setDeriveOpen] = useState(false);

  const fileCount = delivery?.files?.length ?? 0;

  return (
    <div
      data-testid="uch-quality-review-panel"
      role="region"
      aria-label="Revisión de Calidad"
      className="rounded-xl border border-primary/30 bg-surface/95 p-4 shadow-xl space-y-3"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
        <h2 className="text-sm font-semibold text-foreground">Revisión de Calidad</h2>
        {delivery?.version != null && (
          <span className="text-[10px] text-muted ml-auto">Entrega v{delivery.version}</span>
        )}
      </div>

      <p className="text-xs text-muted leading-relaxed">
        Revisa la entrega del técnico. Si está conforme, <span className="font-semibold text-foreground">certifícala</span> para
        que pueda enviarse al solicitante; si no, solicita ajustes y el técnico iterará contigo.
      </p>

      {fileCount > 0 && (
        <button
          type="button"
          onClick={() => onDownload()}
          className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Download className="w-4 h-4" /> Descargar archivos ({fileCount})
        </button>
      )}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="Comentario para el técnico (obligatorio para solicitar ajustes)"
        data-testid="uch-quality-comment"
        className="w-full rounded-xl bg-surface-2 border border-divider p-3 text-sm text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
        disabled={busy !== null}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="uch-quality-certify"
          onClick={async () => {
            setBusy('certify');
            try {
              const ok = await onCertify(comment.trim());
              if (ok) setComment('');
            } finally {
              setBusy(null);
            }
          }}
          disabled={busy !== null}
          className="flex-1 min-w-[140px] py-2.5 bg-primary text-inverse text-xs font-semibold rounded-xl shadow-sm disabled:opacity-40 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <FileCheck2 className="w-4 h-4" /> {busy === 'certify' ? 'Certificando…' : 'Certificar entrega'}
        </button>
        <button
          type="button"
          data-testid="uch-quality-request-changes"
          onClick={async () => {
            if (!comment.trim()) return;
            setBusy('changes');
            try {
              const ok = await onRequestChanges(comment.trim());
              if (ok) setComment('');
            } finally {
              setBusy(null);
            }
          }}
          disabled={busy !== null || !comment.trim()}
          className="flex-1 min-w-[140px] py-2.5 bg-surface-2 text-foreground text-xs font-semibold rounded-xl border border-divider disabled:opacity-40 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <MessageSquareWarning className="w-4 h-4" /> Solicitar ajustes
        </button>
      </div>

      <button
        type="button"
        data-testid="uch-quality-derive"
        onClick={() => setDeriveOpen(true)}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-foreground transition-colors disabled:opacity-40"
      >
        <GitBranch className="w-4 h-4" /> Derivar a otro revisor
      </button>

      <UchDeriveQualityDialog
        isOpen={deriveOpen}
        onClose={() => setDeriveOpen(false)}
        caseId={caseId}
        onDerived={onDerived}
      />
    </div>
  );
}
