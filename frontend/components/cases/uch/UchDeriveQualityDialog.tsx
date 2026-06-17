'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GitBranch, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { listActiveCatalogOptionsAction, type CatalogOption } from '@/lib/db/actions/catalogs';
import { deriveQualityReviewAction, listActiveCalidadUsersAction } from '@/lib/db/actions/quality';

/**
 * Diálogo para que un revisor de Calidad derive el caso a otro revisor (v5.19).
 * Motivo del catálogo `quality_derivation_reason`; el comentario es obligatorio
 * para "Otro" (qdr_005). El nuevo revisor verá motivo + comentario en su UCH.
 */
const OTRO_CODE = 'qdr_005';

export default function UchDeriveQualityDialog({
  isOpen,
  onClose,
  caseId,
  onDerived,
}: {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onDerived: () => void;
}) {
  const [reasons, setReasons] = useState<CatalogOption[]>([]);
  const [targets, setTargets] = useState<Array<{ id: string; fullName: string | null }>>([]);
  const [reasonId, setReasonId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReasonId('');
    setTargetId('');
    setComment('');
    setError(null);
    setSubmitting(false);
    listActiveCatalogOptionsAction('quality_derivation_reason').then(setReasons);
    listActiveCalidadUsersAction().then((res) => {
      if (res.success && res.data) setTargets(res.data);
    });
  }, [isOpen]);

  const selectedCode = reasons.find((o) => o.id === reasonId)?.code;
  const needsComment = selectedCode === OTRO_CODE;
  const canConfirm = !submitting && Boolean(reasonId) && Boolean(targetId) && (!needsComment || comment.trim().length > 0);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await deriveQualityReviewAction(caseId, targetId, reasonId, comment.trim() || undefined);
      if (!res.success) {
        setError(res.error || 'No se pudo derivar el caso');
        setSubmitting(false);
        return;
      }
      onDerived();
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
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
            aria-labelledby="uch-derive-quality-title"
          >
            <FocusTrap onEscape={() => { if (!submitting) onClose(); }}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <GitBranch className="w-6 h-6" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!submitting) onClose(); }}
                    className="p-2 text-faint hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h3 id="uch-derive-quality-title" className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">
                  Derivar a otro revisor
                </h3>
                <p className="text-sm text-muted font-medium mb-6">
                  El caso pasará a otro revisor de Calidad. Indica a quién, el motivo y un comentario para que tenga contexto.
                </p>

                <div className="space-y-3 mb-6">
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    data-testid="uch-derive-target-select"
                    className="w-full rounded-2xl bg-surface-2 border border-divider px-4 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <option value="">Selecciona un revisor…</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>{t.fullName || t.id}</option>
                    ))}
                  </select>
                  <select
                    value={reasonId}
                    onChange={(e) => setReasonId(e.target.value)}
                    data-testid="uch-derive-reason-select"
                    className="w-full rounded-2xl bg-surface-2 border border-divider px-4 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <option value="">Selecciona un motivo…</option>
                    {reasons.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder={needsComment ? "Comentario (obligatorio para 'Otro')" : 'Comentario para el nuevo revisor (opcional)'}
                    data-testid="uch-derive-comment"
                    className="w-full rounded-2xl bg-surface-2 border border-divider p-3 text-sm text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
                  />
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
                    className="w-full"
                    data-testid="uch-derive-confirm"
                  >
                    Derivar caso
                  </Button>
                  <Button onClick={onClose} disabled={submitting} variant="secondary" className="w-full">
                    Cancelar
                  </Button>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/70 to-primary" />
            </FocusTrap>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
