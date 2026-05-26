/**
 * Texto de instrucciones al crear/editar el caso (no comentarios de revisión).
 * `special_instructions` es la fuente canónica; `doctor_notes` queda como respaldo legacy.
 */
export function creationInstructionsText(caseLike: {
  specialInstructions?: string | null;
  doctorNotes?: string | null;
}): string {
  const raw = caseLike.specialInstructions ?? caseLike.doctorNotes;
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Comentario de la última entrega marcada rechazada con texto de revisión (orden por versión descendente). */
export function latestRejectedDeliveryReviewComment(
  deliveries:
    | Array<{ status?: string | null; reviewComment?: string | null; version?: number | null }>
    | null
    | undefined,
): string | null {
  if (!deliveries?.length) return null;
  const sorted = [...deliveries].sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  for (const d of sorted) {
    if (d.status !== 'rejected') continue;
    const c = d.reviewComment;
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}
