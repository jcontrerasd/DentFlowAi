/**
 * Diagnóstico de ContactGuard.
 * Imprime: cantidad de reglas activas, sus patterns crudos, intenta compilarlas
 * y prueba contra textos sospechosos para confirmar si bloquean o no.
 *
 * Uso: npx tsx scripts/diag-contact-guard.ts
 */
import 'dotenv/config';
import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local' });

import postgres from 'postgres';

const SAMPLES = [
  'sali@ggg.cl',
  'dddd@ddd.cl',
  'jaime@gmail.com',
  'gmail.com',
  '5699993344',
  'http://localhost:3000/x',
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no configurada');

  const sql = postgres(url, { prepare: false });

  const rules: Array<{
    id: string;
    type: string;
    name: string;
    pattern: string;
    flags: string | null;
    is_active: boolean;
  }> = await sql`
    SELECT id, type, name, pattern, flags, is_active
    FROM contact_guard_rule
    ORDER BY type, name;
  `;

  const active = rules.filter((r) => r.is_active);
  console.log(`\n=== contact_guard_rule ===`);
  console.log(`Total: ${rules.length} (activas: ${active.length})`);
  console.log();

  for (const r of active) {
    const status = ['regex', 'keyword'].includes(r.type) ? '' : '⚠ tipo desconocido';
    console.log(`[${r.type}] ${r.name}  ${status}`);
    console.log(`  pattern: ${JSON.stringify(r.pattern)}`);
    console.log(`  flags:   ${r.flags}`);

    if (r.type === 'regex') {
      try {
        const flags = (r.flags ?? 'i').includes('g') ? (r.flags ?? 'ig') : (r.flags ?? 'i') + 'g';
        const re = new RegExp(r.pattern, flags);
        console.log(`  compila: OK  (effective flags: "${flags}")`);
        for (const s of SAMPLES) {
          re.lastIndex = 0;
          const m = re.exec(s);
          if (m) console.log(`    ✓ match "${s}" → "${m[0]}"`);
        }
      } catch (e) {
        console.log(`  compila: FAIL → ${(e as Error).message}`);
      }
    }
    console.log();
  }

  const couriers: Array<{ domain: string; is_active: boolean }> =
    await sql`SELECT domain, is_active FROM contact_guard_courier_allowlist ORDER BY domain;`;
  console.log(`=== contact_guard_courier_allowlist ===`);
  for (const c of couriers) console.log(`  ${c.is_active ? '✓' : '✗'} ${c.domain}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
