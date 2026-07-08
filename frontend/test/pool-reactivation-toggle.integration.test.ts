/**
 * Integración BD — reactivación de cola al encender una CAPACIDAD (no solo el switch
 * global) (auditoría H8, §5.2 "cualquier nivel de switch"). Requiere
 * RUN_DB_INTEGRATION_TESTS=true. Mockea notifyUser e identidad (el técnico).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const TECH = 'test-h8-tech';

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn(async () => ({ success: true })),
  notifyOrganizationDentists: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: TECH, role: 'tecnico', isSystemAdmin: false })),
}));

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { updateAvailabilityLevelAction } from '@/lib/db/actions/availability';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000009009aa';
const CASE = '00000000-0000-0000-0000-0000009009bb';
const DOCTOR = 'test-h8-doctor';

async function caseInternalStatus() {
  const [c]: any = await db.execute(sql`SELECT internal_status FROM clinical_case WHERE id = ${CASE}`);
  return c?.internal_status ?? null;
}

describe.runIf(runIntegration)('reactivación de pool al encender capacidad (H8)', () => {
  let prevPool: string | undefined;

  beforeAll(async () => {
    prevPool = process.env.POOL_PENDIENTE_ENABLED;
    process.env.POOL_PENDIENTE_ENABLED = 'true';
    await ensureInfrastructure(db);

    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'H8 Org','rut-h8','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR+'@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active,is_available) VALUES (${TECH},${TECH+'@t.local'},'tecnico',${ORG},true,true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO restoration_type (code,label,sort_order,is_active) VALUES ('rest_h8t','Corona Unitaria',901,true) ON CONFLICT (code) DO NOTHING`);
    const [r]: any = await db.execute(sql`SELECT id FROM restoration_type WHERE code='rest_h8t' LIMIT 1`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    await db.execute(sql`INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level) VALUES (${TECH},'corona_posterior',5,0) ON CONFLICT DO NOTHING`);
    // Técnico: global ON, CAD OFF (no elegible aún), categorías ON por default.
    await db.execute(sql`INSERT INTO technician_availability (user_id, level_global, level_cad, level_cam) VALUES (${TECH}, true, false, false) ON CONFLICT (user_id) DO UPDATE SET level_global=true, level_cad=false, level_cam=false`);
    // Caso de diseño en cola pendiente_pool.
    await db.execute(sql`INSERT INTO clinical_case (id,organization_id,doctor_id,internal_name,needs_fabrication,status,service_type,case_league,teeth,restoration_type_id,urgency_id,internal_status)
      VALUES (${CASE},${ORG},${DOCTOR},'H8 Case',false,'enEvaluacion','solo_diseno','bronce','[16]'::jsonb,${r.id},${u.id},'pendiente_pool') ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM clinical_case_event WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`DELETE FROM case_invitation WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`DELETE FROM clinical_case WHERE id=${CASE}`);
    await db.execute(sql`DELETE FROM technician_availability WHERE user_id=${TECH}`);
    await db.execute(sql`DELETE FROM technician_skill WHERE user_id=${TECH}`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH}, ${DOCTOR})`);
    await db.execute(sql`DELETE FROM restoration_type WHERE code='rest_h8t'`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
    if (prevPool === undefined) delete process.env.POOL_PENDIENTE_ENABLED; else process.env.POOL_PENDIENTE_ENABLED = prevPool;
  });

  it('encender CAD saca el caso de pendiente_pool (antes solo global lo hacía)', async () => {
    expect(await caseInternalStatus()).toBe('pendiente_pool');

    const res = await updateAvailabilityLevelAction({ userId: TECH, target: { kind: 'capacity', capacidad: 'cad' }, value: true });
    expect(res.success).toBe(true);

    // El técnico ahora es elegible (global ∧ cad ∧ cat_coronas_cad) → Fauchard reactiva:
    // el caso sale de `pendiente_pool` (pasa al flujo normal de invitaciones) y se generan invitaciones.
    expect(await caseInternalStatus()).not.toBe('pendiente_pool');
    const [inv]: any = await db.execute(sql`SELECT count(*)::int AS n FROM case_invitation WHERE clinical_case_id=${CASE}`);
    expect(inv.n).toBeGreaterThanOrEqual(1);
  });
});
