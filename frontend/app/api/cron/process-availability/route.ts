import { NextRequest, NextResponse } from 'next/server';
import { processAvailabilityMaintenanceAction } from '@/lib/db/actions/availabilityCron';
import { processDentistReviewDeadlinesAction } from '@/lib/db/actions/dentistReviewCron';
import { processQualityReviewDeadlinesAction } from '@/lib/db/actions/qualityReviewCron';
import { requireCronAuth } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

/**
 * Cron de mantenimiento del modelo de disponibilidad (v5.0). Frecuencia: cada hora.
 * Cloud Scheduler lo invoca por POST con `Authorization: Bearer ${CRON_SECRET}`.
 * GET se acepta para pruebas manuales (curl / navegador).
 *
 * Corre dos tareas: mantenimiento de disponibilidad (sanción/inactividad) y la
 * escalación del countdown de revisión del dentista.
 */
async function handle(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

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

  // v5.19 — escalación del SLA de la etapa de Calidad (inerte con QUALITY_GATE_ENABLED off).
  const quality = await processQualityReviewDeadlinesAction();
  if (!quality.success) {
    console.error('[cron/process-availability] Error (quality):', quality.error);
    return NextResponse.json({ error: quality.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    skipped: res.skipped ?? false,
    windowExpired: res.windowExpired,
    autoOffPreventive: res.autoOffPreventive,
    remindersSent: res.remindersSent,
    reviewRemindersSent: review.remindersSent,
    reviewOverdueNotified: review.overdueNotified,
    qualityRemindersSent: quality.remindersSent,
    qualityOverdueNotified: quality.overdueNotified,
    timestamp: new Date().toISOString(),
  });
}

export const POST = handle;
export const GET = handle;
