/**
 * @deprecated Reemplazado por `migrate-recovery-v39.ts`. NO ejecutar en DBs que ya pasaron
 * por el reordenamiento de v3.7→v3.9. Se conserva por trazabilidad.
 *
 * Migración one-time: catálogos → codes opacos + business_key.
 *
 * Convierte el esquema previo (code = slug semántico) al definitivo:
 *  - `code` queda como identificador opaco system-generated: `mat_001`, `vita_001`, `rest_001`, `urg_001`.
 *  - `business_key` (nullable, unique) guarda el slug semántico solo para tablas con lógica de negocio
 *    (restoration_type y urgency_level). Para dental_material y vita_shade queda null.
 *
 * Idempotente: detecta si ya corrió (codes con prefijo correcto) y aborta sin tocar nada.
 *
 * Uso:
 *   cd frontend
 *   npx tsx scripts/migrate-catalogs-opaque-codes.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

type RenamePlan = {
  table: string;
  prefix: string;
  /** Si true, copia el code legacy a business_key antes de renombrar. */
  preserveBusinessKey: boolean;
};

const PLANS: RenamePlan[] = [
  { table: 'vita_shade',       prefix: 'vita', preserveBusinessKey: false },
  { table: 'restoration_type', prefix: 'rest', preserveBusinessKey: true  },
  { table: 'dental_material',  prefix: 'mat',  preserveBusinessKey: false },
  { table: 'urgency_level',    prefix: 'urg',  preserveBusinessKey: true  },
];

async function main() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('🔧 Migración catálogos → codes opacos + business_key\n');

  try {
    await db.transaction(async (tx) => {
      for (const plan of PLANS) {
        // Asegurar columna business_key (idempotente)
        await tx.execute(sql.raw(`ALTER TABLE ${plan.table} ADD COLUMN IF NOT EXISTS business_key text;`));
        await tx.execute(sql.raw(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${plan.table}_business_key_uidx ON ${plan.table}(business_key) WHERE business_key IS NOT NULL;`
        ));

        // Detectar si ya fue migrada (todos los codes con el prefijo correcto)
        const check: any = await tx.execute(sql.raw(
          `SELECT COUNT(*) FILTER (WHERE code LIKE '${plan.prefix}_%') AS opaque,
                  COUNT(*) AS total
           FROM ${plan.table}`
        ));
        const row = check.rows?.[0] ?? check[0];
        const opaqueCount = Number(row?.opaque ?? 0);
        const totalCount = Number(row?.total ?? 0);
        if (totalCount > 0 && opaqueCount === totalCount) {
          console.log(`⏭  ${plan.table}: ya está migrada (${totalCount} filas con prefijo '${plan.prefix}_').`);
          continue;
        }

        // Preservar code legacy → business_key (solo restoration_type / urgency_level)
        if (plan.preserveBusinessKey) {
          await tx.execute(sql.raw(
            `UPDATE ${plan.table}
             SET business_key = code, updated_at = NOW()
             WHERE business_key IS NULL AND code NOT LIKE '${plan.prefix}_%'`
          ));
        }

        // Renombrar code a opaco (basado en sort_order). Staging temporal evita
        // colisiones del UNIQUE(code) durante el UPDATE.
        await tx.execute(sql.raw(
          `UPDATE ${plan.table}
           SET code = '${plan.prefix}_TMP_' || id::text, updated_at = NOW()
           WHERE code NOT LIKE '${plan.prefix}_%'`
        ));
        await tx.execute(sql.raw(
          `WITH ord AS (
             SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) AS rn FROM ${plan.table}
           )
           UPDATE ${plan.table} t
           SET code = '${plan.prefix}_' || lpad(ord.rn::text, 3, '0'),
               updated_at = NOW()
           FROM ord
           WHERE t.id = ord.id`
        ));
        console.log(`✓ ${plan.table}: codes renombrados a '${plan.prefix}_001'..N${plan.preserveBusinessKey ? ' + business_key preservado' : ''}`);
      }
    });
    console.log('\n✅ Migración completada con éxito.');
  } catch (err) {
    console.error('❌ Error en migración, ROLLBACK:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();
