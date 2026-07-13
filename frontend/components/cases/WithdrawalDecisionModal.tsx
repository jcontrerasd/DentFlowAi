'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { listActiveCatalogOptionsAction, type CatalogOption } from '@/lib/db/actions/catalogs';
import { continueAfterWithdrawalAction, cancelAfterWithdrawalAction } from '@/lib/db/actions/withdrawal';

/**
 * v5.32 — Tras el retiro del técnico, el caso espera la decisión del dentista:
 * continuar buscando reemplazo (nueva fecha estimada) o cancelar sin costo
 * (quien rompió el compromiso fue el técnico). Si el plazo vence sin
 * respuesta, el cron continúa por defecto (`processWithdrawalDecisionTimeoutsAction`).
 */
export default function WithdrawalDecisionModal({
  isOpen,
  onClose,
  caseId,
  estimatedDateLabel,
  onContinued,
  onCancelled,
  onError,
}: {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  estimatedDateLabel?: string;
  onContinued: () => void;
  onCancelled: () => void;
  onError?: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'choose' | 'cancel'>('choose');
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode('choose');
    setReasonId('');
    setComment('');
    setSubmitting(false);
    listActiveCatalogOptionsAction('cancellation_reason').then(setOptions);
  }, [isOpen]);

  const selectedLabel = options.find((o) => o.id === reasonId)?.label;
  const needsComment = selectedLabel?.trim().toLowerCase() === 'otro';
  const canConfirmCancel = !submitting && Boolean(reasonId) && (!needsComment || comment.trim().length >= 3);

  const handleContinue = async () => {
    setSubmitting(true);
    const res = await continueAfterWithdrawalAction(caseId);
    setSubmitting(false);
    if (res.success) { onContinued(); onClose(); }
    else onError?.(res.error || 'No se pudo continuar la búsqueda');
  };

  const handleCancel = async () => {
    if (!canConfirmCancel) return;
    setSubmitting(true);
    const res = await cancelAfterWithdrawalAction(caseId, { reasonId, comment: comment.trim() || undefined });
    setSubmitting(false);
    if (res.success) { onCancelled(); onClose(); }
    else onError?.(res.error || 'No se pudo cancelar el caso');
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
            aria-labelledby="withdrawal-decision-title"
          >
            <FocusTrap onEscape={() => { if (!submitting) onClose(); }}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-warning-hl border border-warning/20 flex items-center justify-center text-warning">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!submitting) onClose(); }}
                    className="p-2 text-faint hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h3 id="withdrawal-decision-title" className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">
                  El caso requiere reasignación
                </h3>
                <p className="text-sm text-muted font-medium mb-6">
                  El caso requiere reasignación producto de una contingencia técnica.
                  {estimatedDateLabel ? <> Nueva fecha estimada: <span className="font-bold text-foreground">{estimatedDateLabel}</span>.</> : null}
                </p>

                {mode === 'choose' ? (
                  <div className="flex flex-col gap-3">
                    <Button
                      onClick={handleContinue}
                      disabled={submitting}
                      loading={submitting}
                      className="w-full"
                      data-testid="withdrawal-decision-continue"
                    >
                      Continuar buscando reemplazo
                    </Button>
                    <Button
                      onClick={() => setMode('cancel')}
                      disabled={submitting}
                      variant="secondary"
                      className="w-full"
                      data-testid="withdrawal-decision-cancel-open"
                    >
                      Cancelar caso (sin costo)
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <select
                        value={reasonId}
                        onChange={(e) => setReasonId(e.target.value)}
                        data-testid="withdrawal-decision-reason-select"
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
                          className="w-full rounded-2xl bg-surface-2 border border-divider p-3 text-sm text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-3">
                      <Button
                        onClick={handleCancel}
                        disabled={!canConfirmCancel}
                        loading={submitting}
                        variant="destructive"
                        className="w-full"
                        data-testid="withdrawal-decision-cancel-confirm"
                      >
                        Confirmar cancelación
                      </Button>
                      <Button onClick={() => setMode('choose')} disabled={submitting} variant="secondary" className="w-full">
                        Volver
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-warning via-warning/70 to-warning" />
            </FocusTrap>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
