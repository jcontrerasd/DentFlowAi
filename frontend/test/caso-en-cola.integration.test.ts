/**
 * Integración BD — evento UCH CASO_EN_COLA al entrar en pendiente_pool.
 * Requiere RUN_DB_INTEGRATION_TESTS=true.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const DOCTOR = 'test-cola-doctor';
const TECH = 'test-cola-tech';

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
import { runAssignmentAction } from '@/lib/db/actions/assignment';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000006006aa';
const CASE = '00000000-0000-0000-0000-0000006006bb';

describe.runIf(runIntegration)('evento CASO_EN_COLA al encolar', () => {
  let prevModel: string | undefined;
  let prevPool: string | undefined;

  beforeAll(async () => {
    prevModel = process.env.AVAILABILITY_MODEL_ENABLED;
    prevPool = process.env.POOL_PENDIENTE_ENABLED;
    process.env.AVAILABILITY_MODEL_ENABLED = 'true';
    process.env.POOL_PENDIENTE_ENABLED = 'true';
    await ensureInfrastructure(db);

    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'Cola Org','rut-cola','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR+'@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,is_available) VALUES (${TECH},${TECH+'@t.local'},'tecnico',${ORG},true,true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO restoration_type (code,label,sort_order,is_active) VALUES ('rest_cola','Corona Unitaria',903,true) ON CONFLICT (code) DO NOTHING`);
    const [r]: any = await db.execute(sql`SELECT id FROM restoration_type WHERE code='rest_cola' LIMIT 1`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    await db.execute(sql`INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level) VALUES (${TECH},'corona_posterior',5,0) ON CONFLICT DO NOTHING`);
    // Técnico activo pero CAD apagado → no elegible para coronas CAD.
    await db.execute(sql`INSERT INTO technician_availability (user_id, level_global, level_cad, level_cam) VALUES (${TECH}, true, false, false) ON CONFLICT (user_id) DO UPDATE SET level_global=true, level_cad=false, level_cam=false`);
    await db.execute(sql`INSERT INTO clinical_case (id,organization_id,doctor_id,internal_name,needs_fabrication,status,service_type,case_league,teeth,restoration_type_id,urgency_id,list_price_cost,list_price_sale)
      VALUES (${CASE},${ORG},${DOCTOR},'Cola Case',false,'enEvaluacion','solo_diseno','bronce','[16]'::jsonb,${r.id},${u.id},10000,15000) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM clinical_case_event WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`DELETE FROM clinical_case WHERE id=${CASE}`);
    await db.execute(sql`DELETE FROM technician_availability WHERE user_id=${TECH}`);
    await db.execute(sql`DELETE FROM technician_skill WHERE user_id=${TECH}`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH}, ${DOCTOR})`);
    await db.execute(sql`DELETE FROM restoration_type WHERE code='rest_cola'`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
    if (prevModel === undefined) delete process.env.AVAILABILITY_MODEL_ENABLED; else process.env.AVAILABILITY_MODEL_ENABLED = prevModel;
    if (prevPool === undefined) delete process.env.POOL_PENDIENTE_ENABLED; else process.env.POOL_PENDIENTE_ENABLED = prevPool;
  });

  it('runAssignmentAction registra CASO_EN_COLA con topExclusions al encolar', async () => {
    await db.execute(sql`DELETE FROM clinical_case_event WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`UPDATE clinical_case SET internal_status=NULL, status='enEvaluacion', pending_pool_cycle_count=0 WHERE id=${CASE}`);

    const res = await runAssignmentAction(CASE);
    expect(res.pooled).toBe(true);

    const [c]: any = await db.execute(sql`SELECT internal_status FROM clinical_case WHERE id=${CASE}`);
    expect(c.internal_status).toBe('pendiente_pool');

    const [ev]: any = await db.execute(sql`
      SELECT action, payload FROM clinical_case_event
      WHERE clinical_case_id=${CASE} AND action=${CASE_EVENTS.CASO_EN_COLA}
      ORDER BY created_at DESC LIMIT 1`);
    expect(ev).toBeTruthy();
    expect(ev.action).toBe(CASE_EVENTS.CASO_EN_COLA);
    const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
    expect(payload.eligible).toBe(0);
    expect(payload.topExclusions).toBeTruthy();
    expect(Object.keys(payload.topExclusions).length).toBeGreaterThan(0);
  });
});
