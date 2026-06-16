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
import { processPendingPoolReevaluationAction } from '@/lib/db/actions/poolQueue';
import { isAvailabilityEnabled, isPoolPendienteEnabled } from '@/lib/constants/availabilityFlags';

declare global {
  var __localCronStarted: boolean | undefined;
}

export function startLocalCronScheduler(): void {
  if (globalThis.__localCronStarted) return;
  globalThis.__localCronStarted = true;

  const leagueIntervalMs = Number(process.env.LOCAL_LEAGUE_CRON_INTERVAL_MS ?? 3_600_000);
  const poolIntervalMs = Number(process.env.LOCAL_POOL_CRON_INTERVAL_MS ?? 120_000);

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

  const runPoolReevaluation = async () => {
    if (!isAvailabilityEnabled() || !isPoolPendienteEnabled()) return;
    try {
      const res = await processPendingPoolReevaluationAction();
      if (res.success && (res.assigned ?? 0) > 0) {
        console.log('[local-cron] process-pool-queue (reevaluation):', JSON.stringify(res));
      }
    } catch (e) {
      console.error('[local-cron] process-pool-queue error:', e);
    }
  };

  // Primera corrida poco después del arranque (deja levantar la DB) + intervalo.
  setTimeout(runLeague, 15_000);
  setInterval(runLeague, leagueIntervalMs);

  setTimeout(runPoolReevaluation, 20_000);
  setInterval(runPoolReevaluation, poolIntervalMs);

  console.log(
    `[local-cron] scheduler iniciado (process-league cada ${leagueIntervalMs}ms; pool reevaluation cada ${poolIntervalMs}ms).`,
  );
}
