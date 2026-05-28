/** Datos normalizados para mostrar una oferta (total ± desglose integral ± flete). */
export type UchQuoteDisplay = {
  totalPrice: number | null;
  totalDays: number | null;
  /** v4.6 — total en horas si la oferta es en horas (mutuamente excluyente con totalDays). */
  totalHours?: number | null;
  designPrice?: number | null;
  designDays?: number | null;
  designHours?: number | null;
  fabricationPrice?: number | null;
  fabricationDays?: number | null;
  fabricationHours?: number | null;
  /** Flete (v4.4): solo presente cuando el caso tiene fabricación. Sin fee de plataforma. */
  shippingPrice?: number | null;
  shippingDays?: number | null;
  shippingHours?: number | null;
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

export function hasIntegralBreakdown(q: UchQuoteDisplay): boolean {
  return q.designPrice != null || q.fabricationPrice != null;
}

/** True si la oferta tiene un ítem de flete que debe mostrarse aparte. */
export function hasShippingLine(q: UchQuoteDisplay): boolean {
  return q.shippingPrice != null;
}

// Shipping puede ser 0, así que NO usamos parseQuotePositiveDays para los días.
function parseQuoteNonNegativeDays(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Math.trunc(Number(v));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

export function quoteDisplayFromPayload(raw: Record<string, unknown>): UchQuoteDisplay {
  return {
    totalPrice: parseQuoteNumber(raw.quotedPrice),
    totalDays: parseQuotePositiveDays(raw.quotedDays),
    totalHours: parseQuotePositiveHours(raw.quotedHours),
    designPrice: parseQuoteNumber(raw.quotedDesignPrice),
    designDays: parseQuotePositiveDays(raw.quotedDesignDays),
    designHours: parseQuotePositiveHours(raw.quotedDesignHours),
    fabricationPrice: parseQuoteNumber(raw.quotedFabricationPrice),
    fabricationDays: parseQuotePositiveDays(raw.quotedFabricationDays),
    fabricationHours: parseQuotePositiveHours(raw.quotedFabricationHours),
    shippingPrice: parseQuoteNumber(raw.quotedShippingPrice),
    shippingDays: parseQuoteNonNegativeDays(raw.quotedShippingDays),
    shippingHours: parseQuotePositiveHours(raw.quotedShippingHours),
    techNotes: typeof raw.techNotes === 'string' ? raw.techNotes.trim() : null,
  };
}

export function quoteDisplayFromInvitation(inv: {
  quotedPrice?: number | null;
  quotedDays?: number | null;
  quotedHours?: number | null;
  quotedDesignPrice?: number | null;
  quotedDesignDays?: number | null;
  quotedDesignHours?: number | null;
  quotedFabricationPrice?: number | null;
  quotedFabricationDays?: number | null;
  quotedFabricationHours?: number | null;
  quotedShippingPrice?: number | null;
  quotedShippingDays?: number | null;
  quotedShippingHours?: number | null;
  techNotes?: string | null;
}): UchQuoteDisplay {
  return {
    totalPrice: inv.quotedPrice ?? null,
    totalDays: inv.quotedDays ?? null,
    totalHours: inv.quotedHours ?? null,
    designPrice: inv.quotedDesignPrice ?? null,
    designDays: inv.quotedDesignDays ?? null,
    designHours: inv.quotedDesignHours ?? null,
    fabricationPrice: inv.quotedFabricationPrice ?? null,
    fabricationDays: inv.quotedFabricationDays ?? null,
    fabricationHours: inv.quotedFabricationHours ?? null,
    shippingPrice: inv.quotedShippingPrice ?? null,
    shippingDays: inv.quotedShippingDays ?? null,
    shippingHours: inv.quotedShippingHours ?? null,
    techNotes: inv.techNotes?.trim() ? inv.techNotes.trim() : null,
  };
}

export function quoteDisplayFromComparativeOffer(o: {
  totalPriceCLP: number;
  quotedDays: number | null;
  quotedHours?: number | null;
  designPriceCLP?: number | null;
  designDays?: number | null;
  designHours?: number | null;
  fabricationPriceCLP?: number | null;
  fabricationDays?: number | null;
  fabricationHours?: number | null;
  shippingPriceCLP?: number | null;
  shippingDays?: number | null;
  shippingHours?: number | null;
  techNotes?: string | null;
}): UchQuoteDisplay {
  return {
    totalPrice: o.totalPriceCLP,
    totalDays: o.quotedDays,
    totalHours: o.quotedHours ?? null,
    designPrice: o.designPriceCLP ?? null,
    designDays: o.designDays ?? null,
    designHours: o.designHours ?? null,
    fabricationPrice: o.fabricationPriceCLP ?? null,
    fabricationDays: o.fabricationDays ?? null,
    fabricationHours: o.fabricationHours ?? null,
    shippingPrice: o.shippingPriceCLP ?? null,
    shippingDays: o.shippingDays ?? null,
    shippingHours: o.shippingHours ?? null,
    techNotes: o.techNotes?.trim() ? o.techNotes.trim() : null,
  };
}
