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
    <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Disponibilidad</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
            Al marcarte como no disponible, no recibirás nuevas invitaciones de trabajo hasta que reactives tu disponibilidad.
          </p>
        </div>

        <button
          onClick={handleToggle}
          disabled={loading || !!isSuspended}
          aria-label={isAvailable ? 'Marcar como no disponible' : 'Marcar como disponible'}
          className={`relative w-14 h-7 rounded-full transition-colors duration-300 flex-shrink-0 disabled:opacity-50 ${
            isAvailable ? 'bg-teal-500' : 'bg-slate-700'
          }`}
        >
          <motion.div
            className="absolute top-1 w-5 h-5 bg-white rounded-full shadow-lg"
            animate={{ x: isAvailable ? 32 : 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </button>
      </div>

      {/* Estado visual */}
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${
        isSuspended
          ? 'bg-red-500/8 border-red-500/20'
          : isAvailable
            ? 'bg-teal-500/8 border-teal-500/20'
            : 'bg-slate-800/60 border-white/5'
      }`}>
        {isAvailable && !isSuspended
          ? <Zap className="w-4 h-4 text-teal-400 flex-shrink-0" />
          : <ZapOff className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <div>
          {isSuspended ? (
            <>
              <p className="text-xs font-bold text-red-400">Cuenta suspendida temporalmente</p>
              <p className="text-[10px] text-slate-500">
                Hasta {new Date(suspendedUntil!).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">Ocurrió porque no respondiste 3 invitaciones consecutivas. Reactiva tu cuenta para volver a recibir trabajo.</p>
            </>
          ) : isAvailable ? (
            <>
              <p className="text-xs font-bold text-teal-400">Disponible</p>
              <p className="text-[10px] text-slate-500">Recibirás invitaciones de trabajo del sistema</p>
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-slate-400">No disponible (pausa)</p>
              <p className="text-[10px] text-slate-500">No recibirás nuevas invitaciones mientras estés en pausa</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
