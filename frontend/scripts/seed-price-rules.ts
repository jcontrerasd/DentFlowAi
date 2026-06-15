/**
 * Seed de reglas de precio: restauración × urgencia (material y color = comodín *).
 *
 * Modelo de cascada (admin): Restauración → Urgencia → Material → Color, sin huecos.
 * Este seed produce el patrón R·U·*·* (válido): cada par rest×urg con material/color NULL.
 *
 * Uso:
 *   cd frontend && npx tsx scripts/seed-price-rules.ts          # solo inserta faltantes
 *   cd frontend && npx tsx scripts/seed-price-rules.ts --reset  # borra todo y re-seed
 *
 * Requisitos: DATABASE_URL en .env.local, infra v5.8+ (tabla price_rule).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { computeSalePrice } from '../lib/pricing/resolveListPrice';
import { isLegacyInvalidRule } from '../lib/pricing/priceRuleDimensions';

const SEED_COST = 5000;
const SEED_FEE_PERCENT = 0.15;
const SEED_SALE_PRICE = computeSalePrice(SEED_COST, SEED_FEE_PERCENT);
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const RESET = process.argv.includes('--reset');

async function resetPriceRules(db: { execute: (q: string | import('drizzle-orm').SQLWrapper) => Promise<unknown> }, sql: typeof import('drizzle-orm').sql) {
  console.log('--- Reset: borrando todas las reglas de precio ---');

  await db.execute(sql`
    UPDATE price_rule_request SET resolved_rule_id = NULL WHERE resolved_rule_id IS NOT NULL
  `);
  await db.execute(sql`
    UPDATE clinical_case SET list_price_rule_id = NULL WHERE list_price_rule_id IS NOT NULL
  `);
  await db.execute(sql`DELETE FROM price_rule_request WHERE status = 'pending'`);
  const deleted = await db.execute(sql`DELETE FROM price_rule`) as { rowCount?: number };

  console.log(`Reglas eliminadas: ${deleted.rowCount ?? 'todas'}`);
}

async function seedPriceRules() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('--- Seed de price_rule (R·U·*·* — rest × urg, cascada sin huecos) ---');
  console.log(`Costo: ${SEED_COST} | Fee: ${SEED_FEE_PERCENT * 100}% | Venta: ${SEED_SALE_PRICE}`);

  const legacyRows = await db.execute(sql`
    SELECT id, restoration_type_id, urgency_id, material_id, shade_id
    FROM price_rule WHERE is_active = TRUE
  `) as Array<{
    id: string;
    restoration_type_id: string | null;
    urgency_id: string | null;
    material_id: string | null;
    shade_id: string | null;
  }>;
  const legacyCount = legacyRows.filter((r) =>
    isLegacyInvalidRule({
      restorationTypeId: r.restoration_type_id,
      urgencyId: r.urgency_id,
      materialId: r.material_id,
      shadeId: r.shade_id,
    }),
  ).length;
  if (legacyCount > 0) {
    console.warn(`⚠ ${legacyCount} regla(s) activa(s) con dimensiones fuera del modelo cascada — revisar en Admin → Precios.`);
  }

  if (RESET) {
    await resetPriceRules(db, sql);
  }

  const catalogCounts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM restoration_type WHERE is_active) AS restorations,
      (SELECT COUNT(*)::int FROM urgency_level WHERE is_active) AS urgencies
  `) as Array<{ restorations: number; urgencies: number }>;

  const row = catalogCounts[0];
  const expectedTotal = row.restorations * row.urgencies;
  console.log(
    `Catálogos activos: ${row.restorations} rest × ${row.urgencies} urg = ${expectedTotal} reglas esperadas (mat/color = *)`,
  );

  const beforeCount = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM price_rule WHERE is_active = TRUE
  `) as Array<{ n: number }>;
  const countBefore = beforeCount[0]?.n ?? 0;

  await db.execute(sql`
    INSERT INTO price_rule (
      restoration_type_id, material_id, shade_id, urgency_id,
      cost, fee_percent, sale_price, sort_order, is_active, updated_at
    )
    SELECT r.id, NULL, NULL, u.id,
           ${SEED_COST}, ${SEED_FEE_PERCENT}, ${SEED_SALE_PRICE}, 0, TRUE, NOW()
    FROM restoration_type r
    CROSS JOIN urgency_level u
    WHERE r.is_active AND u.is_active
      AND NOT EXISTS (
        SELECT 1 FROM price_rule pr
        WHERE pr.is_active
          AND COALESCE(pr.restoration_type_id, ${NIL_UUID}::uuid) = r.id
          AND COALESCE(pr.material_id, ${NIL_UUID}::uuid) = ${NIL_UUID}::uuid
          AND COALESCE(pr.shade_id, ${NIL_UUID}::uuid) = ${NIL_UUID}::uuid
          AND COALESCE(pr.urgency_id, ${NIL_UUID}::uuid) = u.id
      )
  `);

  const afterCount = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM price_rule WHERE is_active = TRUE
  `) as Array<{ n: number }>;
  const countAfter = afterCount[0]?.n ?? 0;
  const inserted = countAfter - countBefore;
  const skipped = expectedTotal - inserted;

  console.log(`Insertadas: ${inserted}`);
  console.log(`Omitidas (ya existían): ${skipped}`);
  console.log(`Total activas en BD: ${countAfter} (esperado: ${expectedTotal})`);

  if (countAfter < expectedTotal) {
    console.warn(`⚠ Faltan ${expectedTotal - countAfter} reglas — revisa catálogos o reglas inactivas duplicadas.`);
    process.exit(1);
  }

  console.log('--- Seed completado con éxito ---');
  process.exit(0);
}

seedPriceRules().catch((err) => {
  console.error('Error en seed-price-rules:', err);
  process.exit(1);
});
