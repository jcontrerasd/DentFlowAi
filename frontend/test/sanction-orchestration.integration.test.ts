/**
 * Integración BD — orquestación de sanción rolling (auditoría 4, cierre de cobertura).
 * Cubre el corazón del modelo, antes sin test directo:
 *  - `penalizeNoResponseAction`: Nivel 1 → 2 → 3, con auto-OFF + auto-rechazo en Nivel 3.
 *  - `autoRejectOnAutoOffAction`: rechazo masivo con brej_003.
 *  - `rejectInvitationsBulkAction`: rechazo masivo del técnico (toggle OFF).
 * Requiere RUN_DB_INTEGRATION_TESTS=true. Mockea notifyUser e identidad (admin).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn(async () => ({ success: true })),
  notifyOrganizationDentists: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: 'test-sanction-admin', role: 'admin', isSystemAdmin: true })),
}));

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { penalizeNoResponseAction } from '@/lib/db/actions/fauchard';
import { autoRejectOnAutoOffAction, rejectInvitationsBulkAction } from '@/lib/db/actions/rejection';
import { getActiveNoResponseEventsForTechAction, pardonNoResponseEventsAction } from '@/lib/db/actions/noResponseEvents';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000010010aa';
const TECH = 'test-sanction-tech';
const CASE1 = '00000000-0000-0000-0000-0000010010b1';
const CASE2 = '00000000-0000-0000-0000-0000010010b2';
const INV1 = '00000000-0000-0000-0000-0000010010c1';
const INV2 = '00000000-0000-0000-0000-0000010010c2';

async function globalOn() {
  const [a]: any = await db.execute(sql`SELECT level_global FROM technician_availability WHERE user_id=${TECH}`);
  return a?.level_global;
}
async function invStatus(id: string) {
  const [i]: any = await db.execute(sql`SELECT status, bulk_rejection_reason_id FROM case_invitation WHERE id=${id}`);
  return i;
}
async function resetEventsAndInvites() {
  await db.execute(sql`DELETE FROM technician_no_response_event WHERE technician_user_id=${TECH}`);
  await db.execute(sql`UPDATE technician_availability SET level_global=true WHERE user_id=${TECH}`);
  await db.execute(sql`UPDATE case_invitation SET status='pending', bulk_rejection_reason_id=NULL WHERE id IN (${INV1}, ${INV2})`);
}

describe.runIf(runIntegration)('orquestación de sanción rolling (auditoría 4)', () => {

  beforeAll(async () => {
    await ensureInfrastructure(db);
    // Umbrales deterministas 1/2/3.
    await db.execute(sql`UPDATE fauchard_config SET level_1_threshold=1, level_2_threshold=2, level_3_threshold=3 WHERE is_active=true`);
    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'Sanc Org','rut-sanc','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${TECH},${TECH+'@t.local'},'tecnico',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    // Admin de la identidad mockeada (FK pardoned_by_user_id en el perdón).
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES ('test-sanction-admin','sanction-admin@t.local','admin',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO technician_availability (user_id, level_global) VALUES (${TECH}, true) ON CONFLICT (user_id) DO UPDATE SET level_global=true`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    for (const [cid, iid] of [[CASE1, INV1], [CASE2, INV2]] as const) {
      await db.execute(sql`INSERT INTO clinical_case (id,organization_id,internal_name,needs_fabrication,status,urgency_id) VALUES (${cid},${ORG},'Sanc Case',false,'enEvaluacion',${u.id}) ON CONFLICT (id) DO NOTHING`);
      await db.execute(sql`INSERT INTO case_invitation (id,clinical_case_id,technician_id,status) VALUES (${iid},${cid},${TECH},'pending') ON CONFLICT (id) DO NOTHING`);
    }
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM technician_no_response_event WHERE technician_user_id=${TECH}`);
    await db.execute(sql`DELETE FROM case_invitation WHERE clinical_case_id IN (${CASE1}, ${CASE2})`);
    await db.execute(sql`DELETE FROM clinical_case WHERE id IN (${CASE1}, ${CASE2})`);
    await db.execute(sql`DELETE FROM technician_availability WHERE user_id=${TECH}`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH}, 'test-sanction-admin')`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
  });

  beforeEach(resetEventsAndInvites);

  it('penalize: Nivel 1 y 2 no apagan el switch ni rechazan invitaciones', async () => {
    await penalizeNoResponseAction(TECH);            // Nivel 1
    expect(await globalOn()).toBe(true);
    expect((await invStatus(INV1)).status).toBe('pending');

    await penalizeNoResponseAction(TECH);            // Nivel 2
    expect(await globalOn()).toBe(true);
    expect((await invStatus(INV1)).status).toBe('pending');
  });

  it('penalize: Nivel 3 → auto-OFF del switch + auto-rechazo de pendientes', async () => {
    await penalizeNoResponseAction(TECH);
    await penalizeNoResponseAction(TECH);
    await penalizeNoResponseAction(TECH);            // Nivel 3

    expect(await globalOn()).toBe(false);            // auto-OFF
    const i1 = await invStatus(INV1);
    const i2 = await invStatus(INV2);
    expect(i1.status).toBe('rejected');
    expect(i2.status).toBe('rejected');
    // Auto-rechazo usa el catálogo masivo (brej_003).
    expect(i1.bulk_rejection_reason_id).not.toBeNull();
  });

  it('autoRejectOnAutoOffAction rechaza pendientes con brej_003', async () => {
    const [brej3]: any = await db.execute(sql`SELECT id FROM bulk_rejection_reason WHERE code='brej_003'`);
    const res = await autoRejectOnAutoOffAction(TECH, [INV1]);
    expect(res.success).toBe(true);
    if (res.success) expect(res.rejected).toBe(1);
    const i1 = await invStatus(INV1);
    expect(i1.status).toBe('rejected');
    expect(i1.bulk_rejection_reason_id).toBe(brej3.id);
    expect((await invStatus(INV2)).status).toBe('pending'); // no incluida
  });

  it('rejectInvitationsBulkAction rechaza con un motivo masivo válido', async () => {
    const [brej1]: any = await db.execute(sql`SELECT id FROM bulk_rejection_reason WHERE code='brej_001'`);
    const res = await rejectInvitationsBulkAction(TECH, brej1.id, undefined, [INV1, INV2]);
    expect(res.success).toBe(true);
    if (res.success) expect(res.rejected).toBe(2);
    expect((await invStatus(INV1)).status).toBe('rejected');
    expect((await invStatus(INV2)).status).toBe('rejected');
  });

  it('rejectInvitationsBulkAction: motivo inválido → error', async () => {
    const res = await rejectInvitationsBulkAction(TECH, '00000000-0000-0000-0000-000000000000', undefined, [INV1]);
    expect(res.success).toBe(false);
  });

  it('admin: lista no-respuestas activas y las perdona (vuelve a Nivel 0)', async () => {
    await penalizeNoResponseAction(TECH);
    await penalizeNoResponseAction(TECH); // 2 activas → Nivel 2

    const list = await getActiveNoResponseEventsForTechAction(TECH);
    expect(list.success).toBe(true);
    if (!list.success) return;
    expect(list.events.length).toBe(2);

    const ids = list.events.map((e) => e.id);
    const pardon = await pardonNoResponseEventsAction(TECH, ids, 'Auditoría: perdón de prueba');
    expect(pardon.success).toBe(true);
    if (pardon.success) expect(pardon.newLevel).toBe(0);

    const after = await getActiveNoResponseEventsForTechAction(TECH);
    if (after.success) expect(after.events.length).toBe(0);
  });
});
