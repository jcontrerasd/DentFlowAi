'use server';

/**
 * Mantenimiento periódico del motor de ligas (Fase 2). Frecuencia: **diaria**.
 * Invocado por `/api/cron/process-league` (dev/prod, Cloud Scheduler) y por el
 * scheduler in-process local (ver `frontend/instrumentation.ts`).
 *
 * Por cada técnico evalúa, en orden, ascenso/consolidación y luego descenso
 * (saltando el descenso si el ascenso ya cambió el estado en esta corrida, para no
 * mezclar métricas de ligas distintas). Idempotente. Inerte (`skipped`) con
 * `LEAGUE_ENGINE_ENABLED` apagado.
 */

import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { isLeagueEngineEnabled } from '@/lib/constants/availabilityFlags';
import { getActiveConfig } from './fauchard';
import {
  computeLeagueMetricsAction,
  evaluateTechnicianAscentAction,
  evaluateTechnicianDescentAction,
} from './league';
import type { ActionResult } from '@/lib/types/actions';

export type LeagueMaintenanceResult = {
  evaluated: number;
  ascended: number;
  consolidated: number;
  descended: number;
  watchArmed: number;
  skipped?: boolean;
};

export async function processLeagueMaintenanceAction(): Promise<ActionResult<LeagueMaintenanceResult>> {
  if (!isLeagueEngineEnabled()) {
    return { success: true, evaluated: 0, ascended: 0, consolidated: 0, descended: 0, watchArmed: 0, skipped: true };
  }

  try {
    const config = await getActiveConfig();
    const techs = await db.select({ id: user.id }).from(user).where(eq(user.role, 'tecnico'));

    let ascended = 0;
    let consolidated = 0;
    let descended = 0;
    let watchArmed = 0;

    for (const t of techs) {
      // Métricas de la liga actual: se reutilizan para ascenso y (si no hubo cambio)
      // para descenso, evitando recomputar.
      const metrics = (await computeLeagueMetricsAction(t.id, config)).data;

      const ascent = await evaluateTechnicianAscentAction(t.id, config, metrics);
      const ascentAction = ascent.success ? ascent.data?.action : undefined;
      if (ascentAction === 'ascenso') ascended++;
      else if (ascentAction === 'consolidado') consolidated++;

      // Solo evaluar descenso si el ascenso no cambió el estado del técnico
      // (las métricas seguirían siendo válidas para su liga actual).
      if (ascentAction === 'ninguno') {
        const descent = await evaluateTechnicianDescentAction(t.id, config, metrics);
        const descentAction = descent.success ? descent.data?.action : undefined;
        if (descentAction === 'descenso') descended++;
        else if (descentAction === 'watch_armado') watchArmed++;
      }

      await db.update(user).set({ leagueLastEvaluatedAt: new Date() }).where(eq(user.id, t.id));
    }

    return { success: true, evaluated: techs.length, ascended, consolidated, descended, watchArmed };
  } catch (e) {
    console.error('[cron/process-league] Error:', e);
    return { success: false, error: 'Error en mantenimiento de ligas' };
  }
}
