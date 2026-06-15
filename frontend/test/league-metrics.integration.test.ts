/**
 * Integración BD — métricas de liga (Fase 2, Sprint 1). Lectura pura.
 * Requiere RUN_DB_INTEGRATION_TESTS=true.
 *
 * Cubre computeLeagueMetricsAction: ventana lCasesEvaluated, rating promedio,
 * puntualidad on-time y total de completados, todo acotado a la liga actual.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { computeLeagueMetricsAction } from '@/lib/db/actions/league';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-00000090a000';
const DOCTOR = 'test-league-doctor';
const TECH = 'test-league-tech';
const DAY = 86_400_000;

let urgencyId: string;

/** Inserta un caso completado + invitación confirmada + review para el técnico. */
async function seedCompletedCase(opts: {
  league: string;
  assignedDaysAgo: number;
  completedDaysAgo: number;
  deadlineDays: number;
  rating: number;
}): Promise<string> {
  const caseId = crypto.randomUUID();
  const assignedAt = new Date(Date.now() - opts.assignedDaysAgo * DAY).toISOString();
  const completedAt = new Date(Date.now() - opts.completedDaysAgo * DAY).toISOString();
  await db.execute(sql`
    INSERT INTO clinical_case (id, organization_id, doctor_id, internal_name, needs_fabrication,
      status, urgency_id, case_league, assigned_at, completed_at, assigned_technician_id)
    VALUES (${caseId}, ${ORG}, ${DOCTOR}, 'League Case', false, 'completado', ${urgencyId},
      ${opts.league}, ${assignedAt}, ${completedAt}, ${TECH})`);
  await db.execute(sql`
    INSERT INTO case_invitation (clinical_case_id, technician_id, status, quoted_days)
    VALUES (${caseId}, ${TECH}, 'confirmed', ${opts.deadlineDays})`);
  await db.execute(sql`
    INSERT INTO review (clinical_case_id, reviewer_id, reviewee_id, rating, dimension)
    VALUES (${caseId}, ${DOCTOR}, ${TECH}, ${opts.rating}, 'design')`);
  return caseId;
}

describe.runIf(runIntegration)('métricas de liga (Fase 2, Sprint 1)', () => {
  beforeAll(async () => {
    await ensureInfrastructure(db);
    // Ventana determinista de 3 casos.
    await db.execute(sql`UPDATE fauchard_config SET l_cases_evaluated=3 WHERE is_active=true`);
    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'League Org','rut-league','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR + '@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,league_level) VALUES (${TECH},${TECH + '@t.local'},'tecnico',${ORG},true,'oro') ON CONFLICT (id) DO NOTHING`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    urgencyId = u.id;

    // 3 casos on-time en 'oro' (window): ratings 5,4,4. completedDaysAgo 16/11/6.
    await seedCompletedCase({ league: 'oro', assignedDaysAgo: 20, completedDaysAgo: 16, deadlineDays: 5, rating: 5 });
    await seedCompletedCase({ league: 'oro', assignedDaysAgo: 15, completedDaysAgo: 11, deadlineDays: 5, rating: 4 });
    await seedCompletedCase({ league: 'oro', assignedDaysAgo: 10, completedDaysAgo: 6, deadlineDays: 5, rating: 4 });
    // 4º caso 'oro' MÁS antiguo y tardío (fuera de ventana de 3): rating 1, late.
    await seedCompletedCase({ league: 'oro', assignedDaysAgo: 50, completedDaysAgo: 38, deadlineDays: 1, rating: 1 });
    // Caso en 'plata' (otra liga): NO debe contar para un técnico 'oro'.
    await seedCompletedCase({ league: 'plata', assignedDaysAgo: 3, completedDaysAgo: 1, deadlineDays: 5, rating: 1 });
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM review WHERE reviewee_id=${TECH}`);
    await db.execute(sql`DELETE FROM case_invitation WHERE technician_id=${TECH}`);
    await db.execute(sql`DELETE FROM clinical_case WHERE doctor_id=${DOCTOR}`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH},${DOCTOR})`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
  });

  it('acota a la liga actual, aplica ventana y promedia rating/puntualidad', async () => {
    const res = await computeLeagueMetricsAction(TECH);
    expect(res.success).toBe(true);
    const m = res.data!;
    expect(m.league).toBe('oro');
    // Total en 'oro' = 4 (el de 'plata' no cuenta).
    expect(m.completedTotal).toBe(4);
    // Ventana = 3.
    expect(m.casesInWindow).toBe(3);
    // Rating de los 3 recientes: (5+4+4)/3 ≈ 4.33.
    expect(m.avgRating).toBeGreaterThan(4.3);
    expect(m.avgRating).toBeLessThan(4.4);
    // Los 3 recientes son on-time → 1.0 (el late queda fuera de ventana).
    expect(m.punctuality).toBe(1);
  });

  it('técnico sin casos en su liga → métricas vacías', async () => {
    await db.execute(sql`UPDATE "user" SET league_level='elite' WHERE id=${TECH}`);
    const res = await computeLeagueMetricsAction(TECH);
    expect(res.success).toBe(true);
    expect(res.data!.league).toBe('elite');
    expect(res.data!.completedTotal).toBe(0);
    expect(res.data!.casesInWindow).toBe(0);
    expect(res.data!.avgRating).toBeNull();
    expect(res.data!.punctuality).toBeNull();
    await db.execute(sql`UPDATE "user" SET league_level='oro' WHERE id=${TECH}`);
  });

  it('técnico inexistente → error', async () => {
    const res = await computeLeagueMetricsAction('no-such-tech');
    expect(res.success).toBe(false);
  });
});
