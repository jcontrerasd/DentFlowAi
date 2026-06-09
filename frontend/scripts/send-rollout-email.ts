/**
 * Envío masivo de comunicación de rollout a técnicos (v5.0, Fase 7).
 *
 * Uso:
 *   cd frontend && npx tsx scripts/send-rollout-email.ts proximo    # antes del rollout
 *   cd frontend && npx tsx scripts/send-rollout-email.ts activado   # tras encender el flag
 *
 * Best-effort vía EmailJS (mismo transport que `notifyUser`). Si EmailJS está en
 * modo stub (sin credenciales) loguea sin enviar. La cobertura por email no es
 * crítica: el banner in-app + el badge global aseguran que el técnico se entera al
 * ingresar. Recorre hasta donde alcance la cuota disponible.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const phase = (process.argv[2] || '').toLowerCase();
  if (phase !== 'proximo' && phase !== 'activado') {
    console.error("Uso: npx tsx scripts/send-rollout-email.ts <proximo|activado>");
    process.exit(1);
  }
  const type = phase === 'proximo' ? 'ROLLOUT_PROXIMO' : 'ROLLOUT_ACTIVADO';

  const { db } = await import('../lib/db');
  const { user } = await import('../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const { notifyUser } = await import('../lib/services/notifications');

  const techs = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(eq(user.role, 'tecnico'), eq(user.isActive, true)));

  console.log(`--- Rollout ${type}: ${techs.length} técnicos activos ---`);
  let ok = 0;
  let fail = 0;
  for (const t of techs) {
    const res = await notifyUser(t.id, type as any, {});
    if (res.success) ok++;
    else { fail++; console.warn(`  fallo ${t.email}: ${res.error}`); }
  }
  console.log(`Enviados: ${ok} · Fallos: ${fail}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[send-rollout-email] Error:', e);
  process.exit(1);
});
