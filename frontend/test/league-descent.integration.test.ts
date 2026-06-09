/**
 * Integración BD — descenso de liga (Fase 2, Sprint 3).
 * Requiere RUN_DB_INTEGRATION_TESTS=true.
 *
 * Cubre armado/desarmado del watch, descenso tras lDescentDays sostenidos,
 * tope en bronce y gating por flag.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { evaluateTechnicianDescentAction } from '@/lib/db/actions/league';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000009d3000';
const DOCTOR = 'test-descent-doctor';
const TECH_LOW = 'test-descent-tech-low';     // baja calificación → desciende
const TECH_RECOVER = 'test-descent-tech-rec'; // recupera → limpia watch
const TECH_FLOOR = 'test-descent-tech-floor'; // bronce: no puede bajar más
const DAY = 86_400_000;

let urgencyId: string;
let prevFlag: string | undefined;

async function seedCompletedCase(tech: string, league: string, rating: number, completedDaysAgo: number): Promise<void> {
  const caseId = crypto.randomUUID();
  const assignedAt = new Date(Date.now() - (completedDaysAgo + 4) * DAY).toISOString();
  const completedAt = new Date(Date.now() - completedDaysAgo * DAY).toISOString();
  await db.execute(sql`
    INSERT INTO clinical_case (id, organization_id, doctor_id, internal_name, needs_fabrication,
      status, urgency_id, case_league, assigned_at, completed_at, assigned_technician_id)
    VALUES (${caseId}, ${ORG}, ${DOCTOR}, 'Descent Case', false, 'completado', ${urgencyId},
      ${league}, ${assignedAt}, ${completedAt}, ${tech})`);
  await db.execute(sql`INSERT INTO case_invitation (clinical_case_id, technician_id, status, quoted_days)
    VALUES (${caseId}, ${tech}, 'confirmed', 5)`);
  await db.execute(sql`INSERT INTO review (clinical_case_id, reviewer_id, reviewee_id, rating, dimension)
    VALUES (${caseId}, ${DOCTOR}, ${tech}, ${rating}, 'design')`);
}

async function techState(tech: string) {
  const [r]: any = await db.execute(sql`SELECT league_level, league_demotion_watch_since FROM "user" WHERE id=${tech}`);
  return r;
}
async function setWatch(tech: string, daysAgo: number) {
  await db.execute(sql`UPDATE "user" SET league_demotion_watch_since=${new Date(Date.now() - daysAgo * DAY).toISOString()} WHERE id=${tech}`);
}

describe.runIf(runIntegration)('descenso de liga (Fase 2, Sprint 3)', () => {
  beforeAll(async () => {
    prevFlag = process.env.LEAGUE_ENGINE_ENABLED;
    process.env.LEAGUE_ENGINE_ENABLED = 'true';
    await ensureInfrastructure(db);
    await db.execute(sql`UPDATE fauchard_config SET l_descent_rating=3.00, l_descent_days=60, l_cases_evaluated=3 WHERE is_active=true`);
    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'Descent Org','rut-descent','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR + '@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,league_level) VALUES (${TECH_LOW},${TECH_LOW + '@t.local'},'tecnico',${ORG},true,'oro') ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,league_level) VALUES (${TECH_RECOVER},${TECH_RECOVER + '@t.local'},'tecnico',${ORG},true,'oro') ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,league_level) VALUES (${TECH_FLOOR},${TECH_FLOOR + '@t.local'},'tecnico',${ORG},true,'bronce') ON CONFLICT (id) DO NOTHING`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    urgencyId = u.id;

    // TECH_LOW: rating bajo (2,2,2) en 'oro'.
    await seedCompletedCase(TECH_LOW, 'oro', 2, 16);
    await seedCompletedCase(TECH_LOW, 'oro', 2, 11);
    await seedCompletedCase(TECH_LOW, 'oro', 2, 6);
    // TECH_RECOVER: rating sano (5,5,5) en 'oro'.
    await seedCompletedCase(TECH_RECOVER, 'oro', 5, 16);
    await seedCompletedCase(TECH_RECOVER, 'oro', 5, 11);
    await seedCompletedCase(TECH_RECOVER, 'oro', 5, 6);
    // TECH_FLOOR: rating bajo (2,2) en 'bronce'.
    await seedCompletedCase(TECH_FLOOR, 'bronce', 2, 11);
    await seedCompletedCase(TECH_FLOOR, 'bronce', 2, 6);
  });

  afterAll(async () => {
    for (const t of [TECH_LOW, TECH_RECOVER, TECH_FLOOR]) {
      await db.execute(sql`DELETE FROM review WHERE reviewee_id=${t}`);
      await db.execute(sql`DELETE FROM case_invitation WHERE technician_id=${t}`);
      await db.execute(sql`DELETE FROM league_change_event WHERE technician_id=${t}`);
    }
    await db.execute(sql`DELETE FROM clinical_case WHERE doctor_id=${DOCTOR}`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH_LOW},${TECH_RECOVER},${TECH_FLOOR},${DOCTOR})`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
    if (prevFlag === undefined) delete process.env.LEAGUE_ENGINE_ENABLED; else process.env.LEAGUE_ENGINE_ENABLED = prevFlag;
  });

  it('arma el watch la primera vez que el rating cae bajo el umbral', async () => {
    const res = await evaluateTechnicianDescentAction(TECH_LOW);
    expect(res.data).toEqual({ action: 'watch_armado' });
    expect((await techState(TECH_LOW)).league_demotion_watch_since).not.toBeNull();
  });

  it('no desciende si el watch no alcanza lDescentDays', async () => {
    await setWatch(TECH_LOW, 10); // 10d < 60d
    const res = await evaluateTechnicianDescentAction(TECH_LOW);
    expect(res.data).toEqual({ action: 'ninguno' });
    expect((await techState(TECH_LOW)).league_level).toBe('oro');
  });

  it('desciende un nivel tras lDescentDays sostenidos y limpia el watch', async () => {
    await setWatch(TECH_LOW, 70); // 70d ≥ 60d
    const res = await evaluateTechnicianDescentAction(TECH_LOW);
    expect(res.data).toEqual({ action: 'descenso', from: 'oro', to: 'plata' });
    const st = await techState(TECH_LOW);
    expect(st.league_level).toBe('plata');
    expect(st.league_demotion_watch_since).toBeNull();
  });

  it('limpia el watch si el rating se recupera', async () => {
    await setWatch(TECH_RECOVER, 70);
    const res = await evaluateTechnicianDescentAction(TECH_RECOVER);
    expect(res.data).toEqual({ action: 'watch_limpiado' });
    expect((await techState(TECH_RECOVER)).league_demotion_watch_since).toBeNull();
  });

  it('no baja de bronce (piso): limpia watch sin descender', async () => {
    await setWatch(TECH_FLOOR, 70);
    const res = await evaluateTechnicianDescentAction(TECH_FLOOR);
    expect(res.data).toEqual({ action: 'ninguno' });
    const st = await techState(TECH_FLOOR);
    expect(st.league_level).toBe('bronce');
    expect(st.league_demotion_watch_since).toBeNull();
  });

  it('inerte con el flag apagado', async () => {
    process.env.LEAGUE_ENGINE_ENABLED = 'false';
    const res = await evaluateTechnicianDescentAction(TECH_RECOVER);
    expect(res.data).toEqual({ action: 'skipped' });
    process.env.LEAGUE_ENGINE_ENABLED = 'true';
  });
});
