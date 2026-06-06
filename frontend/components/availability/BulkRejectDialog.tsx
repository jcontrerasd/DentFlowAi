'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, PauseCircle, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { listActiveCatalogOptionsAction, type CatalogOption } from '@/lib/db/actions/catalogs';
import { rejectInvitationsBulkAction } from '@/lib/db/actions/rejection';
import { updateAvailabilityLevelAction } from '@/lib/db/actions/availability';

/**
 * Diálogo al apagar el switch global con invitaciones pendientes (v5.0, §3.1).
 * Mantener (default) o Rechazar todas con motivo del catálogo. En ambos casos el
 * switch global queda OFF.
 */
const OTRO_CODE = 'brej_005';

export default function BulkRejectDialog({
  isOpen, onClose, userId, pendingCount, onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  pendingCount: number;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'keep' | 'reject'>('keep');
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode('keep'); setReasonId(''); setComment(''); setError(null);
    listActiveCatalogOptionsAction('bulk_rejection_reason').then(setOptions);
  }, [isOpen]);

  const selectedCode = options.find((o) => o.id === reasonId)?.code;
  const needsComment = selectedCode === OTRO_CODE;
  const canConfirm =
    !submitting && (mode === 'keep' || (reasonId && (!needsComment || comment.trim())));

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'reject') {
        const res = await rejectInvitationsBulkAction(userId, reasonId, comment.trim() || undefined, []);
        if (!res.success) { setError(res.error); setSubmitting(false); return; }
      }
      // En ambos casos el switch global queda OFF.
      const off = await updateAvailabilityLevelAction({ userId, target: { kind: 'global' }, value: false });
      if (!off.success) { setError(off.error); setSubmitting(false); return; }
      onDone();
      onClose();
    } finally {
      setSubmitting(false);
    }
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
                  <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400">
                    <PauseCircle className="w-6 h-6" />
                  </div>
                  <button onClick={onClose} className="p-2 text-faint hover:text-foreground transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <h3 className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">Pausar disponibilidad</h3>
                <p className="text-sm text-muted font-medium mb-6">
                  Tienes <span className="font-bold text-foreground">{pendingCount}</span> invitación{pendingCount === 1 ? '' : 'es'} pendiente{pendingCount === 1 ? '' : 's'}. ¿Qué quieres hacer?
                </p>

                <div className="space-y-3 mb-6">
                  <button onClick={() => setMode('keep')} className={`w-full text-left p-4 rounded-2xl border transition-colors ${mode === 'keep' ? 'border-primary/40 bg-primary-hl' : 'border-divider hover:bg-surface-2'}`}>
                    <p className="text-sm font-bold text-foreground">Mantenerlas activas</p>
                    <p className="text-[11px] text-faint mt-0.5">La pausa solo afecta invitaciones nuevas. Si no respondes, cuentan como no-respuesta.</p>
                  </button>
                  <button onClick={() => setMode('reject')} className={`w-full text-left p-4 rounded-2xl border transition-colors ${mode === 'reject' ? 'border-primary/40 bg-primary-hl' : 'border-divider hover:bg-surface-2'}`}>
                    <p className="text-sm font-bold text-foreground">Rechazarlas todas</p>
                    <p className="text-[11px] text-faint mt-0.5">Decisión explícita con motivo. No cuentan como no-respuesta.</p>
                  </button>
                </div>

                {mode === 'reject' && (
                  <div className="space-y-3 mb-6">
                    <select value={reasonId} onChange={(e) => setReasonId(e.target.value)} className="w-full rounded-2xl bg-surface-2 border border-divider px-4 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                      <option value="">Selecciona un motivo…</option>
                      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {needsComment && (
                      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Comentario (obligatorio para 'Otro')" className="w-full rounded-2xl bg-surface-2 border border-divider p-3 text-sm text-foreground placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none" />
                    )}
                  </div>
                )}

                {error && <div className="mb-4 p-3 rounded-2xl bg-error-hl border border-error/30 text-error text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</div>}

                <div className="flex flex-col gap-3">
                  <Button onClick={handleConfirm} disabled={!canConfirm} loading={submitting} className="w-full">
                    {mode === 'keep' ? 'Pausar y mantener pendientes' : 'Rechazar todas y pausar'}
                  </Button>
                  <Button onClick={onClose} disabled={submitting} variant="secondary" className="w-full">Cancelar</Button>
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
