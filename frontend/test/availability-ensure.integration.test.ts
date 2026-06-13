/**
 * Integración BD — garantía de fila `technician_availability` por técnico (capas 1 + 2).
 * Requiere RUN_DB_INTEGRATION_TESTS=true y DATABASE_URL (Docker local).
 *
 * Verifica que ningún técnico quede excluido por carecer de fila:
 *  - Helper `ensureTechnicianAvailabilityAction` (crea default idempotente, infiere CAD/CAM).
 *  - Capa 1: `updateSkillsAction` siembra la fila al declarar skills.
 *  - Solo aplica a usuarios con rol `tecnico` (no crea fila a otros roles).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql, eq } from 'drizzle-orm';
import { technicianAvailability } from '@/lib/db/schema';
import {
  ensureTechnicianAvailabilityAction,
  computeEligibleAction,
} from '@/lib/db/actions/availability';
import { updateSkillsAction } from '@/lib/db/actions/skills';
import { forceIdentity, clearForcedIdentity } from './helpers/test-identity';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000a5e00001';
const TECH_HELPER = 'test-ensure-tech-helper';   // self-heal vía helper
const TECH_SEED = 'test-ensure-tech-seed';        // Capa 1 vía updateSkillsAction
const DENTIST = 'test-ensure-dentist';            // rol no técnico (no debe crear fila)

async function getRow(userId: string) {
  const [row] = await db.select().from(technicianAvailability).where(eq(technicianAvailability.userId, userId)).limit(1);
  return row ?? null;
}

describe.runIf(runIntegration)('ensure technician_availability (capas 1 + 2)', () => {
  beforeAll(async () => {
    await ensureInfrastructure(db);
    await db.execute(sql`INSERT INTO organization (id, name, rut, type, is_active) VALUES (${ORG}, 'Ensure Org', 'rut-ensure', 'laboratorio', true) ON CONFLICT (id) DO NOTHING`);
    for (const t of [TECH_HELPER, TECH_SEED]) {
      await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${t}, ${t + '@t.local'}, 'tecnico', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
    }
    await db.execute(sql`INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES (${DENTIST}, ${DENTIST + '@t.local'}, 'dentista', ${ORG}, true) ON CONFLICT (id) DO NOTHING`);
    // TECH_HELPER tiene un skill CAD (design>0) para inferir level_cad=true.
    await db.execute(sql`INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level) VALUES (${TECH_HELPER}, 'corona_anterior', 3, 0) ON CONFLICT (user_id, work_type) DO UPDATE SET design_level = 3, fabrication_level = 0`);
    // Estado limpio: sin filas de disponibilidad para los tres usuarios.
    await db.execute(sql`DELETE FROM technician_availability WHERE user_id IN (${TECH_HELPER}, ${TECH_SEED}, ${DENTIST})`);
  });

  afterAll(async () => {
    clearForcedIdentity();
    await db.execute(sql`DELETE FROM technician_availability WHERE user_id IN (${TECH_HELPER}, ${TECH_SEED}, ${DENTIST})`);
    await db.execute(sql`DELETE FROM technician_skill WHERE user_id IN (${TECH_HELPER}, ${TECH_SEED})`);
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH_HELPER}, ${TECH_SEED}, ${DENTIST})`);
    await db.execute(sql`DELETE FROM organization WHERE id = ${ORG}`);
  });

  it('helper crea la fila default (global ON, CAD inferido) y es idempotente', async () => {
    expect(await getRow(TECH_HELPER)).toBeNull();

    const r1 = await ensureTechnicianAvailabilityAction(TECH_HELPER);
    expect(r1.success).toBe(true);

    const row = await getRow(TECH_HELPER);
    expect(row).not.toBeNull();
    expect(row?.levelGlobal).toBe(true);
    expect(row?.levelCad).toBe(true);   // tiene skill design>0
    expect(row?.levelCam).toBe(false);  // sin skill fabricación

    // La fila nace elegible (cat_* default TRUE).
    expect(await computeEligibleAction(TECH_HELPER, 'coronas', 'cad')).toBe(true);

    // Idempotente: segunda llamada no falla ni duplica.
    const r2 = await ensureTechnicianAvailabilityAction(TECH_HELPER);
    expect(r2.success).toBe(true);
    const count = await db.select().from(technicianAvailability).where(eq(technicianAvailability.userId, TECH_HELPER));
    expect(count.length).toBe(1);
  });

  it('Capa 1: updateSkillsAction siembra la fila al declarar skills', async () => {
    expect(await getRow(TECH_SEED)).toBeNull();

    forceIdentity({ id: TECH_SEED, role: 'tecnico', orgId: ORG });
    const res = await updateSkillsAction([
      { workType: 'corona_anterior', designLevel: 4 },
    ]);
    clearForcedIdentity();
    expect(res.success).toBe(true);

    const row = await getRow(TECH_SEED);
    expect(row).not.toBeNull();
    expect(row?.levelGlobal).toBe(true);
    expect(row?.levelCad).toBe(true);   // design>0 recién guardado
    expect(row?.levelCam).toBe(false);
  });

  it('no crea fila para usuarios que no son técnicos', async () => {
    const r = await ensureTechnicianAvailabilityAction(DENTIST);
    expect(r.success).toBe(true);
    expect(await getRow(DENTIST)).toBeNull();
  });
});
