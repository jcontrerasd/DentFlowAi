/**
 * Seed/upsert de la allowlist de couriers de ContactGuard
 * (tabla `contact_guard_courier_allowlist`). Idempotente: upsert por `domain`.
 *
 * Los dominios se guardan en minúsculas (igual que `createCourierAllowlistAction`).
 *
 * Uso: npx tsx scripts/seed-courier-allowlist.ts
 */
import 'dotenv/config';
import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local' });

import postgres from 'postgres';

const COURIERS: Array<{ domain: string; label: string }> = [
  { domain: 'bluexpress.cl', label: 'BlueExpress' },
  { domain: 'chilexpress.cl', label: 'Chilexpress' },
  { domain: 'correoschile.cl', label: 'CorreosChile' },
  { domain: 'starken.cl', label: 'Starken' },
  { domain: 'shipit.cl', label: 'Shipit' },
  { domain: 'shippify.com', label: 'Shippify' },
  { domain: 'enviame.io', label: 'Envíame' },
  { domain: 'envia.com', label: 'Envia' },
  { domain: 'shipex.cl', label: 'Shipex' },
  { domain: 'llego.cl', label: 'Llegó' },
  { domain: 'chazki.com', label: 'Chazki' },
  { domain: 'moova.co', label: 'Moova' },
  { domain: 'welivery.com', label: 'Welivery' },
  { domain: 'simpliroute.com', label: 'SimpliRoute' },
  { domain: 'quick.cl', label: 'Quick' },
  { domain: 'alas.cl', label: 'Alas' },
  { domain: 'edarkstore.cl', label: 'eDarkstore' },
  { domain: 'twlogistica.cl', label: 'TW Logística' },
  { domain: 'storecentral.cl', label: 'Store Central' },
  { domain: 'zippin.cl', label: 'Zippin' },
  { domain: 'atenas.cl', label: 'Atenas' },
  { domain: 'dhl.com', label: 'DHL' },
  { domain: 'fedex.com', label: 'FedEx' },
  { domain: 'ups.com', label: 'UPS' },
  { domain: 'logisfashion.com', label: 'Logisfashion' },
];

const DOMAIN_RE = /^[a-z0-9.\-]+\.[a-z]{2,}$/;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no configurada');
  const sql = postgres(url, { prepare: false });

  let inserted = 0;
  let updated = 0;
  for (const c of COURIERS) {
    const domain = c.domain.trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) {
      console.log(`⚠ dominio inválido, omitido: ${c.domain}`);
      continue;
    }
    const rows = await sql`
      INSERT INTO contact_guard_courier_allowlist (domain, label, is_active, updated_at)
      VALUES (${domain}, ${c.label}, TRUE, now())
      ON CONFLICT (domain) DO UPDATE
        SET label = EXCLUDED.label, is_active = TRUE, updated_at = now()
      RETURNING (xmax = 0) AS inserted;
    `;
    if (rows[0]?.inserted) { inserted++; console.log(`＋ ${domain}  (${c.label})`); }
    else { updated++; console.log(`↻ ${domain}  (${c.label})`); }
  }

  const total = await sql`SELECT COUNT(*)::int AS n FROM contact_guard_courier_allowlist WHERE is_active = TRUE;`;
  console.log(`\nInsertados: ${inserted} · Actualizados: ${updated} · Total activos en allowlist: ${total[0].n}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
