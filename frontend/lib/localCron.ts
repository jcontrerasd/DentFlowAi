/**
 * Scheduler de crons in-process para el entorno **local** únicamente.
 *
 * En dev/prod (Cloud Run) los crons los dispara Cloud Scheduler por HTTP; en local
 * no hay scheduler externo, así que este módulo los corre dentro del proceso de
 * `npm run dev`. Se arranca desde `frontend/instrumentation.ts`, que ya garantiza que
 * solo se invoca fuera de producción.
 *
 * Cada tarea es idempotente y, además, inerte si su feature flag está apagado, así que
 * correr esto en local es seguro aunque el motor esté off.
 */

import { processLeagueMaintenanceAction } from '@/lib/db/actions/leagueCron';

declare global {
  var __localCronStarted: boolean | undefined;
}

export function startLocalCronScheduler(): void {
  if (globalThis.__localCronStarted) return;
  globalThis.__localCronStarted = true;

  const leagueIntervalMs = Number(process.env.LOCAL_LEAGUE_CRON_INTERVAL_MS ?? 3_600_000);

  const runLeague = async () => {
    try {
      const res = await processLeagueMaintenanceAction();
      if (res.success && !res.skipped) {
        console.log('[local-cron] process-league:', JSON.stringify(res));
      }
    } catch (e) {
      console.error('[local-cron] process-league error:', e);
    }
  };

  // Primera corrida poco después del arranque (deja levantar la DB) + intervalo.
  setTimeout(runLeague, 15_000);
  setInterval(runLeague, leagueIntervalMs);

  console.log(`[local-cron] scheduler iniciado (process-league cada ${leagueIntervalMs}ms).`);
}
