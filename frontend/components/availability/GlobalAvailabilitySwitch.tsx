'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { updateAvailabilityLevelAction } from '@/lib/db/actions/availability';
import { useToast } from '@/context/ToastContext';
import BulkRejectDialog from './BulkRejectDialog';
import ReactivationModal from './ReactivationModal';

/**
 * Switch global de disponibilidad + orquestación de diálogos in-flight (v5.0).
 * - OFF con pendientes → BulkRejectDialog (mantener / rechazar todas).
 * - ON desde Nivel 3 (auto-OFF) → ReactivationModal (informativo, no bloqueante).
 */
export default function GlobalAvailabilitySwitch({
  userId, levelGlobal, level, pendingCount, onChanged,
}: {
  userId: string;
  levelGlobal: boolean;
  level: { level: 0 | 1 | 2 | 3; count: number; nextExitDate: Date | string | null };
  pendingCount: number;
  onChanged: () => void;
}) {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showReactivation, setShowReactivation] = useState(false);

  const directToggle = async (value: boolean) => {
    setLoading(true);
    const res = await updateAvailabilityLevelAction({ userId, target: { kind: 'global' }, value });
    setLoading(false);
    if (res.success) {
      showSuccess(value ? 'Disponibilidad activada.' : 'Disponibilidad en pausa.');
      onChanged();
    } else {
      showError(res.error || 'No se pudo cambiar la disponibilidad');
    }
  };

  const handleClick = () => {
    if (loading) return;
    if (levelGlobal) {
      // Turning OFF
      if (pendingCount > 0) setShowBulk(true);
      else directToggle(false);
    } else {
      // Turning ON
      if (level.level >= 3) setShowReactivation(true);
      else directToggle(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        aria-label={levelGlobal ? 'Pausar disponibilidad' : 'Activar disponibilidad'}
        className={`relative w-14 h-7 rounded-full transition-colors duration-300 flex-shrink-0 disabled:opacity-50 ${levelGlobal ? 'bg-primary' : 'bg-surface-off'}`}
      >
        <motion.div className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg" animate={{ x: levelGlobal ? 32 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
          </div>
        )}
      </button>

      <BulkRejectDialog
        isOpen={showBulk}
        onClose={() => setShowBulk(false)}
        userId={userId}
        pendingCount={pendingCount}
        onDone={() => { showSuccess('Disponibilidad en pausa.'); onChanged(); }}
      />
      <ReactivationModal
        isOpen={showReactivation}
        onClose={() => setShowReactivation(false)}
        userId={userId}
        count={level.count}
        nextExitDate={level.nextExitDate}
        onDone={() => { showSuccess('Disponibilidad reactivada.'); onChanged(); }}
      />
    </>
  );
}
