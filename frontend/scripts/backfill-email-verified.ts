/**
 * One-time backfill de `user.email_verified` (Fase 3, ajuste login).
 *
 * Pre-requisito obligatorio antes de activar `EMAIL_VERIFICATION_ENABLED=true` en
 * cualquier ambiente con usuarios reales: sin este backfill, todos los usuarios
 * existentes (que nunca pasaron por un flujo de verificación real) quedarían
 * bloqueados en el primer login tras activar el flag.
 *
 * Setea `email_verified = now()` para todo usuario con `email_verified IS NULL`.
 * Idempotente: re-ejecutar no cambia nada si ya no quedan filas NULL.
 *
 * Uso (apuntando .env.local a la BD destino — confirmar antes de correr en prod):
 *   cd frontend && npx tsx scripts/backfill-email-verified.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('--- Backfill user.email_verified (Fase 3, ajuste login) ---');

  const [{ n: pending }]: any = await db.execute(
    sql`SELECT count(*)::int AS n FROM "user" WHERE email_verified IS NULL`,
  );
  console.log(`Usuarios sin emailVerified: ${pending}`);

  if (pending === 0) {
    console.log('Nada que hacer.');
    process.exit(0);
  }

  await db.execute(sql`
    UPDATE "user" SET email_verified = NOW() WHERE email_verified IS NULL;
  `);

  const [{ n: remaining }]: any = await db.execute(
    sql`SELECT count(*)::int AS n FROM "user" WHERE email_verified IS NULL`,
  );
  console.log(`Usuarios actualizados: ${pending}`);
  console.log(`Usuarios sin emailVerified restantes: ${remaining}`);
  console.log('--- Backfill completado ---');
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill-email-verified] Error:', err);
  process.exit(1);
});
