/**
 * Integración BD — Migración v5.13 (taxonomía worktypes expandida).
 * Requiere RUN_DB_INTEGRATION_TESTS=true y DATABASE_URL (Docker local).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

async function forceInfra() {
  (global as unknown as { infrastructureChecked?: string }).infrastructureChecked = undefined;
  await ensureInfrastructure(db);
}

describe.runIf(runIntegration)('migración v5.13 taxonomía', () => {
  beforeAll(async () => {
    await ensureInfrastructure(db);
  });

  it('clinical_case tiene replaces_missing_teeth y derived_*', async () => {
    const rows = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'clinical_case'
        AND column_name IN ('replaces_missing_teeth', 'derived_work_type', 'derived_category')
      ORDER BY column_name
    `);
    const names = Array.from(rows).map((r) => String((r as { column_name: string }).column_name)).sort();
    expect(names).toEqual(['derived_category', 'derived_work_type', 'replaces_missing_teeth']);
  });

  it('technician_availability tiene cat_carillas_* y cat_full_arch_*', async () => {
    const rows = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'technician_availability'
        AND column_name IN ('cat_carillas_cad', 'cat_carillas_cam', 'cat_full_arch_cad', 'cat_full_arch_cam')
      ORDER BY column_name
    `);
    const names = Array.from(rows).map((r) => String((r as { column_name: string }).column_name)).sort();
    expect(names).toEqual([
      'cat_carillas_cad',
      'cat_carillas_cam',
      'cat_full_arch_cad',
      'cat_full_arch_cam',
    ]);
  });

  it('re-correr ensureInfrastructure es idempotente', async () => {
    await expect(forceInfra()).resolves.toBeUndefined();
    await expect(forceInfra()).resolves.toBeUndefined();
  });
});
