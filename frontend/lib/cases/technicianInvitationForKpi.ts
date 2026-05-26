import type { InvitationStatusForKpi } from '@/lib/dashboard/classifyCaseForDashboardKpi';

export type InvitationRowForKpi = {
  status: string;
  updatedAt?: Date | string | null;
  invitedAt?: Date | string | null;
};

function rowTimestamp(row: InvitationRowForKpi): number {
  const raw = row.updatedAt ?? row.invitedAt;
  if (!raw) return 0;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Status de la invitación representativa del técnico: fila con `updated_at` más reciente
 * (misma regla que `latestInvitationMatchesSubquery` en listados y filtros SQL).
 */
export function pickInvitationStatusForKpi(
  rows: InvitationRowForKpi[],
): InvitationStatusForKpi {
  if (!rows.length) return null;

  const sorted = [...rows].sort((a, b) => rowTimestamp(b) - rowTimestamp(a));
  return (sorted[0]?.status ?? null) as InvitationStatusForKpi;
}

/** Agrupa invitaciones por caso y devuelve status representativo por caseId. */
export function buildInvitationStatusByCaseId(
  rows: Array<{ clinicalCaseId: string; status: string; updatedAt?: Date | null; invitedAt?: Date | null }>,
): Map<string, InvitationStatusForKpi> {
  const byCase = new Map<string, InvitationRowForKpi[]>();
  for (const row of rows) {
    const list = byCase.get(row.clinicalCaseId) ?? [];
    list.push({
      status: row.status,
      updatedAt: row.updatedAt,
      invitedAt: row.invitedAt,
    });
    byCase.set(row.clinicalCaseId, list);
  }

  const result = new Map<string, InvitationStatusForKpi>();
  for (const [caseId, invRows] of byCase) {
    result.set(caseId, pickInvitationStatusForKpi(invRows));
  }
  return result;
}
