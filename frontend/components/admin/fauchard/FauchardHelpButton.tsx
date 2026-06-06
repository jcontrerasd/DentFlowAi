'use client';

import { HelpCircle } from 'lucide-react';

interface FauchardHelpButtonProps {
  onClick: () => void;
  /** Texto accesible: "Abrir ayuda de {label}". */
  label: string;
}

/**
 * Botón "Ayuda" compartido por los paneles Fauchard. Mismo styling primario que
 * el de Pesos del Score; abre la <FauchardHelpWindow> del panel.
 */
export default function FauchardHelpButton({ onClick, label }: FauchardHelpButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Abrir ayuda de ${label}`}
      className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-hl px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-primary shadow-sm transition-all hover:bg-primary hover:text-white hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <HelpCircle className="w-4 h-4" />
      Ayuda
    </button>
  );
}
