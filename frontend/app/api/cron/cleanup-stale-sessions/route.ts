import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { requireCronAuth } from '@/lib/cronAuth';
import { getSessionTimeoutConfig, deleteExpiredSessions } from '@/lib/db/sessionTimeouts';

export const dynamic = 'force-dynamic';

/**
 * Cron de limpieza de sesiones. Cloud Scheduler lo invoca por POST con
 * `Authorization: Bearer ${CRON_SECRET}`, cada 2 min (mismo patrón que process-pool-queue).
 * GET se acepta para pruebas manuales.
 *
 * Dos barridos independientes — ninguno depende del otro para el enforcement real (eso vive
 * en getServerIdentity/el callback jwt), esto es solo garbage collection:
 * - Barrido A (Fase 5, TAB_CLOSE_LOGOUT_ENABLED): plan B de `sendBeacon` — si el navegador
 *   cierra abruptamente (crash, kill, sin red) el beacon de /api/auth/close puede no dispararse;
 *   esta es la garantía de que la fila se borra igual, a más tardar SESSION_STALE_TTL_SECONDS
 *   después del último heartbeat.
 * - Barrido B (v5.29, SESSION_TIMEOUTS_ENABLED): borra filas vencidas por inactividad o tope
 *   absoluto que nadie más tocó (usuario nunca volvió a hacer un request tras vencer).
 */
async function handle(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  let deletedStale: number | null = null;
  if (process.env.TAB_CLOSE_LOGOUT_ENABLED === 'true') {
    const ttlSeconds = Number(process.env.SESSION_STALE_TTL_SECONDS) || 90;
    const result: any = await db.execute(sql`
      DELETE FROM sessions
      WHERE "lastSeenAt" IS NOT NULL AND "lastSeenAt" < NOW() - INTERVAL '1 second' * ${ttlSeconds}
    `);
    deletedStale = result.count ?? null;
  }

  let deletedExpired: number | null = null;
  const timeoutCfg = await getSessionTimeoutConfig();
  if (timeoutCfg.enabled) {
    deletedExpired = await deleteExpiredSessions(timeoutCfg);
  }

  return NextResponse.json({
    ok: true,
    deletedStale,
    deletedExpired,
    timestamp: new Date().toISOString(),
  });
}

export const POST = handle;
export const GET = handle;
