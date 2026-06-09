'use client';

import { useState } from 'react';
import { Angry, Frown, Meh, Smile, Laugh } from 'lucide-react';

interface RatingScaleProps {
  /** Valor seleccionado (1–5). 0 = sin selección. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * Selector de calificación con caras emotivas (1–5).
 * De enojada (muy malo) a muy feliz (excelente). Mapea limpio a entero 1–5.
 * Accesible por teclado: cada cara es un botón con foco visible.
 */
const FACES = [
  { value: 1, Icon: Angry, label: 'Muy malo', color: 'text-error', ring: 'ring-error/40' },
  { value: 2, Icon: Frown, label: 'Malo', color: 'text-warning', ring: 'ring-warning/40' },
  { value: 3, Icon: Meh, label: 'Regular', color: 'text-faint', ring: 'ring-faint/40' },
  { value: 4, Icon: Smile, label: 'Bueno', color: 'text-primary', ring: 'ring-primary/40' },
  { value: 5, Icon: Laugh, label: 'Excelente', color: 'text-primary', ring: 'ring-primary/40' },
] as const;

export default function RatingScale({ value, onChange, disabled = false }: RatingScaleProps) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;
  const activeFace = FACES.find((f) => f.value === active);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2" onMouseLeave={() => setHovered(0)}>
        {FACES.map(({ value: v, Icon, label, color, ring }) => {
          const isActive = active === v;
          return (
            <button
              key={v}
              type="button"
              disabled={disabled}
              aria-label={`${v} de 5 — ${label}`}
              aria-pressed={value === v}
              onMouseEnter={() => setHovered(v)}
              onFocus={() => setHovered(v)}
              onBlur={() => setHovered(0)}
              onClick={() => onChange(v)}
              className={`
                rounded-2xl p-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 ${ring}
                disabled:opacity-50 disabled:pointer-events-none
                ${isActive ? `${color} scale-110 bg-white/5` : 'text-faint/50 hover:text-faint'}
              `}
            >
              <Icon className="w-8 h-8" strokeWidth={isActive ? 2.2 : 1.8} />
            </button>
          );
        })}
      </div>
      <span className={`text-xs font-bold h-4 ${activeFace ? activeFace.color : 'text-transparent'}`}>
        {activeFace?.label ?? '·'}
      </span>
    </div>
  );
}
