'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Power, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { updateAvailabilityLevelAction } from '@/lib/db/actions/availability';

/**
 * Modal informativo (no bloqueante) al reactivar tras auto-OFF Nivel 3 (v5.0, §2.6.5).
 * Muestra datos en tiempo real; reactivar NO limpia el score ni el contador.
 */
export default function ReactivationModal({
  isOpen, onClose, userId, count, nextExitDate, onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  count: number;
  nextExitDate: Date | string | null;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exit = nextExitDate ? new Date(nextExitDate) : null;
  const daysLeft = exit ? Math.max(0, Math.ceil((exit.getTime() - Date.now()) / 86_400_000)) : null;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    const res = await updateAvailabilityLevelAction({ userId, target: { kind: 'global' }, value: true });
    setSubmitting(false);
    if (res.success) { onDone(); onClose(); }
    else setError(res.error);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-surface border border-divider rounded-[2.5rem] shadow-2xl overflow-hidden">
            <FocusTrap onEscape={onClose}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary-hl border border-primary/20 flex items-center justify-center text-primary">
                    <Power className="w-6 h-6" />
                  </div>
                  <button onClick={onClose} className="p-2 text-faint hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <h3 className="text-xl font-black text-foreground uppercase tracking-tighter mb-4">¿Reactivar tu disponibilidad?</h3>

                <div className="space-y-2 mb-5 text-sm text-muted">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-faint">Tu situación actual</p>
                  <ul className="space-y-1.5 text-[13px]">
                    <li>• <span className="font-bold text-foreground">{count}</span> no-respuesta{count === 1 ? '' : 's'} activa{count === 1 ? '' : 's'} en la ventana.</li>
                    <li>• Tu score Fauchard está penalizado en <span className="font-bold text-error">−0.25</span> hasta que salgan de la ventana.</li>
                    {exit && daysLeft !== null && (
                      <li>• Próxima salida: <span className="font-bold text-foreground">{exit.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</span> (en {daysLeft} {daysLeft === 1 ? 'día' : 'días'}).</li>
                    )}
                  </ul>
                </div>

                <div className="mb-6 p-3 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-muted leading-snug">
                    Si reactivas y dejas pasar <span className="font-bold">una</span> invitación más sin responder, tu cuenta queda en revisión manual del admin.
                  </p>
                </div>

                {error && <div className="mb-4 p-3 rounded-2xl bg-error-hl border border-error/30 text-error text-sm">{error}</div>}

                <div className="flex flex-col gap-3">
                  <Button onClick={handleConfirm} loading={submitting} className="w-full">Reactivar igualmente</Button>
                  <Button onClick={onClose} disabled={submitting} variant="secondary" className="w-full">Cancelar</Button>
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
