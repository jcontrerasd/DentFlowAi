import { describe, it, expect } from 'vitest';

/** Agregación pura espejando getFauchardMetricsAction (sin DB). */
function aggregateAssignmentMetrics(
  rows: { technicianId: string; status: string; compensation?: number; assignedAt: Date; respondedAt?: Date }[],
) {
  const byTech: Record<string, { assignmentsCount: number; respondedCount: number; acceptedCount: number; rejectedCount: number; expiredCount: number }> = {};

  for (const r of rows) {
    if (!byTech[r.technicianId]) {
      byTech[r.technicianId] = { assignmentsCount: 0, respondedCount: 0, acceptedCount: 0, rejectedCount: 0, expiredCount: 0 };
    }
    const t = byTech[r.technicianId];
    t.assignmentsCount++;
    if (r.status === 'accepted' || r.status === 'rejected') t.respondedCount++;
    if (r.status === 'accepted') t.acceptedCount++;
    if (r.status === 'rejected') t.rejectedCount++;
    if (r.status === 'expired') t.expiredCount++;
  }

  const totals = Object.values(byTech).reduce(
    (acc, t) => ({
      assignments: acc.assignments + t.assignmentsCount,
      responded: acc.responded + t.respondedCount,
      accepted: acc.accepted + t.acceptedCount,
      rejected: acc.rejected + t.rejectedCount,
      expired: acc.expired + t.expiredCount,
    }),
    { assignments: 0, responded: 0, accepted: 0, rejected: 0, expired: 0 },
  );

  return {
    byTech,
    technicianResponseRate: totals.assignments > 0 ? totals.responded / totals.assignments : 0,
    technicianAcceptanceRate:
      totals.accepted + totals.rejected > 0 ? totals.accepted / (totals.accepted + totals.rejected) : 0,
  };
}

describe('fauchard assignment metrics aggregation', () => {
  const base = new Date('2025-01-01');

  it('cuenta pending/accepted/rejected/expired', () => {
    const rows = [
      { technicianId: 't1', status: 'pending', assignedAt: base },
      { technicianId: 't1', status: 'accepted', assignedAt: base, respondedAt: new Date('2025-01-01T01:00:00') },
      { technicianId: 't1', status: 'rejected', assignedAt: base, respondedAt: new Date('2025-01-01T02:00:00') },
      { technicianId: 't2', status: 'expired', assignedAt: base },
    ];
    const m = aggregateAssignmentMetrics(rows);
    expect(m.byTech.t1.assignmentsCount).toBe(3);
    expect(m.byTech.t1.respondedCount).toBe(2);
    expect(m.byTech.t1.acceptedCount).toBe(1);
    expect(m.byTech.t2.expiredCount).toBe(1);
    expect(m.technicianResponseRate).toBeCloseTo(0.5);
    expect(m.technicianAcceptanceRate).toBeCloseTo(0.5);
  });
});
