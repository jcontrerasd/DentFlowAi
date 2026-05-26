/** FK o relación Drizzle: comparar siempre como string para ganador/perdedor y UCH. */
export function normalizedAssignedTechnicianId(
  clinicalCase: { assignedTechnicianId?: unknown } | null | undefined,
): string | null {
  const raw = clinicalCase?.assignedTechnicianId;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && raw !== null && 'id' in (raw as Record<string, unknown>)) {
    const id = (raw as { id: unknown }).id;
    if (id == null || id === '') return null;
    return String(id);
  }
  return String(raw);
}
