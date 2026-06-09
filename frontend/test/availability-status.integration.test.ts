/**
 * Integración BD — estado/historial de disponibilidad (v5.0, Fase 4).
 * Requiere RUN_DB_INTEGRATION_TESTS=true. Mockea identidad técnico.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const TECH = 'test-f4-status-tech';
const ORG = '00000000-0000-0000-0000-0000005400aa';

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: TECH, role: 'tecnico', isSystemAdmin: false })),
}));

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { getMyAvailabilityStatusAction } from '@/lib/db/actions/availability';
import { getResponseHistoryAction } from '@/lib/db/actions/noResponseEvents';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('disponibilidad — estado e historial (Fase 4)', () => {
  let prevFlag: string | undefined;

  beforeAll(async () => {
    prevFlag = process.env.AVAILABILITY_UI_TECNICO_ENABLED;
    process.env.AVAILABILITY_UI_TECNICO_ENABLED = 'true';
    await ensureInfrastructure(db);
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'F4 Org', 'rut-f4', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${TECH}, ${TECH + '@t.local'}, 'tecnico', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO technician_availability (user_id, level_global, level_cad, level_cam) VALUES (${TECH}, true, true, false) ON CONFLICT (user_id) DO NOTHING`);
    await db.execute(sql`DELETE FROM technician_no_response_event WHERE technician_user_id = ${TECH}`);
    // 2 recientes (en ventana), 1 antigua (fuera), 1 perdonada.
    await db.execute(sql`INSERT INTO technician_no_response_event (technician_user_id, occurred_at, status) VALUES (${TECH}, NOW() - INTERVAL '1 day', 'active')`);
    await db.execute(sql`INSERT INTO technician_no_response_event (technician_user_id, occurred_at, status) VALUES (${TECH}, NOW() - INTERVAL '3 days', 'active')`);
    await db.execute(sql`INSERT INTO technician_no_response_event (technician_user_id, occurred_at, status) VALUES (${TECH}, NOW() - INTERVAL '20 days', 'active')`);
    await db.execute(sql`INSERT INTO technician_no_response_event (technician_user_id, occurred_at, status, pardon_reason) VALUES (${TECH}, NOW() - INTERVAL '5 days', 'pardoned', 'test')`);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM "user" WHERE id = ${TECH}`);
    await db.execute(sql`DELETE FROM organization WHERE id = ${ORG}`);
    if (prevFlag === undefined) delete process.env.AVAILABILITY_UI_TECNICO_ENABLED;
    else process.env.AVAILABILITY_UI_TECNICO_ENABLED = prevFlag;
  });

  it('getMyAvailabilityStatusAction: enabled + nivel 2 por 2 activas en ventana', async () => {
    const res = await getMyAvailabilityStatusAction();
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.enabled).toBe(true);
    expect(res.availability?.levelGlobal).toBe(true);
    expect(res.level.count).toBe(2);
    expect(res.level.level).toBe(2);
    expect(typeof res.pendingCount).toBe('number');
  });

  it('getResponseHistoryAction clasifica Activa / Fuera de ventana / Perdonada', async () => {
    const res = await getResponseHistoryAction(TECH);
    expect(res.success).toBe(true);
    if (!res.success) return;
    const counts = res.items.reduce<Record<string, number>>((a, i) => {
      a[i.windowStatus] = (a[i.windowStatus] ?? 0) + 1;
      return a;
    }, {});
    expect(counts['Activa']).toBe(2);
    expect(counts['Fuera de ventana']).toBe(1);
    expect(counts['Perdonada']).toBe(1);
  });
});
