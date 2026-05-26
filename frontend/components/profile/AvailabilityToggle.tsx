'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, ZapOff } from 'lucide-react';
import { toggleAvailabilityAction } from '@/lib/db/actions/skills';
import { useToast } from '@/context/ToastContext';

interface AvailabilityToggleProps {
  initialValue: boolean;
  suspendedUntil?: Date | null;
}

export default function AvailabilityToggle({ initialValue, suspendedUntil }: AvailabilityToggleProps) {
  const { showSuccess, showError } = useToast();
  const [isAvailable, setIsAvailable] = useState(initialValue);
  const [loading, setLoading] = useState(false);

  const isSuspended = suspendedUntil && new Date(suspendedUntil) > new Date();

  const handleToggle = async () => {
    if (isSuspended) return;
    setLoading(true);
    const res = await toggleAvailabilityAction();
    setLoading(false);

    if (res.success) {
      setIsAvailable(res.isAvailable);
      showSuccess(res.isAvailable ? 'Ahora apareces como disponible para recibir invitaciones.' : 'Has pausado la recepción de nuevas invitaciones.');
    } else {
      showError(res.error || 'Error al cambiar disponibilidad');
    }
  };

  return (
    <div className="bg-surface/40 border border-divider rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Disponibilidad</h3>
          <p className="text-[11px] text-faint leading-relaxed max-w-xs">
            Al marcarte como no disponible, no recibirás nuevas invitaciones de trabajo hasta que reactives tu disponibilidad.
          </p>
        </div>

        <button
          onClick={handleToggle}
          disabled={loading || !!isSuspended}
          aria-label={isAvailable ? 'Marcar como no disponible' : 'Marcar como disponible'}
          className={`relative w-14 h-7 rounded-full transition-colors duration-300 flex-shrink-0 disabled:opacity-50 ${
            isAvailable ? 'bg-primary' : 'bg-surface-off'
          }`}
        >
          <motion.div
            className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg"
            animate={{ x: isAvailable ? 32 : 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
            </div>
          )}
        </button>
      </div>

      {/* Estado visual */}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${
        isSuspended
          ? 'bg-error/8 border-error/30'
          : isAvailable
            ? 'bg-primary/8 border-primary/20'
            : 'bg-surface-2/60 border-divider'
      }`}>
        {isAvailable && !isSuspended
          ? <Zap className="w-4 h-4 text-primary flex-shrink-0" />
          : <ZapOff className="w-4 h-4 text-faint flex-shrink-0" />}
        <div>
          {isSuspended ? (
            <>
              <p className="text-xs font-bold text-error">Cuenta suspendida temporalmente</p>
              <p className="text-[10px] text-faint">
                Hasta {new Date(suspendedUntil!).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[10px] text-faint mt-0.5">Ocurrió porque no respondiste 3 invitaciones consecutivas. Reactiva tu cuenta para volver a recibir trabajo.</p>
            </>
          ) : isAvailable ? (
            <>
              <p className="text-xs font-bold text-primary">Disponible</p>
              <p className="text-[10px] text-faint">Recibirás invitaciones de trabajo del sistema</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-muted">No disponible (pausa)</p>
              <p className="text-[10px] text-faint">No recibirás nuevas invitaciones mientras estés en pausa</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
