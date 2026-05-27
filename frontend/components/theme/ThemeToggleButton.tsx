'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { ThemeMode } from '@/components/theme/ThemeContext';

const ORDER: ThemeMode[] = ['light', 'dark', 'system'];

const META: Record<ThemeMode, { Icon: typeof Sun; label: string; next: string }> = {
  light:  { Icon: Sun,     label: 'Tema claro',   next: 'Cambiar a oscuro' },
  dark:   { Icon: Moon,    label: 'Tema oscuro',  next: 'Cambiar a sistema' },
  system: { Icon: Monitor, label: 'Tema sistema', next: 'Cambiar a claro' },
};

export default function ThemeToggleButton() {
  const { mode, setMode } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Evitar mismatch SSR: el botón muestra placeholder hasta hidratar
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Cargando tema"
        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-surface-2 border border-divider text-faint"
      >
        <Sun className="w-5 h-5 opacity-40" />
      </button>
    );
  }

  const { Icon, label, next } = META[mode];

  const cycle = () => {
    const idx = ORDER.indexOf(mode);
    setMode(ORDER[(idx + 1) % ORDER.length]);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${label}. Click para ${next.toLowerCase()}.`}
      title={`${label} — click para alternar`}
      className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-surface-2 border border-divider text-muted hover:bg-surface-off hover:text-foreground hover:border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}
