'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { cancelPendingPoolAction } from '@/lib/db/actions/poolQueue';

/**
 * Check-in al dentista (v5.0, §5/§10): aparece cuando entra al caso y la espera en
 * pendiente_pool cruzó el 50% del TTL. Pregunta si sigue necesitando el caso.
 * "Seguir buscando" cierra el modal (no muta); "Cancelar publicación" cierra el caso.
 */
export default function CheckInDentistaModal({
  isOpen,
  onClose,
  caseId,
  caseLabel,
  onCancelled,
  onError,
}: {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseLabel?: string;
  onCancelled: () => void;
  onError?: (msg: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

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
            aria-labelledby="checkin-title"
          >
            <FocusTrap onEscape={() => { if (!submitting) onClose(); }}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
                    <Clock className="w-6 h-6" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!submitting) onClose(); }}
                    className="p-2 text-faint hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h3 id="checkin-title" className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">
                  ¿Sigues necesitando este caso?
                </h3>
                <p className="text-sm text-muted font-medium mb-6">
                  El caso {caseLabel ? <span className="font-bold text-foreground">{caseLabel}</span> : 'seleccionado'} lleva un tiempo esperando técnicos disponibles. Si sigues necesitándolo, seguimos buscando; si no, puedes cancelar la publicación.
                </p>

                <div className="flex flex-col gap-3">
                  <Button
                    onClick={onClose}
                    disabled={submitting}
                    className="w-full"
                    data-testid="checkin-keep"
                  >
                    Seguir buscando
                  </Button>
                  <Button
                    onClick={async () => {
                      setSubmitting(true);
                      const res = await cancelPendingPoolAction(caseId);
                      setSubmitting(false);
                      if (res.success) { onCancelled(); onClose(); }
                      else onError?.(res.error || 'No se pudo cancelar la publicación');
                    }}
                    disabled={submitting}
                    loading={submitting}
                    variant="secondary"
                    className="w-full"
                    data-testid="checkin-cancel"
                  >
                    Cancelar publicación
                  </Button>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400" />
            </FocusTrap>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
