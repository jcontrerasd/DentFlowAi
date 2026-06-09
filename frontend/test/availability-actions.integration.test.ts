/**
 * Integración BD — actions de disponibilidad y sanción rolling (v5.0, Fase 2).
 * Requiere RUN_DB_INTEGRATION_TESTS=true y DATABASE_URL (Docker local).
 *
 * Cubre el AND triple (computeEligibleAction) y la curva de niveles
 * (recordNoResponse + getActiveEventsInWindow + computeLevel).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { computeEligibleAction } from '@/lib/db/actions/availability';
import {
  recordNoResponseEventAction,
  getActiveEventsInWindowAction,
  computeLevelForTechnicianAction,
  pardonEventsAction,
} from '@/lib/db/actions/noResponseEvents';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-00000050f2aa';
const TECH = 'test-f2-availability-tech';
const ADMIN = 'test-f2-availability-admin';

async function setAvailability(cols: Record<string, boolean>) {
  const sets = Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(', ');
  await db.execute(sql.raw(`UPDATE technician_availability SET ${sets} WHERE user_id = '${TECH}'`));
}

describe.runIf(runIntegration)('availability + sanción (Fase 2)', () => {
  beforeAll(async () => {
    await ensureInfrastructure(db);
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'F2 Org', 'rut-f2-av', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${TECH}, ${TECH + '@t.local'}, 'tecnico', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${ADMIN}, ${ADMIN + '@t.local'}, 'admin', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO technician_availability (user_id, level_global, level_cad, level_cam) VALUES (${TECH}, true, true, true) ON CONFLICT (user_id) DO NOTHING`);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH}, ${ADMIN})`);
    await db.execute(sql`DELETE FROM organization WHERE id = ${ORG}`);
  });

  it('AND triple: cualquier padre OFF anula la elegibilidad', async () => {
    await setAvailability({ level_global: true, level_cad: true, cat_coronas_cad: true });
    expect(await computeEligibleAction(TECH, 'coronas', 'cad')).toBe(true);

    await setAvailability({ cat_coronas_cad: false });
    expect(await computeEligibleAction(TECH, 'coronas', 'cad')).toBe(false);

    await setAvailability({ cat_coronas_cad: true, level_cad: false });
    expect(await computeEligibleAction(TECH, 'coronas', 'cad')).toBe(false);

    await setAvailability({ level_cad: true, level_global: false });
    expect(await computeEligibleAction(TECH, 'coronas', 'cad')).toBe(false);

    await setAvailability({ level_global: true });
    expect(await computeEligibleAction(TECH, 'coronas', 'cad')).toBe(true);
  });

  it('curva de niveles según no-respuestas en ventana + perdón admin', async () => {
    await db.execute(sql`DELETE FROM technician_no_response_event WHERE technician_user_id = ${TECH}`);

    let lvl = await computeLevelForTechnicianAction(TECH);
    expect(lvl.level).toBe(0);

    await recordNoResponseEventAction(TECH, null);
    expect(await getActiveEventsInWindowAction(TECH)).toBe(1);
    lvl = await computeLevelForTechnicianAction(TECH);
    expect(lvl.level).toBe(1);

    await recordNoResponseEventAction(TECH, null);
    lvl = await computeLevelForTechnicianAction(TECH);
    expect(lvl.level).toBe(2);

    await recordNoResponseEventAction(TECH, null);
    lvl = await computeLevelForTechnicianAction(TECH);
    expect(lvl.level).toBe(3);
    expect(lvl.nextExitDate).toBeInstanceOf(Date);

    // Perdón admin de todos los eventos activos → vuelve a nivel 0.
    const active = await db.execute(sql`SELECT id FROM technician_no_response_event WHERE technician_user_id = ${TECH} AND status = 'active'`);
    const ids = Array.from(active).map((r: any) => r.id);
    const pardon = await pardonEventsAction(TECH, ADMIN, 'Test de perdón', ids);
    expect(pardon.success).toBe(true);
    expect(await getActiveEventsInWindowAction(TECH)).toBe(0);
    lvl = await computeLevelForTechnicianAction(TECH);
    expect(lvl.level).toBe(0);
  });

  it('eventos fuera de ventana no cuentan', async () => {
    await db.execute(sql`DELETE FROM technician_no_response_event WHERE technician_user_id = ${TECH}`);
    // Evento de hace 20 días (fuera de la ventana de 14).
    await db.execute(sql`INSERT INTO technician_no_response_event (technician_user_id, occurred_at, status) VALUES (${TECH}, NOW() - INTERVAL '20 days', 'active')`);
    expect(await getActiveEventsInWindowAction(TECH)).toBe(0);
    const lvl = await computeLevelForTechnicianAction(TECH);
    expect(lvl.level).toBe(0);
  });
});
