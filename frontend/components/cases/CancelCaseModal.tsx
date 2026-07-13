'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Ban, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { listActiveCatalogOptionsAction, type CatalogOption } from '@/lib/db/actions/catalogs';
import { cancelCaseAction } from '@/lib/db/actions/cancellation';

/**
 * Cancelación unilateral del dentista (v5.31). Gratis si ningún técnico aceptó
 * aún; cobro del 100% del valor comprometido si ya hay técnico trabajando.
 * `hasAcceptedTechnician` lo decide el llamador según el status del caso; el
 * servidor vuelve a decidirlo de forma autoritativa en `cancelCaseAction`.
 */
export default function CancelCaseModal({
  isOpen,
  onClose,
  caseId,
  hasAcceptedTechnician,
  committedValue,
  onCancelled,
}: {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  hasAcceptedTechnician: boolean;
  committedValue?: number | null;
  onCancelled: () => void;
}) {
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReasonId('');
    setComment('');
    setError(null);
    setSubmitting(false);
    listActiveCatalogOptionsAction('cancellation_reason').then(setOptions);
  }, [isOpen]);

  const selectedLabel = options.find((o) => o.id === reasonId)?.label;
  const needsComment = selectedLabel?.trim().toLowerCase() === 'otro';
  const canConfirm = !submitting && Boolean(reasonId) && (!needsComment || comment.trim().length >= 3);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cancelCaseAction(caseId, { reasonId, comment: comment.trim() || undefined });
      if (!res.success) {
        setError(res.error || 'No se pudo cancelar el caso');
        setSubmitting(false);
        return;
      }
      onCancelled();
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  const formattedValue = typeof committedValue === 'number'
    ? committedValue.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
    : null;

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
            aria-labelledby="cancel-case-title"
          >
            <FocusTrap onEscape={() => { if (!submitting) onClose(); }}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-error-hl border border-error/20 flex items-center justify-center text-error">
                    <Ban className="w-6 h-6" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!submitting) onClose(); }}
                    className="p-2 text-faint hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h3 id="cancel-case-title" className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">
                  Cancelar caso
                </h3>

                {hasAcceptedTechnician ? (
                  <div className="mb-6 p-3 rounded-2xl bg-warning-hl border border-warning/30 text-sm text-foreground flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-warning" />
                    <span>
                      Un técnico ya aceptó este trabajo. Si cancelas ahora, se te cobrará el 100% del valor comprometido{formattedValue ? ` (${formattedValue})` : ''}.
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted font-medium mb-6">
                    Ningún técnico ha aceptado este caso todavía, así que puedes cancelarlo sin costo.
                  </p>
                )}

                <div className="space-y-3 mb-6">
                  <select
                    value={reasonId}
                    onChange={(e) => setReasonId(e.target.value)}
                    data-testid="cancel-case-reason-select"
                    className="w-full rounded-2xl bg-surface-2 border border-divider px-4 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <option value="">Selecciona un motivo…</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  {needsComment && (
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      maxLength={200}
                      placeholder="Comentario (obligatorio para 'Otro')"
                      data-testid="cancel-case-comment"
                      className="w-full rounded-2xl bg-surface-2 border border-divider p-3 text-sm text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
                    />
                  )}
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-2xl bg-error-hl border border-error/30 text-error text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <Button
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                    loading={submitting}
                    variant="destructive"
                    className="w-full"
                    data-testid="cancel-case-confirm"
                  >
                    {hasAcceptedTechnician ? 'Cancelar y cobrar el 100%' : 'Cancelar caso'}
                  </Button>
                  <Button onClick={onClose} disabled={submitting} variant="secondary" className="w-full">
                    Volver
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
