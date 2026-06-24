'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, XCircle, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { listActiveCatalogOptionsAction, type CatalogOption } from '@/lib/db/actions/catalogs';
import { rejectDerivedQualityReviewAction } from '@/lib/db/actions/quality';

const OTRO_CODE = 'qdr_005';

export default function UchRejectDerivationDialog({
  isOpen,
  onClose,
  caseId,
  onRejected,
}: {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onRejected: () => void;
}) {
  const [reasons, setReasons] = useState<CatalogOption[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [comment, setComment] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReasonId('');
    setComment('');
    setConfirming(false);
    setError(null);
    setSubmitting(false);
    listActiveCatalogOptionsAction('quality_derivation_reason').then(setReasons);
  }, [isOpen]);

  const selectedCode = reasons.find((o) => o.id === reasonId)?.code;
  const needsComment = selectedCode === OTRO_CODE;
  const canConfirm = !submitting && Boolean(reasonId) && (!needsComment || comment.trim().length > 0);

  const handleFirstClick = () => {
    if (!canConfirm) return;
    setConfirming(true);
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await rejectDerivedQualityReviewAction(caseId, reasonId, comment.trim() || undefined);
      if (!res.success) {
        setError(res.error || 'No se pudo rechazar la derivación');
        setSubmitting(false);
        setConfirming(false);
        return;
      }
      onRejected();
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!submitting) onClose(); }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-surface border border-divider rounded-[2.5rem] shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="uch-reject-derivation-title"
          >
            <FocusTrap onEscape={() => { if (!submitting) onClose(); }}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center text-error">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!submitting) onClose(); }}
                    className="p-2 text-faint hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h3 id="uch-reject-derivation-title" className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">
                  Rechazar derivación
                </h3>
                <p className="text-sm text-muted font-medium mb-6">
                  El caso permanecerá con el revisor actual. Indica el motivo para que tenga contexto.
                </p>

                <div className="space-y-3 mb-6">
                  <select
                    value={reasonId}
                    onChange={(e) => { setReasonId(e.target.value); setConfirming(false); }}
                    data-testid="uch-reject-derivation-reason-select"
                    className="w-full rounded-2xl bg-surface-2 border border-divider px-4 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <option value="">Selecciona un motivo…</option>
                    {reasons.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <textarea
                    value={comment}
                    onChange={(e) => { setComment(e.target.value); setConfirming(false); }}
                    rows={2}
                    maxLength={300}
                    placeholder={needsComment ? "Comentario (obligatorio para 'Otro')" : 'Comentario adicional (opcional)'}
                    data-testid="uch-reject-derivation-comment"
                    className="w-full rounded-2xl bg-surface-2 border border-divider p-3 text-sm text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
                  />
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-2xl bg-error-hl border border-error/30 text-error text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                )}

                {confirming && (
                  <div className="mb-4 p-3 rounded-2xl bg-warning-hl border border-warning/30 text-warning text-sm">
                    ¿Confirmas que rechazas esta derivación? El revisor actual recibirá tu motivo.
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {!confirming ? (
                    <Button
                      onClick={handleFirstClick}
                      disabled={!canConfirm}
                      variant="destructive"
                      className="w-full"
                      data-testid="uch-reject-derivation-first"
                    >
                      Rechazar derivación
                    </Button>
                  ) : (
                    <Button
                      onClick={handleConfirm}
                      disabled={submitting}
                      loading={submitting}
                      variant="destructive"
                      className="w-full"
                      data-testid="uch-reject-derivation-confirm"
                    >
                      Confirmar rechazo
                    </Button>
                  )}
                  <Button onClick={() => { setConfirming(false); if (!submitting) onClose(); }} disabled={submitting} variant="secondary" className="w-full">
                    Cancelar
                  </Button>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-error via-error/70 to-error" />
            </FocusTrap>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
