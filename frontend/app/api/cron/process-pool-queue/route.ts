import { NextRequest, NextResponse } from 'next/server';
import {
  processPendingPoolCheckInAction,
  processPendingPoolExpirationAction,
} from '@/lib/db/actions/poolQueue';

export const dynamic = 'force-dynamic';

/**
 * Cron de la cola `pendiente_pool` (v5.0). Frecuencia: cada 10 minutos.
 * Cloud Scheduler lo invoca por POST con `Authorization: Bearer ${CRON_SECRET}`.
 * GET se acepta para pruebas manuales.
 *
 * 1. Check-in al dentista al 50% del TTL del ciclo.
 * 2. Expiración del ciclo: re-encola o falla a `sin_cotizaciones_fallo`.
 * Inerte si `AVAILABILITY_MODEL_ENABLED` está apagado (las actions no encuentran
 * casos en pool porque Fauchard no encola con el flag off).
 */
async function handle(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checkIn = await processPendingPoolCheckInAction();
  if (!checkIn.success) {
    console.error('[cron/process-pool-queue] Error (check-in):', checkIn.error);
    return NextResponse.json({ error: checkIn.error }, { status: 500 });
  }

  const expiration = await processPendingPoolExpirationAction();
  if (!expiration.success) {
    console.error('[cron/process-pool-queue] Error (expiration):', expiration.error);
    return NextResponse.json({ error: expiration.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    checkInsSent: checkIn.notified,
    requeued: expiration.requeued,
    failed: expiration.failed,
    timestamp: new Date().toISOString(),
  });
}

export const POST = handle;
export const GET = handle;
