import { NextRequest, NextResponse } from 'next/server';
import { cleanupAbandonedUnverifiedAccountsAction } from '@/lib/db/actions/user';

export const dynamic = 'force-dynamic';

/**
 * Cron de limpieza (Fase 3 follow-up, ajuste login, EMAIL_VERIFICATION_ENABLED).
 * Cloud Scheduler lo invoca por POST con `Authorization: Bearer ${CRON_SECRET}`, cada 6h
 * (mismo patrón que process-availability). GET se acepta para pruebas manuales.
 *
 * Borra cuentas creadas hace más de 2 días que nunca verificaron su correo ni completaron
 * el onboarding — evita acumular usuarios huérfanos de inscripciones abandonadas.
 */
async function handle(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.EMAIL_VERIFICATION_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const result = await cleanupAbandonedUnverifiedAccountsAction();
  if (!result.success) {
    console.error('[cron/cleanup-unverified-accounts] Error:', result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedCount: result.deletedCount, timestamp: new Date().toISOString() });
}

export const POST = handle;
export const GET = handle;
