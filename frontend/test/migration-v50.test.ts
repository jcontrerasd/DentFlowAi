/**
 * Integración BD — Migración v5.0 (modelo de disponibilidad, sanción rolling, cola pool).
 * Requiere RUN_DB_INTEGRATION_TESTS=true y DATABASE_URL (Docker local).
 *
 * Verifica:
 *  - Las 4 tablas nuevas existen.
 *  - Los catálogos de rechazo tienen su seed (7 + 5).
 *  - fauchard_config activa expone las columnas nuevas con sus defaults.
 *  - El backfill de technician_availability infiere CAD/CAM desde technician_skill.
 *  - Re-correr ensureInfrastructure es idempotente (no duplica ni falla).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

// Usuarios de prueba con ids namespaced para limpiar sin tocar datos reales.
const TECH_WITH_SKILL = 'test-v50-tech-skilled';
const TECH_NO_SKILL = 'test-v50-tech-degenerate';
const TEST_ORG_ID = '00000000-0000-0000-0000-0000005000aa';

async function forceInfra() {
  // Resetear el flag global para forzar la re-ejecución completa (idempotente).
  (global as unknown as { infrastructureChecked?: string }).infrastructureChecked = undefined;
  await ensureInfrastructure(db);
}

describe.runIf(runIntegration)('migración v5.0', () => {
  beforeAll(async () => {
    await ensureInfrastructure(db);
    await db.execute(sql`
      INSERT INTO organization (id, name, rut, type, is_active)
      VALUES (${TEST_ORG_ID}, 'Test v50 Org', 'test-v50-rut', 'clinica', true)
      ON CONFLICT (id) DO NOTHING
    `);
  });

  afterAll(async () => {
    // Cascade borra users → availability + skills de los técnicos de prueba.
    await db.execute(sql`DELETE FROM "user" WHERE id IN (${TECH_WITH_SKILL}, ${TECH_NO_SKILL})`);
    await db.execute(sql`DELETE FROM organization WHERE id = ${TEST_ORG_ID}`);
  });

  it('crea las 4 tablas nuevas', async () => {
    const rows = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN (
        'technician_availability', 'technician_no_response_event',
        'invitation_rejection_reason', 'bulk_rejection_reason'
      )
    `);
    const names = Array.from(rows).map((r: any) => r.table_name).sort();
    expect(names).toEqual([
      'bulk_rejection_reason',
      'invitation_rejection_reason',
      'technician_availability',
      'technician_no_response_event',
    ]);
  });

  it('seed de catálogos de rechazo: 7 individuales + 5 masivos', async () => {
    const [ind]: any = await db.execute(sql`SELECT count(*)::int AS n FROM invitation_rejection_reason`);
    const [bulk]: any = await db.execute(sql`SELECT count(*)::int AS n FROM bulk_rejection_reason`);
    expect(ind.n).toBe(7);
    expect(bulk.n).toBe(5);

    // Codes opacos esperados presentes.
    const [otroInd]: any = await db.execute(sql`SELECT label FROM invitation_rejection_reason WHERE code = 'rej_007'`);
    expect(otroInd.label).toBe('Otro');
  });

  it('fauchard_config activa tiene las columnas nuevas con defaults', async () => {
    const [cfg]: any = await db.execute(sql`
      SELECT t_dentist_review_hours, t_no_eligible_pool_hours, max_pool_cycles,
             replacement_cutoff_minutes, no_response_window_days, no_response_rehabilitation_days,
             level_1_threshold, level_2_threshold, level_3_threshold,
             inactivity_auto_off_days, inactivity_reminder_days, alpha_no_response
      FROM fauchard_config WHERE is_active = true LIMIT 1
    `);
    expect(cfg.t_dentist_review_hours).toBe(48);
    expect(cfg.t_no_eligible_pool_hours).toBe(24);
    expect(cfg.max_pool_cycles).toBe(2);
    expect(cfg.replacement_cutoff_minutes).toBe(10);
    expect(cfg.no_response_window_days).toBe(14);
    expect(cfg.no_response_rehabilitation_days).toBe(30);
    expect(cfg.level_1_threshold).toBe(1);
    expect(cfg.level_2_threshold).toBe(2);
    expect(cfg.level_3_threshold).toBe(3);
    expect(cfg.inactivity_auto_off_days).toBe(30);
    expect(cfg.inactivity_reminder_days).toBe(7);
    expect(Number(cfg.alpha_no_response)).toBeCloseTo(0.25, 3);
  });

  it('backfill infiere CAD/CAM desde technician_skill (flag ON)', async () => {
    // Técnico con skill de diseño (design_level=5, sin fabricación).
    await db.execute(sql`
      INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES
        (${TECH_WITH_SKILL}, ${TECH_WITH_SKILL + '@test.local'}, 'tecnico', ${TEST_ORG_ID}, true)
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level)
      VALUES (${TECH_WITH_SKILL}, 'corona_anterior', 5, 0)
      ON CONFLICT (user_id, work_type) DO NOTHING
    `);
    // Técnico degenerado: tiene skills pero todos en nivel 0 (sin capacidad CAD/CAM).
    // Debe tener al menos un skill para que la migración S0-09 (que auto-asigna
    // design_level=1 a técnicos SIN ningún skill) no lo "rescate".
    await db.execute(sql`
      INSERT INTO "user" (id, email, role, organization_id, is_active) VALUES
        (${TECH_NO_SKILL}, ${TECH_NO_SKILL + '@test.local'}, 'tecnico', ${TEST_ORG_ID}, true)
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level)
      VALUES (${TECH_NO_SKILL}, 'corona_anterior', 0, 0)
      ON CONFLICT (user_id, work_type) DO NOTHING
    `);

    const prev = process.env.AVAILABILITY_MODEL_ENABLED;
    process.env.AVAILABILITY_MODEL_ENABLED = 'true';
    try {
      await forceInfra();
    } finally {
      if (prev === undefined) delete process.env.AVAILABILITY_MODEL_ENABLED;
      else process.env.AVAILABILITY_MODEL_ENABLED = prev;
    }

    const [skilled]: any = await db.execute(sql`
      SELECT level_global, level_cad, level_cam FROM technician_availability WHERE user_id = ${TECH_WITH_SKILL}
    `);
    expect(skilled.level_global).toBe(true);
    expect(skilled.level_cad).toBe(true);
    expect(skilled.level_cam).toBe(false);

    const [degenerate]: any = await db.execute(sql`
      SELECT level_global, level_cad, level_cam FROM technician_availability WHERE user_id = ${TECH_NO_SKILL}
    `);
    expect(degenerate.level_global).toBe(true);
    expect(degenerate.level_cad).toBe(false);
    expect(degenerate.level_cam).toBe(false);
  });

  it('re-correr ensureInfrastructure es idempotente (sin duplicar seeds)', async () => {
    await forceInfra();
    const [ind]: any = await db.execute(sql`SELECT count(*)::int AS n FROM invitation_rejection_reason`);
    const [bulk]: any = await db.execute(sql`SELECT count(*)::int AS n FROM bulk_rejection_reason`);
    expect(ind.n).toBe(7);
    expect(bulk.n).toBe(5);
  });
});
