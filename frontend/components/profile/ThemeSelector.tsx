'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import type { ThemeMode } from '@/components/theme/ThemeContext';
import { useToast } from '@/context/ToastContext';

interface Option {
  value: ThemeMode;
  label: string;
  desc: string;
  Icon: typeof Sun;
}

const OPTIONS: Option[] = [
  { value: 'light',  label: 'Claro',    desc: 'Fondo claro, alto contraste.',           Icon: Sun },
  { value: 'dark',   label: 'Oscuro',   desc: 'Fondo oscuro, menor fatiga nocturna.',   Icon: Moon },
  { value: 'system', label: 'Sistema',  desc: 'Sigue tu preferencia del sistema operativo.', Icon: Monitor },
];

export default function ThemeSelector() {
  const { mode, setMode } = useTheme();
  const toast = useToast();

  const handle = async (next: ThemeMode) => {
    if (next === mode) return;
    try {
      await setMode(next);
      toast.showSuccess('Apariencia actualizada');
    } catch {
      toast.showError('No se pudo guardar la preferencia');
    }
  };

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = OPTIONS[(idx + 1) % OPTIONS.length];
      handle(next.value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = OPTIONS[(idx - 1 + OPTIONS.length) % OPTIONS.length];
      handle(next.value);
    }
  };

  return (
    <section className="bg-surface border border-divider rounded-lg p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="text-[15px] font-bold text-foreground">Apariencia</h2>
        <p className="text-sm text-muted mt-1">
          Elige cómo se ve DentFlowAi. Tu preferencia se sincroniza en todos tus dispositivos.
        </p>
      </header>

      <div role="radiogroup" aria-label="Tema de la interfaz" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((opt, idx) => {
          const active = mode === opt.value;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => handle(opt.value)}
              onKeyDown={(e) => onKey(e, idx)}
              className={[
                'group text-left p-4 rounded-md border transition-colors duration-150',
                'focus-visible:outline-none focus-visible:shadow-focus',
                active
                  ? 'border-primary bg-primary-hl'
                  : 'border-divider bg-surface-2 hover:border-border hover:bg-surface-off',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${active ? 'text-primary' : 'text-muted'}`} aria-hidden />
                {active && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Activo
                  </span>
                )}
              </div>
              <div className={`text-sm font-semibold ${active ? 'text-foreground' : 'text-foreground'}`}>
                {opt.label}
              </div>
              <div className="text-xs text-muted mt-0.5">{opt.desc}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
