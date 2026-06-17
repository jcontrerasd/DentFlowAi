/**
 * Limpieza one-time de DATOS de casos legacy (integral / solo_fabricacion).
 *
 * La app v2 (asignación directa) solo implementa `solo_diseno`. Este script elimina los
 * casos históricos integral/solo_fabricacion y sus filas dependientes.
 *
 * NOTA: la limpieza de SCHEMA (columnas business_*, quoted_design/fabrication_*, tabla
 * fauchard_holiday) la realiza automáticamente infrastructure.ts en la migración v5.17 al
 * desplegar. Este script solo toca DATOS.
 *
 * Uso:
 *   DRY_RUN=true TARGET=local npx tsx scripts/cleanup-legacy-cases.ts   # diagnóstico, no toca nada
 *   TARGET=local  npx tsx scripts/cleanup-legacy-cases.ts               # BD local Docker
 *   TARGET=dev    npx tsx scripts/cleanup-legacy-cases.ts               # BD staging GCP
 *   TARGET=prod   npx tsx scripts/cleanup-legacy-cases.ts               # BD producción ⚠️
 *
 * Rollback: antes de borrar vuelca un .sql con los INSERT de los casos eliminados
 * (scripts/rollback-legacy-cases-<target>-<ts>.sql). Ejecutar con psql para revertir los casos.
 * (Las filas dependientes de eventos/entregas/asignaciones NO se restauran.)
 */

import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

const DRY_RUN = process.env.DRY_RUN === 'true';
const TARGET = (process.env.TARGET ?? 'local') as 'local' | 'dev' | 'prod';

const DB_URLS: Record<string, string | undefined> = {
  local: process.env.DATABASE_URL,
  dev:   process.env.DATABASE_URL_DEV,
  prod:  process.env.DATABASE_URL_PROD,
};

const url = DB_URLS[TARGET];
if (!url) {
  console.error(`❌ No se encontró DATABASE_URL para TARGET=${TARGET} en .env.local`);
  process.exit(1);
}

console.log(`\n🎯 TARGET=${TARGET} | DRY_RUN=${DRY_RUN}`);
console.log(`   BD: ${url.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')}\n`);

if (TARGET === 'prod' && !DRY_RUN) {
  console.log('⚠️  PRODUCCIÓN + borrado real. 5 segundos para cancelar (Ctrl+C)...');
  await new Promise(r => setTimeout(r, 5000));
}

const sql = postgres(url, { ssl: TARGET !== 'local' ? 'require' : false });

// ─── Diagnóstico ────────────────────────────────────────────────────────────────

const legacyCases = await sql<{ service_type: string; status: string; count: string }[]>`
  SELECT service_type, status, count(*)::text
  FROM clinical_case
  WHERE service_type IN ('integral','solo_fabricacion')
  GROUP BY 1,2 ORDER BY 1,2
`;

if (legacyCases.length === 0) {
  console.log('✅ No hay casos integral/solo_fabricacion — nada que borrar.\n');
  await sql.end();
  process.exit(0);
}
console.log('Casos legacy a eliminar:');
console.table(legacyCases);

// ─── Rollback (dump de los casos) ────────────────────────────────────────────────

const casesToDump = await sql<Record<string, unknown>[]>`
  SELECT * FROM clinical_case
  WHERE service_type IN ('integral','solo_fabricacion') ORDER BY created_at
`;
const cols = Object.keys(casesToDump[0]);
const inserts = casesToDump.map(row => {
  const values = cols.map(c => {
    const v = row[c];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    return `'${String(v).replace(/'/g, "''")}'`;
  }).join(', ');
  return `INSERT INTO clinical_case (${cols.join(', ')}) VALUES (${values}) ON CONFLICT (id) DO NOTHING;`;
}).join('\n');

const rollbackFile = path.join(process.cwd(), `scripts/rollback-legacy-cases-${TARGET}-${Date.now()}.sql`);
fs.writeFileSync(
  rollbackFile,
  `-- ROLLBACK_BEGIN cleanup-legacy-cases TARGET=${TARGET} ${new Date().toISOString()}\nBEGIN;\n${inserts}\nCOMMIT;\n-- ROLLBACK_END\n`,
  'utf8',
);
console.log(`\n✅ Rollback SQL: ${path.basename(rollbackFile)}\n`);

if (DRY_RUN) {
  console.log('DRY_RUN=true — no se ejecutó ningún cambio.\n');
  await sql.end();
  process.exit(0);
}

// ─── Ejecución ───────────────────────────────────────────────────────────────────

await sql.begin(async tx => {
  const ids = casesToDump.map(r => r.id as string);
  await tx`DELETE FROM clinical_case_event    WHERE clinical_case_id = ANY(${ids})`;
  await tx`DELETE FROM clinical_case_delivery  WHERE clinical_case_id = ANY(${ids})`;
  await tx`DELETE FROM case_assignment         WHERE clinical_case_id = ANY(${ids})`;
  await tx`DELETE FROM clinical_case_hub_read  WHERE clinical_case_id = ANY(${ids})`;
  await tx`DELETE FROM review                  WHERE clinical_case_id = ANY(${ids})`;
  await tx`DELETE FROM case_user_archive       WHERE clinical_case_id = ANY(${ids})`;
  const deleted = await tx`
    DELETE FROM clinical_case WHERE service_type IN ('integral','solo_fabricacion') RETURNING id
  `;
  console.log(`✅ Casos legacy eliminados: ${deleted.length}`);
});

console.log(`\n✅ Limpieza de datos completada. Rollback: ${path.basename(rollbackFile)}\n`);
await sql.end();
