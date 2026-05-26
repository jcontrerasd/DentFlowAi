'use client';

import { createContext } from 'react';
import type { ThemeMode } from '@/lib/db/actions/userPreferences';

export type { ThemeMode };

export interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (next: ThemeMode) => Promise<void> | void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
