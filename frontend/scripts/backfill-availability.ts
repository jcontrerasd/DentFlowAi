/**
 * One-time backfill de `technician_availability` (v5.0, Fase 7).
 *
 * Inserta una fila de disponibilidad por técnico, infiriendo CAD/CAM desde
 * `technician_skill` (EXISTS con design_level > 0 / fabrication_level > 0).
 * Categorías quedan todo ON (default de la tabla). Caso degenerado (sin skills):
 * global ON, CAD/CAM OFF. Idempotente: `ON CONFLICT (user_id) DO NOTHING` — se
 * puede re-ejecutar sin daño si se interrumpe.
 *
 * Uso (apuntando .env.local a la BD destino — confirmar antes de correr en prod):
 *   cd frontend && npx tsx scripts/backfill-availability.ts
 *
 * NO corre en el deploy. Se ejecuta manualmente, una sola vez, en la activación.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/db');
  const { ensureInfrastructure } = await import('../lib/db/infrastructure');
  const { sql } = await import('drizzle-orm');

  console.log('--- Backfill technician_availability (v5.0) ---');
  await ensureInfrastructure(db);

  const [{ n: techTotal }]: any = await db.execute(
    sql`SELECT count(*)::int AS n FROM "user" WHERE role = 'tecnico'`,
  );
  console.log(`Técnicos totales: ${techTotal}`);

  // Idéntico al backfill condicional de infrastructure.ts (aquí siempre corre).
  await db.execute(sql`
    INSERT INTO technician_availability (user_id, level_global, level_cad, level_cam)
    SELECT
      u.id,
      TRUE,
      EXISTS (SELECT 1 FROM technician_skill ts WHERE ts.user_id = u.id AND ts.design_level > 0),
      EXISTS (SELECT 1 FROM technician_skill ts WHERE ts.user_id = u.id AND ts.fabrication_level > 0)
    FROM "user" u
    WHERE u.role = 'tecnico'
    ON CONFLICT (user_id) DO NOTHING;
  `);

  // Reporte sobre el estado resultante (filas de técnicos).
  const [stats]: any = await db.execute(sql`
    SELECT
      count(*)::int AS rows,
      count(*) FILTER (WHERE ta.level_cad)::int AS cad_on,
      count(*) FILTER (WHERE ta.level_cam)::int AS cam_on,
      count(*) FILTER (WHERE NOT ta.level_cad AND NOT ta.level_cam)::int AS degenerate
    FROM technician_availability ta
    JOIN "user" u ON u.id = ta.user_id AND u.role = 'tecnico'
  `);

  console.log(`Filas de disponibilidad (técnicos): ${stats.rows}`);
  console.log(`  CAD ON:        ${stats.cad_on}`);
  console.log(`  CAM ON:        ${stats.cam_on}`);
  console.log(`  Degenerados:   ${stats.degenerate} (sin skills → global ON, CAD/CAM OFF)`);
  console.log('--- Backfill completado ---');
  process.exit(0);
}

main().catch((e) => {
  console.error('[backfill-availability] Error:', e);
  process.exit(1);
});
