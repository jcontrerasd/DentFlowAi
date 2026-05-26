/** Datos normalizados para mostrar una oferta (total ± desglose integral). */
export type UchQuoteDisplay = {
  totalPrice: number | null;
  totalDays: number | null;
  designPrice?: number | null;
  designDays?: number | null;
  fabricationPrice?: number | null;
  fabricationDays?: number | null;
  techNotes?: string | null;
};

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

export function quoteDisplayFromPayload(raw: Record<string, unknown>): UchQuoteDisplay {
  return {
    totalPrice: parseQuoteNumber(raw.quotedPrice),
    totalDays: parseQuotePositiveDays(raw.quotedDays),
    designPrice: parseQuoteNumber(raw.quotedDesignPrice),
    designDays: parseQuotePositiveDays(raw.quotedDesignDays),
    fabricationPrice: parseQuoteNumber(raw.quotedFabricationPrice),
    fabricationDays: parseQuotePositiveDays(raw.quotedFabricationDays),
    techNotes: typeof raw.techNotes === 'string' ? raw.techNotes.trim() : null,
  };
}

export function quoteDisplayFromInvitation(inv: {
  quotedPrice?: number | null;
  quotedDays?: number | null;
  quotedDesignPrice?: number | null;
  quotedDesignDays?: number | null;
  quotedFabricationPrice?: number | null;
  quotedFabricationDays?: number | null;
  techNotes?: string | null;
}): UchQuoteDisplay {
  return {
    totalPrice: inv.quotedPrice ?? null,
    totalDays: inv.quotedDays ?? null,
    designPrice: inv.quotedDesignPrice ?? null,
    designDays: inv.quotedDesignDays ?? null,
    fabricationPrice: inv.quotedFabricationPrice ?? null,
    fabricationDays: inv.quotedFabricationDays ?? null,
    techNotes: inv.techNotes?.trim() ? inv.techNotes.trim() : null,
  };
}

export function quoteDisplayFromComparativeOffer(o: {
  totalPriceCLP: number;
  quotedDays: number;
  designPriceCLP?: number | null;
  designDays?: number | null;
  fabricationPriceCLP?: number | null;
  fabricationDays?: number | null;
  techNotes?: string | null;
}): UchQuoteDisplay {
  return {
    totalPrice: o.totalPriceCLP,
    totalDays: o.quotedDays,
    designPrice: o.designPriceCLP ?? null,
    designDays: o.designDays ?? null,
    fabricationPrice: o.fabricationPriceCLP ?? null,
    fabricationDays: o.fabricationDays ?? null,
    techNotes: o.techNotes?.trim() ? o.techNotes.trim() : null,
  };
}
