'use server';

/**
 * Motor de ligas (Fase 2) — detrás del flag LEAGUE_ENGINE_ENABLED.
 *
 * Este Sprint (1) aporta solo **lectura pura**: calcula, por técnico, los insumos de
 * decisión de ascenso/descenso sobre los casos completados de su liga actual. No muta nada.
 * El ascenso/transición (Sprint 2), el descenso (Sprint 3) y el cron (Sprint 4) se apoyan en
 * estas métricas.
 *
 * Ver [Doc/DentFlowAI_Diseño_Funcional_Liga.md](../../../../Doc/DentFlowAI_Diseño_Funcional_Liga.md).
 */

import { db } from '@/lib/db';
import { user, caseAssignment, clinicalCase, review, leagueChangeEvent } from '@/lib/db/schema';
import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { getActiveConfig, type FauchardConfigRow } from '@/lib/db/actions/fauchard';
import { isLeagueEngineEnabled } from '@/lib/constants/availabilityFlags';
import {
  nextLeagueUp,
  nextLeagueDown,
  type League,
  type LeagueMetrics,
  type AscentResult,
  type DescentResult,
} from '@/lib/league';
import { isCompletedOnTime } from '@/lib/cases/workDeadline';

/** Surface server-only del flag del motor para Client Components (banner/UI admin). */
export async function getLeagueEngineEnabledAction(): Promise<{ enabled: boolean }> {
  return { enabled: await isLeagueEngineEnabled() };
}

/**
 * Métricas de elegibilidad de liga para un técnico, sobre los últimos
 * `lCasesEvaluated` casos completados **de su liga actual**.
 *
 * Puntualidad alineada al score Fauchard: ventana publishedAt → desiredDeliveryAt.
 */
export async function computeLeagueMetricsAction(
  technicianId: string,
  config?: FauchardConfigRow
): Promise<{ success: boolean; data?: LeagueMetrics; error?: string }> {
  try {
    const cfg = config ?? (await getActiveConfig());

    const [techRow] = await db
      .select({ leagueLevel: user.leagueLevel })
      .from(user)
      .where(eq(user.id, technicianId))
      .limit(1);

    if (!techRow) return { success: false, error: 'Técnico no encontrado' };

    const league = (techRow.leagueLevel ?? 'bronce').toLowerCase() as League;

    // Casos completados del técnico en SU liga actual, más recientes primero.
    const completedCases = await db
      .select({
        caseId: clinicalCase.id,
        completedAt: clinicalCase.completedAt,
        publishedAt: clinicalCase.publishedAt,
        desiredDeliveryAt: clinicalCase.desiredDeliveryAt,
        deadlineDays: caseAssignment.deadlineDays,
        deadlineHours: caseAssignment.deadlineHours,
      })
      .from(caseAssignment)
      .innerJoin(clinicalCase, eq(caseAssignment.clinicalCaseId, clinicalCase.id))
      .where(
        and(
          eq(caseAssignment.technicianId, technicianId),
          eq(caseAssignment.status, 'accepted'),
          isNotNull(clinicalCase.completedAt),
          eq(clinicalCase.caseLeague, league)
        )
      )
      .orderBy(desc(clinicalCase.completedAt));

    const completedTotal = completedCases.length;
    const windowCases = completedCases.slice(0, cfg.lCasesEvaluated);
    const casesInWindow = windowCases.length;

    // Puntualidad sobre la ventana (mismo criterio que el componente P del score).
    let onTime = 0;
    let withDeadline = 0;
    for (const c of windowCases) {
      if (!c.completedAt) continue;
      const hasWindow = c.desiredDeliveryAt != null || (c.publishedAt != null && c.deadlineDays != null);
      if (!hasWindow) continue;
      withDeadline++;
      if (isCompletedOnTime(c.completedAt, c.desiredDeliveryAt, c.publishedAt, c.deadlineDays)) {
        onTime++;
      }
    }
    const punctuality = withDeadline > 0 ? onTime / withDeadline : null;

    // Rating promedio: reviews recibidas por el técnico en los casos de la ventana
    // (todas las dimensiones; la liga es transversal, no por capacidad CAD/CAM).
    let avgRating: number | null = null;
    if (windowCases.length > 0) {
      const windowCaseIds = windowCases.map((c) => c.caseId);
      const ratings = await db
        .select({ rating: review.rating })
        .from(review)
        .where(
          and(eq(review.revieweeId, technicianId), inArray(review.clinicalCaseId, windowCaseIds))
        );
      if (ratings.length > 0) {
        avgRating = ratings.reduce((a, r) => a + r.rating, 0) / ratings.length;
      }
    }

    return {
      success: true,
      data: { league, avgRating, punctuality, casesInWindow, completedTotal },
    };
  } catch (e) {
    console.error('[league] computeLeagueMetricsAction error', e);
    return { success: false, error: 'Error calculando métricas de liga' };
  }
}

