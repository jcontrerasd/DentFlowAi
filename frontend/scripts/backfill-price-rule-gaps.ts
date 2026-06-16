/**
 * Backfill de reglas base R·U·*·* faltantes en price_rule.
 *
 * Uso:
 *   cd frontend && npx tsx scripts/backfill-price-rule-gaps.ts
 *   cd frontend && npx tsx scripts/backfill-price-rule-gaps.ts --apply --reason "Backfill huecos R·U·*·*"
 *   cd frontend && npx tsx scripts/backfill-price-rule-gaps.ts --apply --reason "..." --actor-id <uuid-admin>
 *
 * Requisitos: DATABASE_URL en .env.local, infra v5.8+.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import {
  dentalMaterial,
  priceRule,
  priceRuleChangeEvent,
  restorationType,
  urgencyLevel,
  user,
  vitaShade,
} from '../lib/db/schema';
import {
  findMissingBaseRules,
  findUnresolvedWizardCombinations,
  proposeBaseRulePricing,
  type PriceCatalogs,
} from '../lib/pricing/priceRuleCoverage';
import { computeSalePrice, type PriceRuleRow } from '../lib/pricing/resolveListPrice';
import { nextPriceRuleCode } from '../lib/pricing/priceRuleCode';
import {
  buildCreatedFieldEntries,
  rowToAuditSnapshot,
  validateChangeReason,
} from '../lib/pricing/priceRuleAudit';

const APPLY = process.argv.includes('--apply');

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const REASON = argValue('--reason');
const ACTOR_ID = argValue('--actor-id');

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

async function resolveActorId(db: typeof import('../lib/db').db): Promise<string> {
  if (ACTOR_ID) return ACTOR_ID;
  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, 'admin'))
    .limit(1);
  if (!admin) {
    throw new Error('No hay usuario admin en BD. Pasa --actor-id <uuid>.');
  }
  return admin.id;
}

function formatCLP(n: number): string {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

async function main() {
  const { db } = await import('../lib/db');

  console.log('--- Backfill price_rule (R·U·*·*) ---');
  console.log(`Modo: ${APPLY ? 'APPLY (escribe BD)' : 'DRY-RUN (solo reporte)'}`);

  const catalogs = await loadCatalogs(db);
  const ruleRows = await db.select().from(priceRule);
  const rules = toPriceRuleRows(ruleRows);
  const activeRules = rules.filter((r) => r.isActive);

  const missing = findMissingBaseRules(catalogs, rules);
  const unresolvedBefore = findUnresolvedWizardCombinations(catalogs, rules);

  console.log(`\nCatálogos activos: ${catalogs.restorations.length} rest × ${catalogs.urgencies.length} urg`);
  console.log(`Reglas activas en BD: ${activeRules.length}`);
  console.log(`Combinaciones base faltantes (R·U·*·*): ${missing.length}`);
  console.log(`Combinaciones wizard sin resolver (antes): ${unresolvedBefore.length}`);

  if (missing.length === 0) {
    console.log('\n✓ No hay huecos base. Nada que insertar.');
    process.exit(0);
  }

  const proposals = missing.map((m) => ({
    ...m,
    pricing: proposeBaseRulePricing(m, catalogs, rules),
  }));

  console.log('\nReglas a insertar:');
  console.log('─'.repeat(90));
  for (const p of proposals) {
    console.log(
      `${p.restorationLabel.padEnd(22)} | ${p.urgencyLabel.padEnd(8)} | * | * | costo ${formatCLP(p.pricing.cost)} | fee ${(p.pricing.feePercent * 100).toFixed(0)}% | venta ${formatCLP(p.pricing.salePrice)} | ${p.pricing.source}`,
    );
  }
  console.log('─'.repeat(90));

  if (!APPLY) {
    console.log('\nDry-run completo. Ejecuta con --apply --reason "..." para persistir.');
    process.exit(0);
  }

  const reasonErr = validateChangeReason(REASON);
  if (reasonErr) {
    console.error(`\nError: ${reasonErr}`);
    console.error('Ejemplo: --apply --reason "Backfill R·U·*·* huecos"');
    process.exit(1);
  }

  const actorId = await resolveActorId(db);
  const trimmedReason = REASON!.trim();

  let inserted = 0;
  await db.transaction(async (tx) => {
    const existingCodes = (await tx.select({ code: priceRule.code }).from(priceRule)).map((r) => r.code);
    let codeSeq = existingCodes;

    for (const p of proposals) {
      const dup = activeRules.find(
        (r) =>
          r.isActive &&
          r.restorationTypeId === p.restorationTypeId &&
          r.urgencyId === p.urgencyId &&
          r.materialId == null &&
          r.shadeId == null,
      );
      if (dup) continue;

      const code = nextPriceRuleCode(codeSeq);
      codeSeq = [...codeSeq, code];
      const salePrice = p.pricing.salePrice || computeSalePrice(p.pricing.cost, p.pricing.feePercent);

      const [insertedRow] = await tx
        .insert(priceRule)
        .values({
          code,
          restorationTypeId: p.restorationTypeId,
          materialId: null,
          shadeId: null,
          urgencyId: p.urgencyId,
          cost: String(p.pricing.cost),
          feePercent: String(p.pricing.feePercent),
          salePrice: String(salePrice),
          sortOrder: 0,
          isActive: true,
          updatedAt: new Date(),
        })
        .returning();

      const snapshot = rowToAuditSnapshot(insertedRow);
      const entries = buildCreatedFieldEntries(snapshot);
      if (entries.length > 0) {
        await tx.insert(priceRuleChangeEvent).values(
          entries.map((entry) => ({
            ruleId: insertedRow.id,
            changedBy: actorId,
            action: 'created' as const,
            fieldKey: entry.fieldKey,
            oldValue: entry.oldValue,
            newValue: entry.newValue,
            changeReason: trimmedReason,
            context: { source: 'backfill-price-rule-gaps', pricingSource: p.pricing.source },
            createdAt: new Date(),
          })),
        );
      }

      inserted++;
      console.log(`  + ${code} → ${p.restorationLabel} · ${p.urgencyLabel} · * · *`);
    }
  });

  const rulesAfter = toPriceRuleRows(await db.select().from(priceRule));
  const unresolvedAfter = findUnresolvedWizardCombinations(catalogs, rulesAfter);

  console.log(`\nInsertadas: ${inserted}`);
  console.log(`Combinaciones wizard sin resolver (después): ${unresolvedAfter.length}`);

  if (unresolvedAfter.length > 0) {
    console.warn('\n⚠ Aún quedan combinaciones sin resolver (muestra hasta 5):');
    for (const u of unresolvedAfter.slice(0, 5)) {
      console.warn(`  - ${u.restorationLabel} · ${u.materialLabel} · ${u.shadeLabel} · ${u.urgencyLabel}`);
    }
    process.exit(1);
  }

  console.log('\n--- Backfill completado con éxito ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error en backfill-price-rule-gaps:', err);
  process.exit(1);
});
