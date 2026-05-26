'use client';

import { useCallback, useContext, useEffect, useState } from 'react';
import { ThemeContext, type ThemeMode } from './ThemeContext';
import { updateThemePreferenceAction } from '@/lib/db/actions/userPreferences';

const STORAGE_KEY = 'dfa-theme';

function isValidMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function ThemeProvider({
  initial,
  children,
}: {
  initial: ThemeMode;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<ThemeMode>(initial);

  // Hidratación desde localStorage si difiere del valor SSR (modo offline / cookie ausente)
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached && isValidMode(cached) && cached !== mode) {
        setMode(cached);
      }
    } catch {
      // localStorage no disponible — ignorar
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aplica la clase al <html> según mode (resolviendo system contra matchMedia)
  useEffect(() => {
    const root = document.documentElement;
    const apply = (effective: 'light' | 'dark') => {
      root.classList.remove(effective === 'dark' ? 'light' : 'dark');
      root.classList.add(effective);
    };

    if (mode === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mql.matches ? 'dark' : 'light');
      const onChange = (e: MediaQueryListEvent) =>
        apply(e.matches ? 'dark' : 'light');
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    apply(mode);
  }, [mode]);

  const update = useCallback(async (next: ThemeMode) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignorar
    }
    // Persiste en BD en background; no bloquea la UI.
    void updateThemePreferenceAction(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, setMode: update }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
