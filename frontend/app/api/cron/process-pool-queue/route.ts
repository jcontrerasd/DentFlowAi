import { NextRequest, NextResponse } from 'next/server';
import {
  processPendingPoolReevaluationAction,
  processPendingPoolCheckInAction,
  processPendingPoolExpirationAction,
} from '@/lib/db/actions/poolQueue';
import { processWithdrawalDecisionTimeoutsAction } from '@/lib/db/actions/withdrawal';
import { requireCronAuth } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

/**
 * Cron de la cola `pendiente_pool` (v5.0). Frecuencia recomendada: cada 2 minutos.
 * Cloud Scheduler lo invoca por POST con `Authorization: Bearer ${CRON_SECRET}`.
 * GET se acepta para pruebas manuales.
 *
 * 1. Reevaluación: intenta asignar si ya hay técnicos elegibles.
 * 2. Check-in al dentista al 50% del TTL del ciclo.
 * 3. Expiración del ciclo: re-encola o falla a `sin_cotizaciones_fallo`.
 * 4. Timeout de decisión tras retiro del técnico (v5.32): continúa por defecto.
 * Inerte con `POOL_PENDIENTE_ENABLED` apagado (Fauchard no encola casos).
 */
async function handle(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const reevaluation = await processPendingPoolReevaluationAction();
  if (!reevaluation.success) {
    console.error('[cron/process-pool-queue] Error (reevaluation):', reevaluation.error);
    return NextResponse.json({ error: reevaluation.error }, { status: 500 });
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

  const withdrawalTimeouts = await processWithdrawalDecisionTimeoutsAction();
  if (!withdrawalTimeouts.success) {
    console.error('[cron/process-pool-queue] Error (withdrawal timeouts):', withdrawalTimeouts.error);
    return NextResponse.json({ error: withdrawalTimeouts.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    assigned: reevaluation.assigned,
    stillWaiting: reevaluation.stillWaiting,
    checkInsSent: checkIn.notified,
    requeued: expiration.requeued,
    failed: expiration.failed,
    withdrawalTimeoutsProcessed: withdrawalTimeouts.processed,
    timestamp: new Date().toISOString(),
  });
}

export const POST = handle;
export const GET = handle;
