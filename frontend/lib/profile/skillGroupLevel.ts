/** Promedio redondeado de niveles de diseño para el slider grupal (incluye 0). */
export function computeGroupDisplayLevel(levels: number[]): number {
  if (levels.length === 0) return 0;
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  return Math.min(7, Math.max(0, Math.round(avg)));
}

export function snapshotGroupLevels(
  skills: Record<string, number>,
  types: string[],
): Record<string, number> {
  return types.reduce<Record<string, number>>((acc, wt) => {
    acc[wt] = skills[wt] ?? 0;
    return acc;
  }, {});
}
