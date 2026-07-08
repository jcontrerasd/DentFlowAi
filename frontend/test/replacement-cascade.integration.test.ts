/**
 * Integración BD — reemplazo automático tras rechazo (v5.0, Fase 5).
 * Requiere RUN_DB_INTEGRATION_TESTS=true y DATABASE_URL (Docker local).
 *
 * Verifica que un rechazo individual invita al siguiente elegible del pool
 * scoreado (isReplacement=true) y que el cutoff temporal corta el reemplazo.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const REJECTER = 'test-f5-rej-tech';

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: REJECTER, role: 'tecnico', isSystemAdmin: false })),
}));

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { rejectInvitationIndividualAction } from '@/lib/db/actions/rejection';
import { tryReplaceAfterRejectAction } from '@/lib/db/actions/replacement';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000005005aa';
const CASE = '00000000-0000-0000-0000-0000005005bb';
const KEEPER = 'test-f5-keeper-tech';
const CANDIDATE = 'test-f5-cand-tech';
const WORK_TYPE = 'corona_posterior';

async function seedTech(id: string, opts: { available: boolean }) {
  await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active, is_available, consecutive_no_response)
    VALUES (${id}, ${id + '@t.local'}, 'tecnico', ${ORG}, true, ${opts.available}, 0) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level)
    VALUES (${id}, ${WORK_TYPE}, 5, 5) ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO technician_availability (user_id, level_global, level_cad, level_cam, cat_coronas_cad, cat_coronas_cam)
    VALUES (${id}, true, true, true, true, true) ON CONFLICT (user_id) DO NOTHING`);
}

describe.runIf(runIntegration)('reemplazo automático tras rechazo (Fase 5)', () => {
  let restorationId: string;
  let urgencyId: string;
  let reasonId: string;

  beforeAll(async () => {
    await ensureInfrastructure(db);

    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'F5 Org', 'rut-f5', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO restoration_type (code, label, sort_order, is_active) VALUES ('rest_f5t', 'Corona Unitaria', 900, true) ON CONFLICT (code) DO NOTHING`);
    const [r]: any = await db.execute(sql`SELECT id FROM restoration_type WHERE code = 'rest_f5t' LIMIT 1`);
    restorationId = r.id;
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    urgencyId = u.id;
    const [rr]: any = await db.execute(sql`SELECT id FROM invitation_rejection_reason ORDER BY sort_order LIMIT 1`);
    reasonId = rr.id;

    await seedTech(REJECTER, { available: true });
    await seedTech(KEEPER, { available: true });
    await seedTech(CANDIDATE, { available: true });

    await db.execute(sql`INSERT INTO clinical_case (id, organization_id, internal_name, needs_fabrication, status, service_type, case_league, teeth, restoration_type_id, urgency_id)
      VALUES (${CASE}, ${ORG}, 'F5 Reemplazo', false, 'enEvaluacion', 'solo_diseno', 'bronce', '[16]'::jsonb, ${restorationId}, ${urgencyId}) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM clinical_case_event WHERE clinical_case_id = ${CASE}`);
    await db.execute(sql`DELETE FROM case_invitation WHERE clinical_case_id = ${CASE}`);
    await db.execute(sql`DELETE FROM clinical_case WHERE id = ${CASE}`);
    await db.execute(sql`DELETE FROM technician_no_response_event WHERE technician_user_id IN (${REJECTER}, ${KEEPER}, ${CANDIDATE})`);
    await db.execute(sql`DELETE FROM technician_availability WHERE user_id IN (${REJECTER}, ${KEEPER}, ${CANDIDATE})`);
    await db.execute(sql`DELETE FROM technician_skill WHERE user_id IN (${REJECTER}, ${KEEPER}, ${CANDIDATE})`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${REJECTER}, ${KEEPER}, ${CANDIDATE})`);
    await db.execute(sql`DELETE FROM restoration_type WHERE code = 'rest_f5t'`);
    await db.execute(sql`DELETE FROM organization WHERE id = ${ORG}`);
  });

  async function seedInvitations(keeperExpiresInMin: number) {
    await db.execute(sql`DELETE FROM case_invitation WHERE clinical_case_id = ${CASE}`);
    const rejExpires = new Date(Date.now() + 60 * 60_000).toISOString();
    const keeperExpires = new Date(Date.now() + keeperExpiresInMin * 60_000).toISOString();
    await db.execute(sql`INSERT INTO case_invitation (clinical_case_id, technician_id, status, work_type, invited_at, expires_at)
      VALUES (${CASE}, ${REJECTER}, 'pending', ${WORK_TYPE}, NOW(), ${rejExpires})`);
    await db.execute(sql`INSERT INTO case_invitation (clinical_case_id, technician_id, status, work_type, invited_at, expires_at)
      VALUES (${CASE}, ${KEEPER}, 'pending', ${WORK_TYPE}, NOW(), ${keeperExpires})`);
    const [inv]: any = await db.execute(sql`SELECT id FROM case_invitation WHERE clinical_case_id = ${CASE} AND technician_id = ${REJECTER} LIMIT 1`);
    return inv.id as string;
  }

  it('rechazo individual → reemplazo al candidato del pool (isReplacement=true)', async () => {
    const invId = await seedInvitations(50); // keeper vence en 50 min (> cutoff)
    const res = await rejectInvitationIndividualAction(invId, reasonId);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.replacementSent).toBe(true);

    const [rejected]: any = await db.execute(sql`SELECT status FROM case_invitation WHERE id = ${invId}`);
    expect(rejected.status).toBe('rejected');

    // Se generó exactamente una invitación de reemplazo, dirigida a un técnico del
    // pool distinto de los ya invitados (rejecter/keeper). El candidato concreto lo
    // decide el score; la BD local puede tener otros elegibles, así que no fijamos uno.
    const reps: any = await db.execute(sql`SELECT technician_id FROM case_invitation
      WHERE clinical_case_id = ${CASE} AND is_replacement = true AND status = 'pending'`);
    const repRows = Array.from(reps);
    expect(repRows.length).toBe(1);
    expect([REJECTER, KEEPER]).not.toContain((repRows[0] as any).technician_id);
  });

  it('cutoff: si el deadline está dentro de replacementCutoffMinutes, no hay reemplazo', async () => {
    const invId = await seedInvitations(3); // keeper vence en 3 min (< cutoff default 10)
    // Mirror del flujo real: la invitación rechazada deja de ser "viva" antes del reemplazo,
    // por lo que el único deadline vivo es el del keeper (3 min).
    await db.execute(sql`UPDATE case_invitation SET status = 'rejected' WHERE id = ${invId}`);
    const rep = await tryReplaceAfterRejectAction(invId);
    expect(rep.success).toBe(true);
    if (!rep.success) return;
    expect(rep.replaced).toBe(false);
    expect(rep.reason).toBe('cutoff');

    const [cand]: any = await db.execute(sql`SELECT count(*)::int AS n FROM case_invitation
      WHERE clinical_case_id = ${CASE} AND technician_id = ${CANDIDATE}`);
    expect(cand.n).toBe(0);
  });
});
