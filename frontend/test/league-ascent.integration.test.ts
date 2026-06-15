/**
 * Integración BD — ascenso, consolidación de transición y gating (Fase 2, Sprint 2).
 * Requiere RUN_DB_INTEGRATION_TESTS=true.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { evaluateTechnicianAscentAction } from '@/lib/db/actions/league';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000009a5000';
const DOCTOR = 'test-ascent-doctor';
const TECH_A = 'test-ascent-tech-a'; // sube
const TECH_B = 'test-ascent-tech-b'; // no sube (rating bajo)
const TECH_C = 'test-ascent-tech-c'; // consolida transición
const DAY = 86_400_000;

let urgencyId: string;
let prevFlag: string | undefined;

async function seedCompletedCase(tech: string, opts: {
  league: string; assignedDaysAgo: number; completedDaysAgo: number; deadlineDays: number; rating: number;
}): Promise<void> {
  const caseId = crypto.randomUUID();
  const assignedAt = new Date(Date.now() - opts.assignedDaysAgo * DAY).toISOString();
  const completedAt = new Date(Date.now() - opts.completedDaysAgo * DAY).toISOString();
  await db.execute(sql`
    INSERT INTO clinical_case (id, organization_id, doctor_id, internal_name, needs_fabrication,
      status, urgency_id, case_league, assigned_at, completed_at, assigned_technician_id)
    VALUES (${caseId}, ${ORG}, ${DOCTOR}, 'Ascent Case', false, 'completado', ${urgencyId},
      ${opts.league}, ${assignedAt}, ${completedAt}, ${tech})`);
  await db.execute(sql`INSERT INTO case_invitation (clinical_case_id, technician_id, status, quoted_days)
    VALUES (${caseId}, ${tech}, 'confirmed', ${opts.deadlineDays})`);
  await db.execute(sql`INSERT INTO review (clinical_case_id, reviewer_id, reviewee_id, rating, dimension)
    VALUES (${caseId}, ${DOCTOR}, ${tech}, ${opts.rating}, 'design')`);
}

async function techState(tech: string) {
  const [r]: any = await db.execute(sql`SELECT league_level, league_transition_started_at, league_transition_count FROM "user" WHERE id=${tech}`);
  return r;
}
async function eventCount(tech: string, kind: string): Promise<number> {
  const [r]: any = await db.execute(sql`SELECT COUNT(*)::int AS n FROM league_change_event WHERE technician_id=${tech} AND kind=${kind}`);
  return r.n;
}

describe.runIf(runIntegration)('ascenso + transición de liga (Fase 2, Sprint 2)', () => {
  beforeAll(async () => {
    prevFlag = process.env.LEAGUE_ENGINE_ENABLED;
    process.env.LEAGUE_ENGINE_ENABLED = 'true';
    await ensureInfrastructure(db);
    await db.execute(sql`UPDATE fauchard_config SET l_min_rating=4.20, l_min_punctuality=0.85,
      l_cases_completed=2, l_cases_evaluated=3, l_cases_transition=2, l_penalty_transition=0.20 WHERE is_active=true`);
    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'Ascent Org','rut-ascent','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR + '@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,league_level) VALUES (${TECH_A},${TECH_A + '@t.local'},'tecnico',${ORG},true,'plata') ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,league_level) VALUES (${TECH_B},${TECH_B + '@t.local'},'tecnico',${ORG},true,'plata') ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,league_level) VALUES (${TECH_C},${TECH_C + '@t.local'},'tecnico',${ORG},true,'oro') ON CONFLICT (id) DO NOTHING`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    urgencyId = u.id;

    // TECH_A cumple: 3 casos on-time en 'plata', ratings 5,5,4.
    await seedCompletedCase(TECH_A, { league: 'plata', assignedDaysAgo: 20, completedDaysAgo: 16, deadlineDays: 5, rating: 5 });
    await seedCompletedCase(TECH_A, { league: 'plata', assignedDaysAgo: 15, completedDaysAgo: 11, deadlineDays: 5, rating: 5 });
    await seedCompletedCase(TECH_A, { league: 'plata', assignedDaysAgo: 10, completedDaysAgo: 6, deadlineDays: 5, rating: 4 });

    // TECH_B: rating bajo (2,2,3) → no cumple.
    await seedCompletedCase(TECH_B, { league: 'plata', assignedDaysAgo: 20, completedDaysAgo: 16, deadlineDays: 5, rating: 2 });
    await seedCompletedCase(TECH_B, { league: 'plata', assignedDaysAgo: 15, completedDaysAgo: 11, deadlineDays: 5, rating: 2 });
    await seedCompletedCase(TECH_B, { league: 'plata', assignedDaysAgo: 10, completedDaysAgo: 6, deadlineDays: 5, rating: 3 });

    // TECH_C: en transición desde hace 10d; 2 casos completados en 'oro' después.
    await db.execute(sql`UPDATE "user" SET league_transition_started_at=${new Date(Date.now() - 10 * DAY).toISOString()} WHERE id=${TECH_C}`);
    await seedCompletedCase(TECH_C, { league: 'oro', assignedDaysAgo: 8, completedDaysAgo: 5, deadlineDays: 5, rating: 5 });
    await seedCompletedCase(TECH_C, { league: 'oro', assignedDaysAgo: 5, completedDaysAgo: 2, deadlineDays: 5, rating: 5 });
  });

  afterAll(async () => {
    for (const t of [TECH_A, TECH_B, TECH_C]) {
      await db.execute(sql`DELETE FROM review WHERE reviewee_id=${t}`);
      await db.execute(sql`DELETE FROM case_invitation WHERE technician_id=${t}`);
      await db.execute(sql`DELETE FROM league_change_event WHERE technician_id=${t}`);
    }
    await db.execute(sql`DELETE FROM clinical_case WHERE doctor_id=${DOCTOR}`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH_A},${TECH_B},${TECH_C},${DOCTOR})`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
    if (prevFlag === undefined) delete process.env.LEAGUE_ENGINE_ENABLED; else process.env.LEAGUE_ENGINE_ENABLED = prevFlag;
  });

  it('asciende y abre período de transición cuando cumple el triple criterio', async () => {
    const res = await evaluateTechnicianAscentAction(TECH_A);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ action: 'ascenso', from: 'plata', to: 'oro' });
    const st = await techState(TECH_A);
    expect(st.league_level).toBe('oro');
    expect(st.league_transition_started_at).not.toBeNull();
    expect(await eventCount(TECH_A, 'ascenso')).toBe(1);
  });

  it('no asciende si falla un criterio (rating bajo)', async () => {
    const res = await evaluateTechnicianAscentAction(TECH_B);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ action: 'ninguno' });
    const st = await techState(TECH_B);
    expect(st.league_level).toBe('plata');
    expect(st.league_transition_started_at).toBeNull();
  });

  it('consolida la transición al alcanzar lCasesTransition', async () => {
    const before = await techState(TECH_C);
    const res = await evaluateTechnicianAscentAction(TECH_C);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ action: 'consolidado', league: 'oro' });
    const st = await techState(TECH_C);
    expect(st.league_transition_started_at).toBeNull();
    expect(st.league_transition_count).toBe((before.league_transition_count ?? 0) + 1);
    expect(await eventCount(TECH_C, 'transicion_consolidada')).toBe(1);
  });

  it('inerte con el flag apagado', async () => {
    process.env.LEAGUE_ENGINE_ENABLED = 'false';
    const res = await evaluateTechnicianAscentAction(TECH_A);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ action: 'skipped' });
    process.env.LEAGUE_ENGINE_ENABLED = 'true';
  });
});
