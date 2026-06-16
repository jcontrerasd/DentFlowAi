/**
 * One-time / idempotent — taxonomía worktypes v5.13.
 * La migración principal corre en runtime vía infrastructure.ts (INFRA_VERSION=v5.13).
 * Este script es útil para re-ejecutar backfill manual en staging.
 *
 * Uso: npx tsx frontend/scripts/migrate-worktype-taxonomy-v513.ts
 */
import { db } from '../lib/db';
import { ensureInfrastructure } from '../lib/db/infrastructure';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('--- migrate-worktype-taxonomy-v5.13 ---');
  await ensureInfrastructure(db);

  await db.execute(sql`
    UPDATE technician_availability
    SET
      cat_carillas_cad = cat_inlays_cad,
      cat_carillas_cam = cat_inlays_cam,
      cat_full_arch_cad = cat_puentes_cad,
      cat_full_arch_cam = cat_puentes_cam
    WHERE cat_carillas_cad IS DISTINCT FROM cat_inlays_cad
       OR cat_carillas_cam IS DISTINCT FROM cat_inlays_cam
       OR cat_full_arch_cad IS DISTINCT FROM cat_puentes_cad
       OR cat_full_arch_cam IS DISTINCT FROM cat_puentes_cam;
  `);

  console.log('Backfill technician_availability (carillas ← inlays, full_arch ← puentes) OK.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
