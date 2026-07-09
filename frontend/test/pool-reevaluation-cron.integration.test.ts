/**
 * Integración BD — reevaluación periódica de pendiente_pool (cron cada 2 min).
 * Requiere RUN_DB_INTEGRATION_TESTS=true.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const DOCTOR = 'test-reeval-doctor';
const TECH = 'test-reeval-tech';

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn(async () => ({ success: true })),
  notifyOrganizationDentists: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: DOCTOR, role: 'dentista', isSystemAdmin: false })),
}));

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { processPendingPoolReevaluationAction } from '@/lib/db/actions/poolQueue';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000008008aa';
const CASE = '00000000-0000-0000-0000-0000008008bb';

async function caseInternalStatus() {
  const [c]: any = await db.execute(sql`SELECT internal_status FROM clinical_case WHERE id = ${CASE}`);
  return c?.internal_status ?? null;
}

describe.runIf(runIntegration)('reevaluación cron pendiente_pool', () => {
  let prevPool: string | undefined;

  beforeAll(async () => {
    prevPool = process.env.POOL_PENDIENTE_ENABLED;
    process.env.POOL_PENDIENTE_ENABLED = 'true';
    await ensureInfrastructure(db);

    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'Reeval Org','rut-reeval','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR+'@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,is_available) VALUES (${TECH},${TECH+'@t.local'},'tecnico',${ORG},true,true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO restoration_type (code,label,sort_order,is_active) VALUES ('rest_reeval','Corona Unitaria',902,true) ON CONFLICT (code) DO NOTHING`);
    const [r]: any = await db.execute(sql`SELECT id FROM restoration_type WHERE code='rest_reeval' LIMIT 1`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    await db.execute(sql`INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level) VALUES (${TECH},'corona_posterior',5,0) ON CONFLICT DO NOTHING`);
    // Técnico ya elegible (global ∧ CAD ∧ categoría coronas).
    await db.execute(sql`INSERT INTO technician_availability (user_id, level_global, level_cad, level_cam) VALUES (${TECH}, true, true, false) ON CONFLICT (user_id) DO UPDATE SET level_global=true, level_cad=true, level_cam=false`);
    await db.execute(sql`INSERT INTO clinical_case (id,organization_id,doctor_id,internal_name,needs_fabrication,status,service_type,case_league,teeth,restoration_type_id,urgency_id,internal_status,list_price_cost,list_price_sale)
      VALUES (${CASE},${ORG},${DOCTOR},'Reeval Case',false,'enEvaluacion','solo_diseno','bronce','[16]'::jsonb,${r.id},${u.id},'pendiente_pool',10000,15000) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM case_assignment WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`DELETE FROM clinical_case_event WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`DELETE FROM case_invitation WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`DELETE FROM clinical_case WHERE id=${CASE}`);
    await db.execute(sql`DELETE FROM technician_availability WHERE user_id=${TECH}`);
    await db.execute(sql`DELETE FROM technician_skill WHERE user_id=${TECH}`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH}, ${DOCTOR})`);
    await db.execute(sql`DELETE FROM restoration_type WHERE code='rest_reeval'`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
    if (prevPool === undefined) delete process.env.POOL_PENDIENTE_ENABLED; else process.env.POOL_PENDIENTE_ENABLED = prevPool;
  });

  it('processPendingPoolReevaluationAction asigna cuando ya hay elegibles', async () => {
    await db.execute(sql`UPDATE clinical_case SET internal_status='pendiente_pool', status='enEvaluacion' WHERE id=${CASE}`);
    expect(await caseInternalStatus()).toBe('pendiente_pool');

    const res = await processPendingPoolReevaluationAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.assigned).toBeGreaterThanOrEqual(1);
      expect(res.stillWaiting).toBe(0);
    }

    expect(await caseInternalStatus()).not.toBe('pendiente_pool');
    const [assign]: any = await db.execute(sql`SELECT count(*)::int AS n FROM case_assignment WHERE clinical_case_id=${CASE} AND status='pending'`);
    expect(assign.n).toBeGreaterThanOrEqual(1);
  });

  it('processPendingPoolReevaluationAction es no-op si sigue sin elegibles', async () => {
    await db.execute(sql`UPDATE clinical_case SET internal_status='pendiente_pool', status='enEvaluacion' WHERE id=${CASE}`);
    await db.execute(sql`UPDATE technician_availability SET level_cad=false WHERE user_id=${TECH}`);
    await db.execute(sql`DELETE FROM case_assignment WHERE clinical_case_id=${CASE}`);

    const res = await processPendingPoolReevaluationAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.assigned).toBe(0);
      expect(res.stillWaiting).toBeGreaterThanOrEqual(1);
    }
    expect(await caseInternalStatus()).toBe('pendiente_pool');

    await db.execute(sql`UPDATE technician_availability SET level_cad=true WHERE user_id=${TECH}`);
  });
});
