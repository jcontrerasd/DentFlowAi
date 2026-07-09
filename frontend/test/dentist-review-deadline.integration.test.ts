/**
 * Integración BD — countdown de revisión del dentista (v5.0/v5.2, H2/§4.2).
 * Requiere RUN_DB_INTEGRATION_TESTS=true. Mockea notifyUser.
 *
 * Cubre getCaseReviewDeadlineAt + escalación (recordatorio ≤25%, vencido) idempotente.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn(async () => ({ success: true })),
}));

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { getCaseReviewDeadlineAt } from '@/lib/db/caseDeadlines';
import { processDentistReviewDeadlinesAction } from '@/lib/db/actions/dentistReviewCron';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000008008aa';
const CASE = '00000000-0000-0000-0000-0000008008bb';
const DOCTOR = 'test-review-doctor';

async function setSubmitted(hoursAgo: number) {
  const at = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  await db.execute(sql`UPDATE clinical_case SET status='enRevision', last_revision_submitted_at=${at},
    review_reminder_sent_at=NULL, review_overdue_notified_at=NULL WHERE id=${CASE}`);
}
async function getRow() {
  const [r]: any = await db.execute(sql`SELECT review_reminder_sent_at, review_overdue_notified_at FROM clinical_case WHERE id=${CASE}`);
  return r;
}

describe.runIf(runIntegration)('countdown revisión dentista (H2)', () => {

  beforeAll(async () => {
    await ensureInfrastructure(db);
    // Asegura tDentistReviewHours=48 en la config activa para aritmética determinista.
    await db.execute(sql`UPDATE fauchard_config SET t_dentist_review_hours=48 WHERE is_active=true`);
    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'Rev Org','rut-rev','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR+'@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    await db.execute(sql`INSERT INTO clinical_case (id,organization_id,doctor_id,internal_name,needs_fabrication,status,urgency_id)
      VALUES (${CASE},${ORG},${DOCTOR},'Rev Case',false,'enRevision',${u.id}) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM clinical_case WHERE id=${CASE}`);
    await db.execute(sql`DELETE FROM "user" WHERE id=${DOCTOR}`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
  });

  it('getCaseReviewDeadlineAt = última entrega + tDentistReviewHours', async () => {
    await setSubmitted(10);
    const deadline = await getCaseReviewDeadlineAt(CASE);
    expect(deadline).toBeInstanceOf(Date);
    // 48h de plazo, entregado hace 10h → faltan ~38h (positivo y < 48h).
    const remainingH = (deadline!.getTime() - Date.now()) / 3_600_000;
    expect(remainingH).toBeGreaterThan(37);
    expect(remainingH).toBeLessThan(39);
  });

  it('recordatorio cuando queda ≤25% del plazo, idempotente', async () => {
    // 48h plazo, 25% = 12h. Entregado hace 40h → faltan 8h ≤ 12h → recordatorio.
    await setSubmitted(40);
    const r1 = await processDentistReviewDeadlinesAction();
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.remindersSent).toBeGreaterThanOrEqual(1);
    const after = await getRow();
    expect(after.review_reminder_sent_at).not.toBeNull();
    expect(after.review_overdue_notified_at).toBeNull();

    // Segunda corrida: no re-envía.
    const r2 = await processDentistReviewDeadlinesAction();
    if (r2.success) expect(r2.remindersSent).toBe(0);
  });

  it('aviso de vencido una sola vez', async () => {
    await setSubmitted(50); // > 48h → vencido
    const r1 = await processDentistReviewDeadlinesAction();
    if (r1.success) expect(r1.overdueNotified).toBeGreaterThanOrEqual(1);
    expect((await getRow()).review_overdue_notified_at).not.toBeNull();

    const r2 = await processDentistReviewDeadlinesAction();
    if (r2.success) expect(r2.overdueNotified).toBe(0);
  });

  it('entrega fresca: ni recordatorio ni vencido', async () => {
    await setSubmitted(1);
    const r = await processDentistReviewDeadlinesAction();
    if (r.success) {
      expect(r.remindersSent).toBe(0);
      expect(r.overdueNotified).toBe(0);
    }
    const row = await getRow();
    expect(row.review_reminder_sent_at).toBeNull();
    expect(row.review_overdue_notified_at).toBeNull();
  });

});
