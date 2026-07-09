'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, History, Trophy, Layers } from 'lucide-react';
import { fauchardParamPanel } from '@/lib/constants/fauchardHelp';
import FauchardWeightsPanel from '@/components/admin/fauchard/FauchardWeightsPanel';
import FauchardFiltersPanel from '@/components/admin/fauchard/FauchardFiltersPanel';
import ConfigChangeLog from '@/components/admin/fauchard/ConfigChangeLog';
import PlazosYSancionesPanel from '@/components/admin/fauchard/PlazosYSancionesPanel';
import LeagueConfigPanel from '@/components/admin/fauchard/LeagueConfigPanel';
import FauchardLabPanel from '@/components/admin/fauchard/FauchardLabPanel';
import GlobalSaveBar from '@/components/admin/fauchard/GlobalSaveBar';
import { FauchardDraftProvider } from '@/components/admin/fauchard/FauchardDraftContext';
import VersionHistoryClient from '@/components/admin/fauchard/VersionHistoryClient';
import { motion, AnimatePresence } from 'framer-motion';
import type { ConfigVersionMeta, ConfigVersionKpis } from '@/lib/db/actions/fauchard';

type Space = 'parametros' | 'categorias' | 'historial' | 'versiones';

export function TabClient({
  config,
  versions = [],
  initialKpisCache = {},
  isSystemAdmin = false,
}: {
  config: any;
  versions?: ConfigVersionMeta[];
  initialKpisCache?: Record<string, ConfigVersionKpis>;
  isSystemAdmin?: boolean;
}) {
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
    if (sParam && ['parametros', 'categorias', 'historial', 'versiones'].includes(sParam)) {
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
    { id: 'categorias', label: 'Categorías', icon: Trophy },
    { id: 'historial', label: 'Historial', icon: History },
    { id: 'versiones', label: 'Versiones', icon: Layers },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Nav de espacios (pill) */}
      <nav className="flex items-center flex-wrap gap-0.5 p-0.5 bg-surface/60 border border-divider/80 rounded-2xl self-start backdrop-blur-md">
        {spaces.map((s) => {
          const Icon = s.icon;
          const isActive = space === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSpace(s.id as Space)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 relative ${isActive ? 'text-foreground' : 'text-faint hover:text-muted'}`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeSpace"
                  className="absolute inset-0 bg-surface-2 border border-divider rounded-full"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon className={`w-3.5 h-3.5 shrink-0 relative z-10 ${isActive ? 'text-primary' : ''}`} />
              <span className="text-[9px] font-bold uppercase tracking-wider relative z-10 whitespace-nowrap">{s.label}</span>
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
              <div className="flex flex-col xl:flex-row gap-3 items-start">
                <div className="flex flex-col gap-3 flex-1 min-w-0 w-full">
                  <div className="bg-surface/20 border border-divider rounded-2xl p-4 md:p-5 shadow-inner">
                    <FauchardWeightsPanel initialFocusKey={focusPanel === 'weights' ? focusKey : null} />
                  </div>
                  <div className="bg-surface/20 border border-divider rounded-2xl p-4 md:p-5 shadow-inner">
                    <FauchardFiltersPanel initialFocusKey={focusPanel === 'filters' ? focusKey : null} />
                  </div>
                  <div className="bg-surface/20 border border-divider rounded-2xl p-4 md:p-5 shadow-inner">
                    <PlazosYSancionesPanel initialFocusKey={focusPanel === 'plazos' ? focusKey : null} />
                  </div>
                </div>

                <aside className="w-full xl:w-[min(360px,32%)] xl:shrink-0 xl:sticky xl:top-3 self-stretch xl:self-start">
                  <div className="bg-surface/30 border border-divider rounded-xl p-3">
                    <FauchardLabPanel />
                  </div>
                </aside>
              </div>

              <GlobalSaveBar />
            </FauchardDraftProvider>
          )}

          {space === 'categorias' && (
            <div className="bg-surface/20 border border-divider rounded-2xl p-4 md:p-5 shadow-inner">
              <LeagueConfigPanel initialConfig={config} />
            </div>
          )}
          {space === 'historial' && (
            <div className="bg-surface/20 border border-divider rounded-2xl p-4 md:p-5 shadow-inner">
              <ConfigChangeLog />
            </div>
          )}
          {space === 'versiones' && (
            <div className="bg-surface/20 border border-divider rounded-2xl shadow-inner overflow-hidden">
              <VersionHistoryClient versions={versions} activeConfig={config} initialKpisCache={initialKpisCache} isSystemAdmin={isSystemAdmin} />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
