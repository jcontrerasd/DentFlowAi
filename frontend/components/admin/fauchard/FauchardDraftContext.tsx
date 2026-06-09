'use client';

/**
 * Borrador único de configuración Fauchard (single source of truth).
 *
 * Todos los tabs de edición (Pesos, Selección y Ronda, Plazos y Sanciones,
 * Calendario, Liga) leen y escriben este mismo borrador en vez de mantener su
 * propio `useState`. El guardado es **uno solo** (barra global) vía copy-on-write,
 * lo que elimina por construcción el lost-update entre secciones.
 *
 * Nota: `nFloor` queda reservado (sin editor). Los feriados (`fauchard_holiday`)
 * NO viven aquí: tienen su propia tabla y CRUD en FauchardCalendarPanel.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';

// Claves del borrador = SOLO parámetros del modelo (los que afectan score/selección
// y alimentan el laboratorio). El calendario laboral (`business*` + feriados) y la
// liga (`l*`) viven en sus propios espacios independientes, con guardado autónomo;
// `nFloor` queda reservado.
export const EDITABLE_KEYS = [
  // Pesos del score (Σ6 = 1.0)
  'alphaQuality', 'alphaPunctuality', 'alphaExperience', 'alphaLoad', 'alphaBonus', 'alphaNoResponse',
  // Ventanas del score
  'wQualityDays', 'wLoadDays', 'cMax', 'dBonusMaxDays',
  // Exclusión
  'tCooldownMinutes', 'dInactivityDays',
  // Selección
  'nInvited', 'qMinSelection',
  // Cotización / propuesta
  'tQuoteMinutes', 'tProposalHours',
  // Fee
  'platformFee',
  // v5.0 — plazos
  'tDentistReviewHours', 'tNoEligiblePoolHours', 'maxPoolCycles', 'replacementCutoffMinutes',
  // v5.0 — sanción rolling
  'noResponseWindowDays', 'noResponseRehabilitationDays', 'level1Threshold', 'level2Threshold', 'level3Threshold',
  // v5.0 — heartbeat
  'inactivityAutoOffDays', 'inactivityReminderDays',
] as const;

export type DraftKey = (typeof EDITABLE_KEYS)[number];
export type Draft = Record<DraftKey, number>;

export type DraftError = { rule: string; message: string };

const ALPHA_KEYS: DraftKey[] = ['alphaQuality', 'alphaPunctuality', 'alphaExperience', 'alphaLoad', 'alphaBonus', 'alphaNoResponse'];

function toDraft(initialConfig: Record<string, unknown>): Draft {
  const d = {} as Draft;
  for (const k of EDITABLE_KEYS) {
    const v = Number(initialConfig[k]);
    d[k] = Number.isFinite(v) ? v : 0;
  }
  return d;
}

/** Invariantes duras: bloquean el guardado. */
export function computeDraftErrors(d: Draft): DraftError[] {
  const errs: DraftError[] = [];
  const sum = ALPHA_KEYS.reduce((acc, k) => acc + d[k], 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    errs.push({ rule: 'weights', message: `Los 6 pesos del score deben sumar 1.000 (suma actual: ${sum.toFixed(3)}).` });
  }
  if (!(d.level1Threshold < d.level2Threshold && d.level2Threshold < d.level3Threshold)) {
    errs.push({ rule: 'thresholds', message: 'Los umbrales de sanción deben cumplir Nivel 1 < Nivel 2 < Nivel 3.' });
  }
  if (!(d.inactivityReminderDays < d.inactivityAutoOffDays)) {
    errs.push({ rule: 'heartbeat', message: 'El recordatorio de actividad debe ser anterior al auto-OFF preventivo.' });
  }
  return errs;
}

/** Alertas blandas: NO bloquean, solo advierten (dependencias). */
export function computeDraftWarnings(d: Draft): DraftError[] {
  const warns: DraftError[] = [];
  if (d.tCooldownMinutes > d.tQuoteMinutes * 4) {
    warns.push({ rule: 'cooldown', message: 'El cooldown es muy alto respecto al tiempo de cotización: puede dejar la ronda sin técnicos.' });
  }
  return warns;
}

interface DraftContextValue {
  draft: Draft;
  initial: Draft;
  setParam: (key: DraftKey, value: number) => void;
  dirtyKeys: DraftKey[];
  isDirty: boolean;
  errors: DraftError[];
  warnings: DraftError[];
  isValid: boolean;
  reset: () => void;
  saving: boolean;
  save: (reason: string) => Promise<{ success: boolean; error?: string }>;
}

const FauchardDraftContext = createContext<DraftContextValue | null>(null);

export function FauchardDraftProvider({
  initialConfig,
  children,
}: {
  initialConfig: Record<string, unknown>;
  children: ReactNode;
}) {
  const [initial, setInitial] = useState<Draft>(() => toDraft(initialConfig));
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialConfig));
  const [saving, setSaving] = useState(false);

  const setParam = useCallback((key: DraftKey, value: number) => {
    setDraft((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setDraft(initial), [initial]);

  const dirtyKeys = useMemo(
    () => EDITABLE_KEYS.filter((k) => draft[k] !== initial[k]),
    [draft, initial],
  );

  const errors = useMemo(() => computeDraftErrors(draft), [draft]);
  const warnings = useMemo(() => computeDraftWarnings(draft), [draft]);

  const save = useCallback(
    async (reason: string) => {
      setSaving(true);
      try {
        const res = await updateFauchardParamsAction(draft as Record<string, number>, reason);
        if (res.success) {
          setInitial(draft);
          return { success: true };
        }
        return { success: false, error: 'error' in res ? res.error : 'Error al guardar.' };
      } catch {
        return { success: false, error: 'Error de red al guardar.' };
      } finally {
        setSaving(false);
      }
    },
    [draft],
  );

  const value: DraftContextValue = {
    draft,
    initial,
    setParam,
    dirtyKeys,
    isDirty: dirtyKeys.length > 0,
    errors,
    warnings,
    isValid: errors.length === 0,
    reset,
    saving,
    save,
  };

  return <FauchardDraftContext.Provider value={value}>{children}</FauchardDraftContext.Provider>;
}

export function useFauchardDraft(): DraftContextValue {
  const ctx = useContext(FauchardDraftContext);
  if (!ctx) throw new Error('useFauchardDraft debe usarse dentro de <FauchardDraftProvider>');
  return ctx;
}
