/**
 * Integración BD — mantenimiento de disponibilidad (v5.0/v5.1, Fase 6).
 * Requiere RUN_DB_INTEGRATION_TESTS=true. Mockea notifyUser para no enviar emails.
 *
 * Verifica auto-OFF preventivo (>inactivityAutoOffDays sin login) y recordatorio
 * (>inactivityReminderDays) idempotente sobre técnicos con switch global ON.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn(async () => ({ success: true })),
}));

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import { processAvailabilityMaintenanceAction } from '@/lib/db/actions/availabilityCron';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000006006aa';
const OLD = 'test-f6-old-tech';      // inactivo > auto-off → auto-OFF
const MID = 'test-f6-mid-tech';      // inactivo entre reminder y auto-off → recordatorio
const FRESH = 'test-f6-fresh-tech';  // activo → sin cambios

async function seed(id: string, daysSinceLogin: number) {
  await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'F6 Org', 'rut-f6', 'clinica', true) ON CONFLICT (id) DO NOTHING`);
  const login = new Date(Date.now() - daysSinceLogin * 86_400_000).toISOString();
  await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active, last_login_at)
    VALUES (${id}, ${id + '@t.local'}, 'tecnico', ${ORG}, true, ${login}) ON CONFLICT (id) DO UPDATE SET last_login_at = ${login}`);
  await db.execute(sql`INSERT INTO technician_availability (user_id, level_global, inactivity_reminder_sent_at)
    VALUES (${id}, true, NULL) ON CONFLICT (user_id) DO UPDATE SET level_global = true, inactivity_reminder_sent_at = NULL`);
}

describe.runIf(runIntegration)('process-availability — mantenimiento (Fase 6)', () => {

  beforeAll(async () => {
    await ensureInfrastructure(db);
    await seed(OLD, 40);
    await seed(MID, 12);
    await seed(FRESH, 1);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM technician_availability WHERE user_id IN (${OLD}, ${MID}, ${FRESH})`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${OLD}, ${MID}, ${FRESH})`);
    await db.execute(sql`DELETE FROM organization WHERE id = ${ORG}`);
  });

  it('auto-OFF preventivo apaga el switch del técnico muy inactivo', async () => {
    const res = await processAvailabilityMaintenanceAction();
    expect(res.success).toBe(true);

    const [old]: any = await db.execute(sql`SELECT level_global FROM technician_availability WHERE user_id = ${OLD}`);
    expect(old.level_global).toBe(false);

    const [fresh]: any = await db.execute(sql`SELECT level_global FROM technician_availability WHERE user_id = ${FRESH}`);
    expect(fresh.level_global).toBe(true);
  });

  it('recordatorio marca inactivity_reminder_sent_at sin apagar el switch (idempotente)', async () => {
    // El run anterior ya envió el recordatorio al técnico MID.
    const [mid]: any = await db.execute(sql`SELECT level_global, inactivity_reminder_sent_at FROM technician_availability WHERE user_id = ${MID}`);
    expect(mid.level_global).toBe(true);
    expect(mid.inactivity_reminder_sent_at).not.toBeNull();

    // Segunda corrida: no re-marca (mismo timestamp) porque no hubo nueva actividad.
    const before = mid.inactivity_reminder_sent_at;
    await processAvailabilityMaintenanceAction();
    const [mid2]: any = await db.execute(sql`SELECT inactivity_reminder_sent_at FROM technician_availability WHERE user_id = ${MID}`);
    expect(new Date(mid2.inactivity_reminder_sent_at).getTime()).toBe(new Date(before).getTime());
  });

});
