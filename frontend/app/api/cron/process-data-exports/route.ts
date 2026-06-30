import { NextRequest, NextResponse } from 'next/server';
import {
  processPendingDataExportsAction,
  purgeExpiredDataExportsAction,
} from '@/lib/db/actions/dataExport';

export const dynamic = 'force-dynamic';

/**
 * Cron de exportación de datos personales (portabilidad, Ley 21.719). Frecuencia recomendada: cada 5 minutos.
 * Cloud Scheduler lo invoca por POST con `Authorization: Bearer ${CRON_SECRET}`.
 * GET se acepta para pruebas manuales locales.
 *
 * 1. Procesa UNA solicitud pending (FIFO): arma ZIP, sube a GCS, notifica al usuario.
 * 2. Purga ZIPs vencidos (expiresAt <= now): borra objeto GCS + marca status='expired'.
 */
async function handle(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const processResult = await processPendingDataExportsAction();
  if (!processResult.success) {
    console.error('[cron/process-data-exports] Error (process):', processResult.error);
    return NextResponse.json({ error: processResult.error }, { status: 500 });
  }

  const purgeResult = await purgeExpiredDataExportsAction();
  if (!purgeResult.success) {
    console.error('[cron/process-data-exports] Error (purge):', purgeResult.error);
    return NextResponse.json({ error: purgeResult.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    processed: processResult.processed,
    purged: purgeResult.purged,
    timestamp: new Date().toISOString(),
  });
}

export const POST = handle;
export const GET = handle;
