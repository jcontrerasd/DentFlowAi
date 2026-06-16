'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { republicarCaseAction } from '@/lib/db/actions/cases';

/**
 * Modal de republicación de un caso que agotó la cola pendiente_pool y quedó en
 * `sin_cotizaciones_fallo` (v5.0, §10.4). Doble confirmación: un checkbox de
 * entendimiento + el botón. Reinicia la búsqueda Fauchard desde cero.
 */
export default function RepublicarModal({
  isOpen,
  onClose,
  caseId,
  caseLabel,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseLabel?: string;
  /** Llamado tras republicar con éxito (refrescar ficha). */
  onDone: () => void;
}) {
  const [understood, setUnderstood] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setUnderstood(false);
    setSubmitting(false);
    setError(null);
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!understood || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await republicarCaseAction(caseId);
      if (!res.success) {
        setError(res.error || 'No se pudo republicar el caso');
        setSubmitting(false);
        return;
      }
      onDone();
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
            aria-labelledby="republicar-title"
          >
            <FocusTrap onEscape={() => { if (!submitting) onClose(); }}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <RefreshCw className="w-6 h-6" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!submitting) onClose(); }}
                    className="p-2 text-faint hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h3 id="republicar-title" className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">
                  Republicar caso
                </h3>
                <p className="text-sm text-muted font-medium mb-6">
                  El caso {caseLabel ? <span className="font-bold text-foreground">{caseLabel}</span> : 'seleccionado'} no recibió asignación. Al republicar, Fauchard reinicia la búsqueda de técnicos disponibles desde cero.
                </p>

                <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={understood}
                    onChange={(e) => setUnderstood(e.target.checked)}
                    data-testid="republicar-understood"
                    className="mt-1 rounded border-divider"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    Entiendo que se <strong className="text-foreground">reinicia la búsqueda</strong> y se enviarán nuevas invitaciones a los técnicos disponibles.
                  </span>
                </label>

                {error && (
                  <div className="mb-4 p-3 rounded-2xl bg-error-hl border border-error/30 text-error text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <Button
                    onClick={handleConfirm}
                    disabled={!understood || submitting}
                    loading={submitting}
                    className="w-full"
                    data-testid="republicar-confirm"
                  >
                    Republicar y buscar técnicos
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
