import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Cron de limpieza de sesiones (Fase 5, ajuste login, TAB_CLOSE_LOGOUT_ENABLED).
 * Cloud Scheduler lo invoca por POST con `Authorization: Bearer ${CRON_SECRET}`, cada 2 min
 * (mismo patrón que process-pool-queue). GET se acepta para pruebas manuales.
 *
 * Plan B de `sendBeacon`: si el navegador cierra abruptamente (crash, kill, sin red) el beacon
 * de /api/auth/close puede no llegar a dispararse — esta es la garantía de que la fila se borra
 * igual, a más tardar SESSION_STALE_TTL_SECONDS después del último heartbeat.
 */
async function handle(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.TAB_CLOSE_LOGOUT_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const ttlSeconds = Number(process.env.SESSION_STALE_TTL_SECONDS) || 90;

  const result: any = await db.execute(sql`
    DELETE FROM sessions
    WHERE "lastSeenAt" IS NOT NULL AND "lastSeenAt" < NOW() - INTERVAL '1 second' * ${ttlSeconds}
  `);

  return NextResponse.json({ ok: true, deleted: result.count ?? null, timestamp: new Date().toISOString() });
}

export const POST = handle;
export const GET = handle;
