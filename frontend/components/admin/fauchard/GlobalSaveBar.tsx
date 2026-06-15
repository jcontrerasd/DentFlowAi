'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, AlertCircle, RotateCcw, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import ConfirmSaveModal from './ConfirmSaveModal';
import { useFauchardDraft, type DraftKey } from './FauchardDraftContext';

/** Etiquetas legibles para el diff de cambios. */
const KEY_LABELS: Record<DraftKey, string> = {
  alphaQuality: 'Peso Calidad (αQ)', alphaPunctuality: 'Peso Puntualidad (αP)', alphaExperience: 'Peso Experiencia (αE)',
  alphaLoad: 'Peso Carga (αL)', alphaNoResponse: 'Peso No-resp (αN)',
  wQualityDays: 'Ventana Calidad (días)', wLoadDays: 'Ventana Carga (días)', cMax: 'Techo de Carga', dBonusMaxDays: 'Bono máx (días)',
  tCooldownMinutes: 'Cooldown (min)', dInactivityDays: 'Inactividad (días)',
  maxAssignmentAttempts: 'Intentos máx. asignación', tQuoteMinutes: 'Tiempo respuesta asignación (min)',
  tDentistReviewHours: 'Revisión dentista (h)', tNoEligiblePoolHours: 'Espera pool (h)', maxPoolCycles: 'Ciclos de espera', replacementCutoffMinutes: 'Margen reemplazo (min)',
  noResponseWindowDays: 'Ventana no-resp (días)', noResponseRehabilitationDays: 'Rehabilitación (días)',
  level1Threshold: 'Umbral Nivel 1', level2Threshold: 'Umbral Nivel 2', level3Threshold: 'Umbral Nivel 3',
  inactivityAutoOffDays: 'Auto-OFF (días)', inactivityReminderDays: 'Recordatorio (días)',
};

export default function GlobalSaveBar() {
  const { draft, initial, dirtyKeys, isDirty, errors, isValid, saving, save, reset } = useFauchardDraft();
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));

  const handleConfirm = async () => {
    const res = await save(reason.trim());
    if (res.success) {
      setMessage({ type: 'success', text: 'Configuración guardada correctamente.' });
      setShowConfirm(false);
      setReason('');
    } else {
      setMessage({ type: 'error', text: res.error || 'Error al guardar.' });
    }
  };

  return (
    <>
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] p-3 px-5 rounded-2xl border text-sm flex items-center gap-2 shadow-xl ${message.type === 'success' ? 'bg-primary-hl border-primary/20 text-primary' : 'bg-error-hl border-error/30 text-error'}`}
            onAnimationComplete={() => message.type === 'success' && setTimeout(() => setMessage(null), 2500)}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] w-[min(92vw,720px)]"
          >
            <div className="flex items-center gap-4 p-3 pl-5 rounded-[2rem] bg-surface border border-divider shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-2 min-w-0">
                {isValid ? (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-error shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-black text-foreground">
                    {dirtyKeys.length} cambio{dirtyKeys.length !== 1 ? 's' : ''} sin guardar
                  </p>
                  <p className="text-[10px] text-faint truncate">
                    {isValid ? dirtyKeys.map((k) => KEY_LABELS[k]).join(' · ') : errors[0].message}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                <button
                  onClick={reset}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-faint hover:text-foreground hover:bg-surface-2 text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Descartar
                </button>
                <Button
                  onClick={() => { setMessage(null); setShowConfirm(true); }}
                  disabled={!isValid || saving}
                  icon={<Save className="w-4 h-4" />}
                >
                  Guardar cambios
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmSaveModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        isLoading={saving}
        requireReason
        reasonValue={reason}
        onReasonChange={setReason}
        title={`¿Guardar ${dirtyKeys.length} cambio${dirtyKeys.length !== 1 ? 's' : ''}?`}
        description={`Se persistirá una nueva versión activa de Fauchard (copy-on-write). Cambios: ${dirtyKeys
          .map((k) => `${KEY_LABELS[k]} (${fmt(initial[k])} → ${fmt(draft[k])})`)
          .join('; ')}.`}
      />
    </>
  );
}
