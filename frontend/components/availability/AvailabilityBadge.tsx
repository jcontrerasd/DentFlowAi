'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2 } from 'lucide-react';
import { getMyAvailabilityStatusAction } from '@/lib/db/actions/availability';
import GlobalAvailabilitySwitch from './GlobalAvailabilitySwitch';
import ResponseStatusStepper from './ResponseStatusStepper';

type Status = Awaited<ReturnType<typeof getMyAvailabilityStatusAction>>;

/**
 * Badge global de disponibilidad en el header (v5.0, §1.6 + §2.6.2).
 * Solo visible para técnicos con AVAILABILITY_UI_TECNICO_ENABLED (gating server-side
 * vía `enabled` en la action). Punto de aviso ámbar/rojo en Nivel 2/3.
 */
export default function AvailabilityBadge() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await getMyAvailabilityStatusAction();
    setStatus(res);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (!status || !status.success || !status.enabled || !status.availability) return null;

  const { availability, level, pendingCount } = status;
  const on = availability.levelGlobal;
  const warnColor = level.level >= 3 ? 'bg-error' : level.level === 2 ? 'bg-amber-400' : null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2 px-3 py-1.5 rounded-xl border border-divider bg-surface-2/40 hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        title="Tu disponibilidad"
      >
        <span className={`w-2 h-2 rounded-full ${on ? 'bg-primary' : 'bg-faint'}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${on ? 'text-foreground' : 'text-faint'}`}>
          {on ? 'Activo' : 'En pausa'}
        </span>
        {warnColor && <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${warnColor} ring-2 ring-surface`} />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="absolute right-0 mt-2 w-80 z-50 bg-surface border border-divider rounded-3xl shadow-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-foreground">Disponibilidad</p>
                  <p className="text-[11px] text-faint">{on ? 'Recibes invitaciones' : 'En pausa'}</p>
                </div>
                <GlobalAvailabilitySwitch
                  userId={availability.userId}
                  levelGlobal={on}
                  level={level}
                  pendingCount={pendingCount}
                  onChanged={refresh}
                />
              </div>

              <div className="border-t border-divider pt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-faint mb-3">Estado de respuesta</p>
                <ResponseStatusStepper level={level.level} count={level.count} nextExitDate={level.nextExitDate} compact />
              </div>

              <Link
                href="/dashboard/profile/availability"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 text-[11px] font-bold text-primary hover:underline"
              >
                <Settings2 className="w-3.5 h-3.5" /> Ir al panel de disponibilidad
              </Link>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
