/** Datos normalizados para mostrar una oferta (total plano, solo_diseno). */
export type UchQuoteDisplay = {
  totalPrice: number | null;
  totalDays: number | null;
  /** v4.6 — total en horas si la oferta es en horas (mutuamente excluyente con totalDays). */
  totalHours?: number | null;
  techNotes?: string | null;
};

/**
 * v4.6 — Formatea un plazo expresado en días y/u horas como texto humano.
 * Reglas:
 * - Solo días: "1 día hábil" / "N días hábiles".
 * - Solo horas: "1 hora" / "N horas".
 * - Ambos (caso raro, slot mixto sumado): "N días hábiles · M horas".
 * - Nada poblado: "—".
 */
export function formatTurnaround(t: { days?: number | null; hours?: number | null }): string {
  const d = t.days != null && t.days > 0 ? Math.trunc(t.days) : 0;
  const h = t.hours != null && t.hours > 0 ? Math.trunc(t.hours) : 0;
  if (d === 0 && h === 0) return '—';
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} ${d === 1 ? 'día hábil' : 'días hábiles'}`);
  if (h > 0) parts.push(`${h} ${h === 1 ? 'hora' : 'horas'}`);
  return parts.join(' · ');
}

/** Parsea horas (1..24) desde cualquier input. */
export function parseQuotePositiveHours(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 24) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Math.trunc(Number(v));
    if (Number.isFinite(n) && n >= 1 && n <= 24) return n;
  }
  return null;
}

export function formatUchQuoteClp(n: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(n);
}

export function parseQuoteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

export function parseQuotePositiveDays(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Math.trunc(Number(v));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function quoteDisplayFromPayload(raw: Record<string, unknown>): UchQuoteDisplay {
  return {
    totalPrice: parseQuoteNumber(raw.quotedPrice),
    totalDays: parseQuotePositiveDays(raw.quotedDays),
    totalHours: parseQuotePositiveHours(raw.quotedHours),
    techNotes: typeof raw.techNotes === 'string' ? raw.techNotes.trim() : null,
  };
}

export function quoteDisplayFromInvitation(inv: {
  quotedPrice?: number | null;
  quotedDays?: number | null;
  quotedHours?: number | null;
  techNotes?: string | null;
}): UchQuoteDisplay {
  return {
    totalPrice: inv.quotedPrice ?? null,
    totalDays: inv.quotedDays ?? null,
    totalHours: inv.quotedHours ?? null,
    techNotes: inv.techNotes?.trim() ? inv.techNotes.trim() : null,
  };
}

export function quoteDisplayFromComparativeOffer(o: {
  totalPriceCLP: number;
  quotedDays: number | null;
  quotedHours?: number | null;
  techNotes?: string | null;
}): UchQuoteDisplay {
  return {
    totalPrice: o.totalPriceCLP,
    totalDays: o.quotedDays,
    totalHours: o.quotedHours ?? null,
    techNotes: o.techNotes?.trim() ? o.techNotes.trim() : null,
  };
}
