/** Pesos α activos del score (Σ6 = 1.0): Q/P/E/B suman; L/N restan. */
export const ACTIVE_ALPHA_KEYS = [
  'alphaQuality',
  'alphaPunctuality',
  'alphaExperience',
  'alphaBonus',
  'alphaLoad',
  'alphaNoResponse',
] as const;

type ActiveAlphaKey = (typeof ACTIVE_ALPHA_KEYS)[number];

const NUMERIC_TOLERANCE = 0.001;

export function sumActiveAlphas(weights: Partial<Record<ActiveAlphaKey, number>>): number {
  return ACTIVE_ALPHA_KEYS.reduce((acc, k) => acc + (weights[k] ?? 0), 0);
}

/** Escala proporcionalmente los 6 α para que sumen 1.000 (3 decimales). */
export function renormalizeActiveAlphas(
  weights: Partial<Record<ActiveAlphaKey, number>>,
): Record<ActiveAlphaKey, number> {
  const sum = sumActiveAlphas(weights);
  const out = {} as Record<ActiveAlphaKey, number>;
  if (sum <= NUMERIC_TOLERANCE) {
    for (const k of ACTIVE_ALPHA_KEYS) out[k] = weights[k] ?? 0;
    return out;
  }
  const factor = 1.0 / sum;
  let allocated = 0;
  for (let i = 0; i < ACTIVE_ALPHA_KEYS.length - 1; i++) {
    const k = ACTIVE_ALPHA_KEYS[i];
    out[k] = Math.round((weights[k] ?? 0) * factor * 1000) / 1000;
    allocated += out[k];
  }
  const last = ACTIVE_ALPHA_KEYS[ACTIVE_ALPHA_KEYS.length - 1];
  out[last] = Math.round((1.0 - allocated) * 1000) / 1000;
  return out;
}

export function roundAlphaWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Comparación tolerante para detectar cambios config ↔ payload. */
export function configValuesDiffer(oldValue: unknown, newValue: unknown): boolean {
  const oldNum =
    typeof oldValue === 'number'
      ? oldValue
      : oldValue != null && oldValue !== ''
        ? parseFloat(String(oldValue))
        : NaN;
  const newNum = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));

  if (!isNaN(oldNum) && !isNaN(newNum)) {
    return Math.abs(oldNum - newNum) > NUMERIC_TOLERANCE + 1e-6;
  }
  return oldValue !== newValue;
}

export function isDraftKeyDirty(
  key: string,
  draft: number,
  initial: number,
): boolean {
  return Math.abs(draft - initial) > NUMERIC_TOLERANCE;
}
