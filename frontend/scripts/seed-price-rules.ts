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
 * Para backfill incremental con herencia de precios y auditoría, preferir:
 *   npx tsx scripts/backfill-price-rule-gaps.ts --apply --reason "..."
 *
 * Requisitos: DATABASE_URL en .env.local, infra v5.8+ (tabla price_rule).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import {
  dentalMaterial,
  priceRule,
  restorationType,
  urgencyLevel,
  vitaShade,
} from '../lib/db/schema';
import { computeSalePrice, type PriceRuleRow } from '../lib/pricing/resolveListPrice';
import {
  findMissingBaseRules,
  findUnresolvedWizardCombinations,
  PRICE_RULE_SEED_DEFAULTS,
  proposeBaseRulePricing,
  type PriceCatalogs,
} from '../lib/pricing/priceRuleCoverage';
import { nextPriceRuleCode } from '../lib/pricing/priceRuleCode';
import { isLegacyInvalidRule } from '../lib/pricing/priceRuleDimensions';

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

async function loadCatalogs(db: typeof import('../lib/db').db): Promise<PriceCatalogs> {
  const [restorations, materials, shades, urgencies] = await Promise.all([
    db.select({ id: restorationType.id, label: restorationType.label }).from(restorationType).where(eq(restorationType.isActive, true)),
    db.select({ id: dentalMaterial.id, label: dentalMaterial.label }).from(dentalMaterial).where(eq(dentalMaterial.isActive, true)),
    db.select({ id: vitaShade.id, label: vitaShade.label }).from(vitaShade).where(eq(vitaShade.isActive, true)),
    db.select({ id: urgencyLevel.id, label: urgencyLevel.label }).from(urgencyLevel).where(eq(urgencyLevel.isActive, true)),
  ]);
  return { restorations, materials, shades, urgencies };
}

function toPriceRuleRows(rows: (typeof priceRule.$inferSelect)[]): PriceRuleRow[] {
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    restorationTypeId: r.restorationTypeId,
    materialId: r.materialId,
    shadeId: r.shadeId,
    urgencyId: r.urgencyId,
    cost: r.cost,
    feePercent: r.feePercent,
    salePrice: r.salePrice,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
  }));
}

async function seedPriceRules() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('--- Seed de price_rule (R·U·*·* — rest × urg, cascada sin huecos) ---');
  console.log(
    `Costo fallback: ${PRICE_RULE_SEED_DEFAULTS.cost} | Fee: ${PRICE_RULE_SEED_DEFAULTS.feePercent * 100}% | Venta: ${PRICE_RULE_SEED_DEFAULTS.salePrice}`,
  );

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

  const catalogs = await loadCatalogs(db);
  const rules = toPriceRuleRows(await db.select().from(priceRule));
  const missing = findMissingBaseRules(catalogs, rules);
  const expectedTotal = catalogs.restorations.length * catalogs.urgencies.length;

  console.log(
    `Catálogos activos: ${catalogs.restorations.length} rest × ${catalogs.urgencies.length} urg = ${expectedTotal} reglas base esperadas`,
  );
  console.log(`Combinaciones base faltantes: ${missing.length}`);

  if (missing.length === 0) {
    const unresolved = findUnresolvedWizardCombinations(catalogs, rules);
    console.log(`Combinaciones wizard sin resolver: ${unresolved.length}`);
    console.log('--- Seed: nada que insertar ---');
    process.exit(unresolved.length > 0 ? 1 : 0);
  }

  let inserted = 0;
  await db.transaction(async (tx) => {
    const existingCodes = (await tx.select({ code: priceRule.code }).from(priceRule)).map((r) => r.code);
    let codeSeq = existingCodes;

    for (const m of missing) {
      const pricing = proposeBaseRulePricing(m, catalogs, rules);
      const cost = pricing.cost;
      const feePercent = pricing.feePercent;
      const salePrice = pricing.salePrice || computeSalePrice(cost, feePercent);
      const code = nextPriceRuleCode(codeSeq);
      codeSeq = [...codeSeq, code];

      await tx.insert(priceRule).values({
        code,
        restorationTypeId: m.restorationTypeId,
        materialId: null,
        shadeId: null,
        urgencyId: m.urgencyId,
        cost: String(cost),
        feePercent: String(feePercent),
        salePrice: String(salePrice),
        sortOrder: 0,
        isActive: true,
        updatedAt: new Date(),
      });
      inserted++;
    }
  });

  const rulesAfter = toPriceRuleRows(await db.select().from(priceRule));
  const activeAfter = rulesAfter.filter((r) => r.isActive).length;
  const unresolvedAfter = findUnresolvedWizardCombinations(catalogs, rulesAfter);

  console.log(`Insertadas: ${inserted}`);
  console.log(`Total activas en BD: ${activeAfter} (esperado base: ${expectedTotal})`);
  console.log(`Combinaciones wizard sin resolver: ${unresolvedAfter.length}`);

  if (unresolvedAfter.length > 0) {
    console.warn('⚠ Quedan combinaciones wizard sin resolver tras el seed.');
    process.exit(1);
  }

  console.log('--- Seed completado con éxito ---');
  process.exit(0);
}

seedPriceRules().catch((err) => {
  console.error('Error en seed-price-rules:', err);
  process.exit(1);
});
