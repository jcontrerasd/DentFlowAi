'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Resalte temporal de controles de parámetro (Sliders) cuando el admin pulsa un
 * KPI del laboratorio: el KPI difunde qué parámetros lo afectan y los controles
 * correspondientes se "iluminan" unos segundos. Coordinación vía CustomEvent en
 * `window` para no acoplar el laboratorio (sticky) con los paneles editores.
 */
const PARAM_FLASH_EVENT = 'fauchard-param-flash';

/** Duración del resalte, en ms. */
export const PARAM_FLASH_MS = 3000;

/** Difunde qué parámetros deben resaltarse. Lo escuchan los Sliders de los paneles. */
export function flashParams(keys: string[]) {
  if (typeof window === 'undefined' || keys.length === 0) return;
  window.dispatchEvent(new CustomEvent(PARAM_FLASH_EVENT, { detail: keys }));
}

/**
 * Garantiza un único `scrollIntoView` por ráfaga de resalte: el primer control
 * (el más arriba en el árbol) lo reclama; el resto solo se ilumina sin mover el
 * scroll. Se reinicia tras una breve ventana, así un nuevo KPI vuelve a scrollear.
 */
let lastScrollClaim = 0;
export function claimFlashScroll(): boolean {
  const now = Date.now();
  if (now - lastScrollClaim < 400) return false;
  lastScrollClaim = now;
  return true;
}

/** Set de claves de parámetro actualmente resaltadas; se limpia solo tras PARAM_FLASH_MS. */
export function useFlashedParams(): Set<string> {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onFlash = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!Array.isArray(detail)) return;
      setKeys(new Set(detail as string[]));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setKeys(new Set()), PARAM_FLASH_MS);
    };
    window.addEventListener(PARAM_FLASH_EVENT, onFlash);
    return () => {
      window.removeEventListener(PARAM_FLASH_EVENT, onFlash);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return keys;
}
