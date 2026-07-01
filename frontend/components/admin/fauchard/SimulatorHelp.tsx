'use client';

import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import FauchardHelpWindow from './FauchardHelpWindow';
import { SIMULATOR_HELP } from '@/lib/constants/fauchardHelp';

const OPEN_SIM_HELP = 'simulator-help-open';

/** Abre la ventana de ayuda del simulador (opcionalmente enfocada en un parámetro). */
export function openSimulatorHelp(focusKey?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_SIM_HELP, { detail: focusKey ?? null }));
}

/** Monta la ventana flotante de ayuda; escucha `openSimulatorHelp` desde cualquier ? del panel. */
export function SimulatorHelpHost() {
  const [showHelp, setShowHelp] = useState(false);
  const [helpFocus, setHelpFocus] = useState<string | null>(null);

  const openHelp = (key?: string | null) => {
    setHelpFocus(key ?? null);
    setShowHelp(true);
  };

  useEffect(() => {
    const onOpen = (e: Event) => {
      openHelp((e as CustomEvent<string | null>).detail);
    };
    window.addEventListener(OPEN_SIM_HELP, onOpen);
    return () => window.removeEventListener(OPEN_SIM_HELP, onOpen);
  }, []);

  return (
    <FauchardHelpWindow
      isOpen={showHelp}
      onClose={() => setShowHelp(false)}
      section={SIMULATOR_HELP}
      focusKey={helpFocus}
    />
  );
}

/** Botón "?" compacto junto a un parámetro del simulador. */
export function SimulatorParamHelpButton({ focusKey, label }: { focusKey: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => openSimulatorHelp(focusKey)}
      aria-label={label ? `Abrir ayuda de ${label}` : 'Abrir ayuda del parámetro'}
      className="shrink-0 rounded-lg p-1 text-muted transition-colors hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <HelpCircle className="w-3.5 h-3.5" />
    </button>
  );
}
