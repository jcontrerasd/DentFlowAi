'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import {
  getActiveNoResponseEventsForTechAction,
  pardonNoResponseEventsAction,
  type ActiveNoResponseEvent,
} from '@/lib/db/actions/noResponseEvents';

/**
 * Modal admin "Resetear contador de no-respuestas" (v5.0, §2.7). Lista las
 * no-respuestas activas y exige un motivo libre obligatorio antes de perdonar.
 */
export default function ResetNoResponseModal({
  isOpen,
  onClose,
  userId,
  userName,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onDone?: () => void;
}) {
  const [events, setEvents] = useState<ActiveNoResponseEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setError(null);
    setLoading(true);
    getActiveNoResponseEventsForTechAction(userId)
      .then((res) => setEvents(res.success ? res.events : []))
      .finally(() => setLoading(false));
  }, [isOpen, userId]);

  const canConfirm = reason.trim().length > 0 && events.length > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    const res = await pardonNoResponseEventsAction(userId, events.map((e) => e.id), reason.trim());
    setSubmitting(false);
    if (res.success) {
      onDone?.();
      onClose();
    } else {
      setError(res.error);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-surface border border-divider rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <FocusTrap onEscape={onClose}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <button onClick={onClose} className="p-2 text-muted hover:text-foreground transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <h3 className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">
                  Resetear no-respuestas
                </h3>
                <p className="text-sm text-muted font-medium mb-6">
                  Técnico: <span className="text-foreground font-bold">{userName}</span>
                </p>

                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
                    No-respuestas activas que se perdonarán
                  </p>
                  {loading ? (
                    <p className="text-sm text-muted">Cargando…</p>
                  ) : events.length === 0 ? (
                    <p className="text-sm text-muted opacity-50">No hay no-respuestas activas.</p>
                  ) : (
                    <ul className="max-h-40 overflow-auto rounded-2xl border border-divider divide-y divide-divider">
                      {events.map((e) => (
                        <li key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span className="text-foreground font-medium">{e.caseNumber ?? 'Caso —'}</span>
                          <span className="text-muted text-xs">{new Date(e.occurredAt).toLocaleDateString('es-CL')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mb-6 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted">
                    Motivo (obligatorio)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Ej: el técnico avisó por canal externo que estuvo enfermo"
                    className="w-full rounded-2xl bg-surface-2 border border-divider p-3 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
                  />
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-2xl bg-error-hl border border-error/30 text-error text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {error}
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <Button onClick={handleConfirm} disabled={!canConfirm} loading={submitting} className="w-full">
                    Confirmar perdón
                  </Button>
                  <Button onClick={onClose} disabled={submitting} variant="secondary" className="w-full">
                    Cancelar
                  </Button>
                </div>
              </div>
              <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-500" />
            </FocusTrap>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