/** Registra una fila de auditoría del cambio de liga. */
async function recordLeagueChange(
  technicianId: string,
  fromLeague: string,
  toLeague: string,
  kind: 'ascenso' | 'transicion_consolidada' | 'descenso',
  reason?: string
): Promise<void> {
  await db.insert(leagueChangeEvent).values({ technicianId, fromLeague, toLeague, kind, reason });
}

/** ¿El técnico cumple los tres criterios de ascenso? */
function meetsAscentCriteria(metrics: LeagueMetrics, cfg: FauchardConfigRow): boolean {
  return (
    metrics.avgRating !== null &&
    metrics.avgRating >= parseFloat(cfg.lMinRating) &&
    metrics.punctuality !== null &&
    metrics.punctuality >= parseFloat(cfg.lMinPunctuality) &&
    metrics.completedTotal >= cfg.lCasesCompleted
  );
}

/**
 * Ascenso y consolidación de transición de un técnico (Sprint 2).
 *
 * - Si está **en transición** (`leagueTransitionStartedAt` seteado): cuenta casos completados
 *   en su liga (la nueva) desde el inicio de la transición; al alcanzar `lCasesTransition`
 *   consolida (limpia la marca, +1 a `leagueTransitionCount`, evento `transicion_consolidada`).
 * - Si **no** está en transición y no es `elite`: si cumple el triple criterio, sube un nivel,
 *   marca `leagueTransitionStartedAt = now` y registra `ascenso`.
 *
 * Inerte (`skipped`) con `LEAGUE_ENGINE_ENABLED` apagado.
 */
export async function evaluateTechnicianAscentAction(
  technicianId: string,
  config?: FauchardConfigRow,
  metrics?: LeagueMetrics
): Promise<{ success: boolean; data?: AscentResult; error?: string }> {
  if (!(await isLeagueEngineEnabled())) return { success: true, data: { action: 'skipped' } };
  try {
    const cfg = config ?? (await getActiveConfig());

    const [techRow] = await db
      .select({ leagueLevel: user.leagueLevel, transitionStartedAt: user.leagueTransitionStartedAt })
      .from(user)
      .where(eq(user.id, technicianId))
      .limit(1);

    if (!techRow) return { success: false, error: 'Técnico no encontrado' };
    const league = (techRow.leagueLevel ?? 'bronce').toLowerCase() as League;

    // En transición → evaluar consolidación.
    if (techRow.transitionStartedAt) {
      const completedSince = await db
        .select({ id: clinicalCase.id })
        .from(caseAssignment)
        .innerJoin(clinicalCase, eq(caseAssignment.clinicalCaseId, clinicalCase.id))
        .where(
          and(
            eq(caseAssignment.technicianId, technicianId),
            eq(caseAssignment.status, 'confirmed'),
            isNotNull(clinicalCase.completedAt),
            eq(clinicalCase.caseLeague, league),
            gte(clinicalCase.completedAt, techRow.transitionStartedAt)
          )
        );

      if (completedSince.length >= cfg.lCasesTransition) {
        await db
          .update(user)
          .set({
            leagueTransitionStartedAt: null,
            leagueTransitionCount: (await currentTransitionCount(technicianId)) + 1,
          })
          .where(eq(user.id, technicianId));
        await recordLeagueChange(
          technicianId,
          league,
          league,
          'transicion_consolidada',
          `Consolidado tras ${completedSince.length} casos`
        );
        return { success: true, data: { action: 'consolidado', league } };
      }
      return { success: true, data: { action: 'ninguno' } };
    }

    // No en transición → evaluar ascenso.
    const up = nextLeagueUp(league);
    if (!up) return { success: true, data: { action: 'ninguno' } };

    const m = metrics ?? (await computeLeagueMetricsAction(technicianId, cfg)).data;
    if (!m || !meetsAscentCriteria(m, cfg)) return { success: true, data: { action: 'ninguno' } };

    await db
      .update(user)
      .set({ leagueLevel: up, leagueTransitionStartedAt: new Date() })
      .where(eq(user.id, technicianId));
    await recordLeagueChange(
      technicianId,
      league,
      up,
      'ascenso',
      `rating ${m.avgRating?.toFixed(2)} · puntualidad ${(m.punctuality ?? 0).toFixed(2)} · ${m.completedTotal} casos`
    );
    return { success: true, data: { action: 'ascenso', from: league, to: up } };
  } catch (e) {
    console.error('[league] evaluateTechnicianAscentAction error', e);
    return { success: false, error: 'Error evaluando ascenso de liga' };
  }
}

