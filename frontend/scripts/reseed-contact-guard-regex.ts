/**
 * Recovery: re-inserta las reglas regex de ContactGuard.
 * Idempotente: borra por nombre antes de insertar.
 *
 * Los teléfonos ya NO viven aquí: se detectan por país en código
 * (`lib/contactGuard/phonePatterns.ts`). Este script además elimina las reglas legacy
 * `telefono_*` para dejar limpio el listado admin.
 *
 * Uso: npx tsx scripts/reseed-contact-guard-regex.ts
 */
import 'dotenv/config';
import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local' });

import postgres from 'postgres';

const REGEX_RULES: Array<{
  name: string;
  pattern: string;
  description: string;
}> = [
  {
    name: 'email',
    pattern: String.raw`[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`,
    description: 'Direcciones de correo electrónico',
  },
  {
    name: 'url_http',
    pattern: String.raw`https?://[^\s]+`,
    description: 'URLs http/https',
  },
  {
    name: 'url_shortener',
    pattern: String.raw`(?:bit\.ly|t\.co|goo\.gl|tinyurl\.com|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rebrand\.ly|short\.io)/[a-z0-9]+`,
    description: 'URLs acortadas',
  },
  {
    name: 'dominio_explicito',
    pattern: String.raw`(?<![a-z0-9])[a-z0-9\-]{2,}\.(?:com|cl|net|org|io|app|me|co|info|biz|gob\.cl|edu\.cl)(?![a-z])`,
    description: 'Dominios sin protocolo (ejemplo.com)',
  },
  {
    name: 'handle_arroba',
    pattern: String.raw`(?<![a-z0-9._%+\-])@[a-z0-9._]{3,}`,
    description: 'Handles de redes sociales (@usuario)',
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no configurada');
  const sql = postgres(url, { prepare: false });

  // Eliminar reglas legacy de teléfono (la detección es country-aware en código).
  const removed = await sql`DELETE FROM contact_guard_rule WHERE name IN ('telefono_cl_intl', 'telefono_8plus_digitos')`;
  if (removed.count) console.log(`✗ eliminadas ${removed.count} regla(s) legacy telefono_*`);

  for (const r of REGEX_RULES) {
    // Borra cualquier residuo del mismo nombre y re-inserta.
    await sql`DELETE FROM contact_guard_rule WHERE name = ${r.name}`;
    await sql`
      INSERT INTO contact_guard_rule (type, name, pattern, flags, description, severity, is_active)
      VALUES ('regex', ${r.name}, ${r.pattern}, 'i', ${r.description}, 'block', TRUE);
    `;
    console.log(`✓ ${r.name}`);
  }

  const total = await sql`SELECT COUNT(*)::int AS n FROM contact_guard_rule WHERE is_active = TRUE;`;
  console.log(`\nTotal reglas activas: ${total[0].n}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
