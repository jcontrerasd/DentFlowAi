'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { getMyAvailabilityStatusAction } from '@/lib/db/actions/availability';

/**
 * Banner in-app de rollout del modelo de disponibilidad (v5.0, Fase 7).
 * Solo para técnicos con `AVAILABILITY_UI_TECNICO_ENABLED` (gating server-side vía
 * `enabled` en la action). Se descarta con la cookie `availability_banner_dismissed`
 * (no vuelve a aparecer). Link al panel de disponibilidad.
 */
const COOKIE = 'availability_banner_dismissed';

function hasDismissCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE}=`));
}

export default function RolloutBanner() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasDismissCookie()) return;
    let active = true;
    getMyAvailabilityStatusAction()
      .then((res) => {
        if (!active) return;
        if (res.success && res.enabled) {
          setEnabled(true);
          setVisible(true);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const dismiss = () => {
    // 90 días — suficiente para cubrir las primeras sesiones post-rollout.
    document.cookie = `${COOKIE}=1; path=/; max-age=${90 * 24 * 3600}; samesite=lax`;
    setVisible(false);
  };

  if (!enabled) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          data-testid="rollout-banner"
          className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
        >
          <div className="flex items-start gap-3 flex-1">
            <span className="mt-0.5 text-primary"><Sparkles className="w-5 h-5" /></span>
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-foreground">Ahora controlas tu disponibilidad</p>
              <p className="text-[11px] text-faint">
                Activa o pausa cuándo recibes invitaciones y para qué categorías. Por defecto estás activo en todo lo que ya manejas.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard/profile/availability"
              onClick={dismiss}
              className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-primary text-inverse text-[10px] font-black uppercase tracking-wider hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Gestionar
            </Link>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Descartar aviso"
              data-testid="rollout-banner-dismiss"
              className="p-2 text-faint hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