async function currentTransitionCount(technicianId: string): Promise<number> {
  const [row] = await db
    .select({ n: user.leagueTransitionCount })
    .from(user)
    .where(eq(user.id, technicianId))
    .limit(1);
  return row?.n ?? 0;
}

const DAY_MS = 86_400_000;

/**
 * Descenso de liga de un técnico (Sprint 3).
 *
 * - Si el rating promedio (ventana) cae por debajo de `lDescentRating`: arma el watch
 *   (`leagueDemotionWatchSince = now`) la primera vez; si el watch sostenido alcanza
 *   `lDescentDays` días, baja un nivel (limpia watch y cualquier transición, evento `descenso`).
 * - Si el rating recupera (≥ `lDescentRating`) o no hay datos: limpia el watch.
 * - Nunca baja de `bronce`.
 *
 * Inerte (`skipped`) con `LEAGUE_ENGINE_ENABLED` apagado.
 */
export async function evaluateTechnicianDescentAction(
  technicianId: string,
  config?: FauchardConfigRow,
  metrics?: LeagueMetrics
): Promise<{ success: boolean; data?: DescentResult; error?: string }> {
  if (!(await isLeagueEngineEnabled())) return { success: true, data: { action: 'skipped' } };
  try {
    const cfg = config ?? (await getActiveConfig());

    const [techRow] = await db
      .select({ leagueLevel: user.leagueLevel, watchSince: user.leagueDemotionWatchSince })
      .from(user)
      .where(eq(user.id, technicianId))
      .limit(1);

    if (!techRow) return { success: false, error: 'Técnico no encontrado' };
    const league = (techRow.leagueLevel ?? 'bronce').toLowerCase() as League;

    const m = metrics ?? (await computeLeagueMetricsAction(technicianId, cfg)).data;
    const belowThreshold = m != null && m.avgRating !== null && m.avgRating < parseFloat(cfg.lDescentRating);

    // Rating sano (o sin datos) → limpiar watch si estaba armado.
    if (!belowThreshold) {
      if (techRow.watchSince) {
        await db.update(user).set({ leagueDemotionWatchSince: null }).where(eq(user.id, technicianId));
        return { success: true, data: { action: 'watch_limpiado' } };
      }
      return { success: true, data: { action: 'ninguno' } };
    }

    // Rating bajo → armar watch o evaluar su duración.
    if (!techRow.watchSince) {
      await db.update(user).set({ leagueDemotionWatchSince: new Date() }).where(eq(user.id, technicianId));
      return { success: true, data: { action: 'watch_armado' } };
    }

    const sustainedMs = Date.now() - new Date(techRow.watchSince).getTime();
    if (sustainedMs < cfg.lDescentDays * DAY_MS) {
      return { success: true, data: { action: 'ninguno' } };
    }

    // Watch sostenido suficiente → descender (si hay nivel inferior).
    const down = nextLeagueDown(league);
    if (!down) {
      // Ya en piso (bronce): limpiar watch, nada que descender.
      await db.update(user).set({ leagueDemotionWatchSince: null }).where(eq(user.id, technicianId));
      return { success: true, data: { action: 'ninguno' } };
    }

    await db
      .update(user)
      .set({ leagueLevel: down, leagueDemotionWatchSince: null, leagueTransitionStartedAt: null })
      .where(eq(user.id, technicianId));
    await recordLeagueChange(
      technicianId,
      league,
      down,
      'descenso',
      `rating ${m!.avgRating?.toFixed(2)} < ${cfg.lDescentRating} sostenido ${cfg.lDescentDays}d`
    );
    return { success: true, data: { action: 'descenso', from: league, to: down } };
  } catch (e) {
    console.error('[league] evaluateTechnicianDescentAction error', e);
    return { success: false, error: 'Error evaluando descenso de liga' };
  }
}
