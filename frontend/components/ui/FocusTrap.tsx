'use client';

import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export default function FocusTrap({
  children,
  active = true,
  onEscape,
}: {
  children: ReactNode;
  active?: boolean;
  onEscape?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Mantener onEscape en un ref para que el handler siempre lea la versión
  // actual sin re-ejecutar el efecto (y re-robar el foco) en cada render.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    // Enfocar el primer elemento focusable al montar
    const focusables = el.querySelectorAll<HTMLElement>(FOCUSABLE);
    focusables[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onEscapeRef.current?.(); return; }
      if (e.key !== 'Tab') return;

      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [active]);

  return <div ref={ref}>{children}</div>;
}
