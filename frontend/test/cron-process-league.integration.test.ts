/**
 * Integración BD — cron del motor de ligas (Fase 2, Sprint 4).
 * Requiere RUN_DB_INTEGRATION_TESTS=true.
 *
 * Cubre processLeagueMaintenanceAction (orquesta ascenso/descenso, idempotente),
 * el gating por flag y la auth del endpoint /api/cron/process-league.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { processLeagueMaintenanceAction } from '@/lib/db/actions/leagueCron';
import { GET as processLeagueRoute } from '@/app/api/cron/process-league/route';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000009c4000';
const DOCTOR = 'test-leaguecron-doctor';
const TECH = 'test-leaguecron-tech';
const DAY = 86_400_000;

let urgencyId: string;
let prevFlag: string | undefined;
let prevSecret: string | undefined;

async function seedCompletedCase(rating: number, completedDaysAgo: number): Promise<void> {
  const caseId = crypto.randomUUID();
  const assignedAt = new Date(Date.now() - (completedDaysAgo + 4) * DAY).toISOString();
  const completedAt = new Date(Date.now() - completedDaysAgo * DAY).toISOString();
  await db.execute(sql`
    INSERT INTO clinical_case (id, organization_id, doctor_id, internal_name, needs_fabrication,
      status, urgency_id, case_league, assigned_at, completed_at, assigned_technician_id)
    VALUES (${caseId}, ${ORG}, ${DOCTOR}, 'Cron Case', false, 'completado', ${urgencyId},
      'plata', ${assignedAt}, ${completedAt}, ${TECH})`);
  await db.execute(sql`INSERT INTO case_invitation (clinical_case_id, technician_id, status, quoted_days)
    VALUES (${caseId}, ${TECH}, 'confirmed', 5)`);
  await db.execute(sql`INSERT INTO review (clinical_case_id, reviewer_id, reviewee_id, rating, dimension)
    VALUES (${caseId}, ${DOCTOR}, ${TECH}, ${rating}, 'design')`);
}

describe.runIf(runIntegration)('cron motor de ligas (Fase 2, Sprint 4)', () => {
  beforeAll(async () => {
    prevFlag = process.env.LEAGUE_ENGINE_ENABLED;
    prevSecret = process.env.CRON_SECRET;
    process.env.LEAGUE_ENGINE_ENABLED = 'true';
    await ensureInfrastructure(db);
    await db.execute(sql`UPDATE fauchard_config SET l_min_rating=4.20, l_min_punctuality=0.85,
      l_cases_completed=2, l_cases_evaluated=3 WHERE is_active=true`);
    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'Cron Org','rut-cron-l','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR + '@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,league_level) VALUES (${TECH},${TECH + '@t.local'},'tecnico',${ORG},true,'plata') ON CONFLICT (id) DO NOTHING`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    urgencyId = u.id;
    await seedCompletedCase(5, 16);
    await seedCompletedCase(5, 11);
    await seedCompletedCase(4, 6);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM review WHERE reviewee_id=${TECH}`);
    await db.execute(sql`DELETE FROM case_invitation WHERE technician_id=${TECH}`);
    await db.execute(sql`DELETE FROM league_change_event WHERE technician_id=${TECH}`);
    await db.execute(sql`DELETE FROM clinical_case WHERE doctor_id=${DOCTOR}`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH},${DOCTOR})`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
    if (prevFlag === undefined) delete process.env.LEAGUE_ENGINE_ENABLED; else process.env.LEAGUE_ENGINE_ENABLED = prevFlag;
    if (prevSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prevSecret;
  });

  it('orquesta el ascenso del técnico elegible y marca leagueLastEvaluatedAt', async () => {
    const res = await processLeagueMaintenanceAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.evaluated).toBeGreaterThanOrEqual(1);
      expect(res.ascended).toBeGreaterThanOrEqual(1);
    }
    const [st]: any = await db.execute(sql`SELECT league_level, league_last_evaluated_at FROM "user" WHERE id=${TECH}`);
    expect(st.league_level).toBe('oro');
    expect(st.league_last_evaluated_at).not.toBeNull();
  });

  it('inerte con el flag apagado', async () => {
    process.env.LEAGUE_ENGINE_ENABLED = 'false';
    const res = await processLeagueMaintenanceAction();
    expect(res.success).toBe(true);
    if (res.success) expect(res.skipped).toBe(true);
    process.env.LEAGUE_ENGINE_ENABLED = 'true';
  });

  it('endpoint: 401 sin Bearer correcto cuando hay CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'secreto-test';
    const req = new Request('http://localhost/api/cron/process-league');
    const resp = await processLeagueRoute(req as any);
    expect(resp.status).toBe(401);
  });

  it('endpoint: 200 con Bearer correcto', async () => {
    process.env.CRON_SECRET = 'secreto-test';
    const req = new Request('http://localhost/api/cron/process-league', {
      headers: { authorization: 'Bearer secreto-test' },
    });
    const resp = await processLeagueRoute(req as any);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
  });
});
