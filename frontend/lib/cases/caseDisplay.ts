/**
 * Formato de identificadores visibles del caso (DF humano + PAC anónimo).
 */

export function caseNumberLabel(caseNumber?: string | null): string | null {
  const n = String(caseNumber ?? '').trim();
  return n.length > 0 ? n : null;
}

/** Línea estándar: DF-#### antes de PAC (si hay DF). */
export function formatCaseIdAndPac(
  caseNumber?: string | null,
  patientIdAnon?: string | null,
): string {
  const pac = String(patientIdAnon ?? '').trim() || '—';
  const df = caseNumberLabel(caseNumber);
  if (df) return `${df} · PAC: ${pac}`;
  return `PAC: ${pac}`;
}
