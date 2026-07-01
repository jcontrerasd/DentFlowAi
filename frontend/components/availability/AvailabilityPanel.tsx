'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getMyAvailabilityStatusAction, updateAvailabilityLevelAction, type AvailabilityRow, type Capacity } from '@/lib/db/actions/availability';
import { WORK_CATEGORIES, WORK_CATEGORY_LABELS, type WorkCategory } from '@/lib/constants/dental';
import { useToast } from '@/context/ToastContext';
import GlobalAvailabilitySwitch from './GlobalAvailabilitySwitch';
import ResponseStatusStepper from './ResponseStatusStepper';
import ResponseHistoryView from './ResponseHistoryView';

type Status = Extract<Awaited<ReturnType<typeof getMyAvailabilityStatusAction>>, { success: true }>;

const CAT_KEY: Record<WorkCategory, Record<Capacity, keyof AvailabilityRow>> = {
  coronas: { cad: 'catCoronasCad' },
  inlays: { cad: 'catInlaysCad' },
  carillas: { cad: 'catCarillasCad' },
  puentes: { cad: 'catPuentesCad' },
  full_arch: { cad: 'catFullArchCad' },
  protesis: { cad: 'catProtesisCad' },
  guias: { cad: 'catGuiasCad' },
};

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      aria-label={checked ? 'Desactivar' : 'Activar'}
      className={`relative w-11 h-6 rounded-full transition-colors duration-300 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${checked ? 'bg-primary' : 'bg-surface-off'}`}
    >
      <motion.div className="absolute top-1 w-4 h-4 bg-white rounded-full shadow" animate={{ x: checked ? 24 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
    </button>
  );
}

export default function AvailabilityPanel() {
  const { showError } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [avail, setAvail] = useState<AvailabilityRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await getMyAvailabilityStatusAction();
    if (res.success) {
      setStatus(res);
      setAvail(res.availability);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateLevel = async (target: Parameters<typeof updateAvailabilityLevelAction>[0]['target'], value: boolean) => {
    if (!avail) return;
    const prev = avail;
    // Optimista
    const patch: Partial<AvailabilityRow> = {};
    if (target.kind === 'capacity') (patch as any)['levelCad'] = value;
    else if (target.kind === 'category') (patch as any)[CAT_KEY[target.categoria][target.capacidad]] = value;
    setAvail({ ...avail, ...patch });

    const res = await updateAvailabilityLevelAction({ userId: avail.userId, target, value });
    if (!res.success) {
      setAvail(prev);
      showError(res.error || 'No se pudo actualizar');
    } else if (res.availability) {
      setAvail(res.availability);
    }
  };

  if (loading) return <p className="text-sm text-muted">Cargando disponibilidad…</p>;
  if (!status || !status.enabled || !avail) {
    return <p className="text-sm text-muted">El panel de disponibilidad no está habilitado para tu cuenta.</p>;
  }

  const { level, pendingCount } = status;

  const CapacityColumn = ({ cap, label }: { cap: Capacity; label: string }) => {
    const parentOn = avail.levelCad;
    return (
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-2/40 border border-divider">
          <div>
            <p className="text-sm font-black text-foreground">{label}</p>
            <p className="text-xs text-muted uppercase tracking-wider">Diseño</p>
          </div>
          <Toggle checked={parentOn} onChange={() => updateLevel({ kind: 'capacity', capacidad: cap }, !parentOn)} />
        </div>
        <div className={`space-y-1 ${parentOn ? '' : 'opacity-50'}`}>
          {WORK_CATEGORIES.map((cat) => {
            const val = Boolean(avail[CAT_KEY[cat][cap]]);
            return (
              <div key={cat} className="flex items-center justify-between px-4 py-2.5 rounded-xl hover:bg-surface-2/40">
                <span className="text-sm text-muted">{WORK_CATEGORY_LABELS[cat]}</span>
                <Toggle checked={val} disabled={!parentOn} onChange={() => updateLevel({ kind: 'category', categoria: cat, capacidad: cap }, !val)} />
              </div>
            );
          })}
        </div>
        {!parentOn && <p className="text-xs text-muted italic px-1">Activa {label} para gestionar estas categorías.</p>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {/* Switch global */}
      <div className="flex items-center justify-between p-6 rounded-3xl bg-surface/40 border border-divider">
        <div>
          <h2 className="text-sm font-black text-foreground uppercase tracking-widest">Disponibilidad</h2>
          <p className="text-xs text-muted mt-1 max-w-sm">
            {avail.levelGlobal ? 'Estás disponible para recibir asignaciones.' : 'En pausa: no recibirás nuevas asignaciones.'}
          </p>
        </div>
        <GlobalAvailabilitySwitch userId={avail.userId} levelGlobal={avail.levelGlobal} level={level} pendingCount={pendingCount} onChanged={refresh} />
      </div>

      {/* Estado de respuesta */}
      <div className="p-6 rounded-3xl bg-surface/40 border border-divider">
        <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-4">Estado de respuesta</h3>
        <ResponseStatusStepper level={level.level} count={level.count} nextExitDate={level.nextExitDate} />
      </div>

      {/* Capacidades y categorías */}
      <div className="p-6 rounded-3xl bg-surface/40 border border-divider space-y-4">
        <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Capacidades y categorías</h3>
        <p className="text-xs text-muted">
          Recibes asignaciones solo cuando el switch global, la capacidad (CAD) y la categoría están activos. Los valores se preservan aunque pauses la capacidad.
        </p>
        <div className={`flex flex-col md:flex-row gap-6 ${avail.levelGlobal ? '' : 'opacity-60'}`}>
          <CapacityColumn cap="cad" label="CAD" />
        </div>
      </div>

      {/* Historial */}
      <div className="p-6 rounded-3xl bg-surface/40 border border-divider">
        <ResponseHistoryView userId={avail.userId} />
      </div>
    </div>
  );
}
