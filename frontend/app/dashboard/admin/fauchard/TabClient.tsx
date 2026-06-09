'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, History, CalendarDays, Trophy } from 'lucide-react';
import { fauchardParamPanel } from '@/lib/constants/fauchardHelp';
import FauchardWeightsPanel from '@/components/admin/fauchard/FauchardWeightsPanel';
import FauchardFiltersPanel from '@/components/admin/fauchard/FauchardFiltersPanel';
import ConfigChangeLog from '@/components/admin/fauchard/ConfigChangeLog';
import FauchardCalendarPanel from '@/components/admin/fauchard/FauchardCalendarPanel';
import PlazosYSancionesPanel from '@/components/admin/fauchard/PlazosYSancionesPanel';
import LeagueConfigPanel from '@/components/admin/fauchard/LeagueConfigPanel';
import FauchardLabPanel from '@/components/admin/fauchard/FauchardLabPanel';
import GlobalSaveBar from '@/components/admin/fauchard/GlobalSaveBar';
import { FauchardDraftProvider } from '@/components/admin/fauchard/FauchardDraftContext';
import { motion, AnimatePresence } from 'framer-motion';

type Space = 'parametros' | 'calendario' | 'categorias' | 'historial';

export function TabClient({ config, showAvailabilityPanel = false }: { config: any; showAvailabilityPanel?: boolean }) {
  const searchParams = useSearchParams();
  const [space, setSpace] = useState<Space>('parametros');
  // Parámetro a enfocar cuando se llega vía deep-link (`?space=...&focus=<key>`).
  // Se enruta al panel que lo edita.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Reacciona a la URL en CADA cambio, no solo al montar: los chips "Ajustar:"
  // del propio Fauchard hacen router.push en la MISMA ruta (sin remontar), así
  // que un efecto mount-only solo respondería al entrar desde otra ruta
  // (p. ej. Observabilidad). Con useSearchParams el deep-link entre parámetros
  // del configurador también enfoca el destino.
  useEffect(() => {
    const fParam = searchParams.get('focus');
    const sParam = searchParams.get('space');
    if (sParam && ['parametros', 'calendario', 'categorias', 'historial'].includes(sParam)) {
      setSpace(sParam as Space);
    } else if (fParam) {
      // Si llega focus sin space, asume el espacio de parámetros del modelo.
      setSpace('parametros');
    }
    if (fParam) setFocusKey(fParam);
  }, [searchParams]);

  const focusPanel = focusKey ? fauchardParamPanel(focusKey) : undefined;

  const spaces = [
    { id: 'parametros', label: 'Parámetros', icon: SlidersHorizontal },
    { id: 'calendario', label: 'Calendario', icon: CalendarDays },
    { id: 'categorias', label: 'Categorías', icon: Trophy },
    { id: 'historial', label: 'Historial', icon: History },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Nav de espacios (pill) */}
      <nav className="flex items-center flex-wrap gap-1 p-1 bg-surface/60 border border-divider/80 rounded-[2.5rem] self-start backdrop-blur-md">
        {spaces.map((s) => {
          const Icon = s.icon;
          const isActive = space === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSpace(s.id as Space)}
              className={`flex items-center gap-3 px-6 py-3 rounded-full transition-all duration-300 relative ${isActive ? 'text-foreground' : 'text-faint hover:text-muted'}`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeSpace"
                  className="absolute inset-0 bg-surface-2 border border-divider rounded-full"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon className={`w-4 h-4 shrink-0 relative z-10 ${isActive ? 'text-primary' : ''}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider relative z-10 whitespace-nowrap">{s.label}</span>
            </button>
          );
        })}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={space}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {/* ── Espacio PARÁMETROS: estudio con laboratorio ── */}
          {space === 'parametros' && (
            <FauchardDraftProvider initialConfig={config}>
              <div className="flex flex-col xl:flex-row gap-8 items-start">
                {/* Controles del modelo (vista compacta apilada) */}
                <div className="flex flex-col gap-6 flex-1 min-w-0 w-full">
                  <div className="bg-surface/20 border border-divider rounded-[2.5rem] p-7 md:p-9 shadow-inner">
                    <FauchardWeightsPanel initialFocusKey={focusPanel === 'weights' ? focusKey : null} />
                  </div>
                  <div className="bg-surface/20 border border-divider rounded-[2.5rem] p-7 md:p-9 shadow-inner">
                    <FauchardFiltersPanel initialFocusKey={focusPanel === 'filters' ? focusKey : null} />
                  </div>
                  {showAvailabilityPanel && (
                    <div className="bg-surface/20 border border-divider rounded-[2.5rem] p-7 md:p-9 shadow-inner">
                      <PlazosYSancionesPanel initialFocusKey={focusPanel === 'plazos' ? focusKey : null} />
                    </div>
                  )}
                </div>

                {/* Laboratorio sticky */}
                <aside className="w-full xl:w-[420px] xl:shrink-0 xl:sticky xl:top-6 self-stretch xl:self-start">
                  <div className="bg-surface/30 border border-divider rounded-[2rem] p-5">
                    <FauchardLabPanel />
                  </div>
                </aside>
              </div>

              <GlobalSaveBar />
            </FauchardDraftProvider>
          )}

          {/* ── Espacios independientes ── */}
          {space === 'calendario' && (
            <div className="bg-surface/20 border border-divider rounded-[3rem] p-8 md:p-10 shadow-inner">
              <FauchardCalendarPanel initialConfig={config} />
            </div>
          )}
          {space === 'categorias' && (
            <div className="bg-surface/20 border border-divider rounded-[3rem] p-8 md:p-10 shadow-inner">
              <LeagueConfigPanel initialConfig={config} />
            </div>
          )}
          {space === 'historial' && (
            <div className="bg-surface/20 border border-divider rounded-[3rem] p-8 md:p-10 shadow-inner">
              <ConfigChangeLog />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
