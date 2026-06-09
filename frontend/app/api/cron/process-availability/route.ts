import { NextRequest, NextResponse } from 'next/server';
import { processAvailabilityMaintenanceAction } from '@/lib/db/actions/availabilityCron';
import { processDentistReviewDeadlinesAction } from '@/lib/db/actions/dentistReviewCron';

export const dynamic = 'force-dynamic';

/**
 * Cron de mantenimiento del modelo de disponibilidad (v5.0). Frecuencia: cada hora.
 * Cloud Scheduler lo invoca por POST con `Authorization: Bearer ${CRON_SECRET}`.
 * GET se acepta para pruebas manuales (curl / navegador).
 *
 * Corre dos tareas: mantenimiento de disponibilidad (sanción/inactividad) y la
 * escalación del countdown de revisión del dentista. Inerte si
 * `AVAILABILITY_MODEL_ENABLED` está apagado (las actions retornan skipped).
 */
async function handle(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await processAvailabilityMaintenanceAction();
  if (!res.success) {
    console.error('[cron/process-availability] Error:', res.error);
    return NextResponse.json({ error: res.error }, { status: 500 });
  }

  const review = await processDentistReviewDeadlinesAction();
  if (!review.success) {
    console.error('[cron/process-availability] Error (review):', review.error);
    return NextResponse.json({ error: review.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    skipped: res.skipped ?? false,
    windowExpired: res.windowExpired,
    autoOffPreventive: res.autoOffPreventive,
    remindersSent: res.remindersSent,
    reviewRemindersSent: review.remindersSent,
    reviewOverdueNotified: review.overdueNotified,
    timestamp: new Date().toISOString(),
  });
}

export const POST = handle;
export const GET = handle;
