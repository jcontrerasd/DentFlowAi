import { NextRequest, NextResponse } from 'next/server';
import { processLeagueMaintenanceAction } from '@/lib/db/actions/leagueCron';
import { requireCronAuth } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

/**
 * Cron del motor de ligas (Fase 2). Frecuencia: **diaria**.
 * Cloud Scheduler lo invoca por POST con `Authorization: Bearer ${CRON_SECRET}`.
 * GET se acepta para pruebas manuales (curl / navegador). En local también lo dispara
 * el scheduler in-process (`frontend/instrumentation.ts`).
 *
 * Inerte si `LEAGUE_ENGINE_ENABLED` está apagado (la action retorna skipped).
 */
async function handle(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  const res = await processLeagueMaintenanceAction();
  if (!res.success) {
    console.error('[cron/process-league] Error:', res.error);
    return NextResponse.json({ error: res.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...res, timestamp: new Date().toISOString() });
}

export const POST = handle;
export const GET = handle;
