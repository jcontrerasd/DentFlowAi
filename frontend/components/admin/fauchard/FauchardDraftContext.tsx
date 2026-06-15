'use client';

/**
 * Borrador único de configuración Fauchard (single source of truth).
 *
 * Todos los tabs de edición (Pesos, Selección y Ronda, Plazos y Sanciones)
 * leen y escriben este mismo borrador. El guardado es **uno solo** (barra global)
 * vía copy-on-write. La liga (`l*`) vive en LeagueConfigPanel con guardado autónomo.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { updateFauchardParamsAction } from '@/lib/db/actions/fauchard';

// Claves del borrador = parámetros del modelo de asignación directa (5 factores α + ventanas + plazos).
export const EDITABLE_KEYS = [
  // Pesos del score (Σ5 = 1.0)
  'alphaQuality', 'alphaPunctuality', 'alphaExperience', 'alphaLoad', 'alphaNoResponse',
  // Ventanas del score
  'wQualityDays', 'wLoadDays', 'cMax', 'dBonusMaxDays',
  // Exclusión
  'tCooldownMinutes', 'dInactivityDays',
  // Asignación
  'maxAssignmentAttempts', 'tQuoteMinutes',
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

const ALPHA_KEYS: DraftKey[] = ['alphaQuality', 'alphaPunctuality', 'alphaExperience', 'alphaLoad', 'alphaNoResponse'];

/** Defaults cuando el config activo no trae el campo (p. ej. columna recién migrada). */
const DRAFT_DEFAULTS: Partial<Record<DraftKey, number>> = {
  maxAssignmentAttempts: 3,
  tQuoteMinutes: 30,
  level1Threshold: 1,
  level2Threshold: 2,
  level3Threshold: 3,
};

function toDraft(initialConfig: Record<string, unknown>): Draft {
  const d = {} as Draft;
  for (const k of EDITABLE_KEYS) {
    const v = Number(initialConfig[k]);
    d[k] = Number.isFinite(v) ? v : (DRAFT_DEFAULTS[k] ?? 0);
  }
  return d;
}

/** Invariantes duras: bloquean el guardado. */
export function computeDraftErrors(d: Draft): DraftError[] {
  const errs: DraftError[] = [];
  const sum = ALPHA_KEYS.reduce((acc, k) => acc + d[k], 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    errs.push({ rule: 'weights', message: `Los 5 pesos del score deben sumar 1.000 (suma actual: ${sum.toFixed(3)}).` });
  }
  if (!(d.level1Threshold < d.level2Threshold && d.level2Threshold < d.level3Threshold)) {
    errs.push({ rule: 'thresholds', message: 'Los umbrales de sanción deben cumplir Nivel 1 < Nivel 2 < Nivel 3.' });
  }
  if (!(d.inactivityReminderDays < d.inactivityAutoOffDays)) {
    errs.push({ rule: 'heartbeat', message: 'El recordatorio de actividad debe ser anterior al auto-OFF preventivo.' });
  }
  if (d.maxAssignmentAttempts < 1 || d.maxAssignmentAttempts > 10) {
    errs.push({ rule: 'assignment', message: 'Los intentos máximos de asignación deben estar entre 1 y 10.' });
  }
  return errs;
}

/** Alertas blandas: NO bloquean, solo advierten (dependencias). */
export function computeDraftWarnings(d: Draft): DraftError[] {
  const warns: DraftError[] = [];
  if (d.tCooldownMinutes > d.tQuoteMinutes * 4) {
    warns.push({ rule: 'cooldown', message: 'El cooldown es muy alto respecto al tiempo de respuesta: puede dejar sin técnicos elegibles.' });
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
        const keysToSave = new Set<DraftKey>(dirtyKeys);
        // Si cambió un α, el servidor exige Σ5 = 1.0 → enviar los cinco.
        if (dirtyKeys.some((k) => ALPHA_KEYS.includes(k))) {
          for (const k of ALPHA_KEYS) keysToSave.add(k);
        }
        const payload = Object.fromEntries([...keysToSave].map((k) => [k, draft[k]]));
        const res = await updateFauchardParamsAction(payload, reason);
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
    [draft, dirtyKeys],
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
