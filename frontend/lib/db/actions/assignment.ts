'use server';

/**
 * Motor de asignación directa Fauchard (solo diseño).
 * Reemplaza invitación + cotización + comparativo.
 */

import { db } from '@/lib/db';
import { perfLog, perfStart } from '@/lib/perfLog';
import {
  caseAssignment,
  clinicalCase,
  dentalMaterial,
  fauchardConfig,
  restorationType as restorationTypeTable,
  review,
  technicianSkill,
  urgencyLevel,
  user,
  vitaShade,
} from '@/lib/db/schema';
import { and, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { notifyUser } from '@/lib/services/notifications';
import {
  CASE_STATUSES,
  INTERNAL_CASE_STATUSES,
} from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import type { ActionResult } from '@/lib/types/actions';
import {
  MIN_SKILL_FOR_CATEGORY,
} from '@/lib/fauchard/caseWorkType';
import { leagueMatches, type LeagueMatchMode } from '@/lib/fauchard/leagueMatch';
import {
  computeAssignmentScore,
  parseAssignmentWeights,
} from '@/lib/fauchard/assignmentScore';
import { POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { isAvailabilityEnabled, isPoolPendienteEnabled } from '@/lib/constants/availabilityFlags';
import { computeEligibleAction, ensureTechnicianAvailabilityAction } from './availability';
import { computeLevelForTechnicianAction } from './noResponseEvents';
import {
  getActiveConfig,
  getConfigForCase,
  loadFauchardConfigById,
  penalizeNoResponseAction,
  type FauchardConfigRow,
} from './fauchard';
import { enterPendingPoolAction } from './poolQueue';
import {
  deriveScenarioFromInputs,
  type ResolvedScenario,
} from '@/lib/fauchard/assignmentScenario';
import {
  computeProposedDeliveryDays,
  deriveDeadlineDays,
  isCompletedOnTime,
} from '@/lib/cases/workDeadline';

export type AssignmentStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

const ACTIVE_CASE_STATUSES = [
  CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
  CASE_STATUSES.EN_EJECUCION,
  CASE_STATUSES.EN_REVISION,
  CASE_STATUSES.CAMBIOS_EN_PROCESO,
] as const;

function assignmentResponseMinutes(config: FauchardConfigRow): number {
  return config.tQuoteMinutes ?? 30;
}

function maxAttempts(config: FauchardConfigRow): number {
  const m = (config as FauchardConfigRow & { maxAssignmentAttempts?: number }).maxAssignmentAttempts;
  return m && m > 0 ? m : 3;
}

export type EligiblePoolResult = {
  pool: typeof user.$inferSelect[];
  leagueMode: LeagueMatchMode | null;
  workType: string;
  caseLeague: string;
  config: FauchardConfigRow;
};

export type ExclusionReason =
  | 'not_available'
  | 'suspended'
  | 'inactive'
  | 'league_mismatch'
  | 'cooldown'
  | 'insufficient_skill'
  | 'availability_filter'
  | 'excluded_manually';

export type RankedCandidate = {
  technicianId: string;
  score: number;
  components: { Q: number; P: number; E: number; B: number; L: number; N: number };
  activeLoad: number;
};

export type RankedTechnicianRow = RankedCandidate & {
  rank: number;
  fullName: string;
  leagueLevel: string;
  excluded: boolean;
  exclusionReason?: ExclusionReason;
  wouldAssign: boolean;
  /** Posición en cadena de reintentos (1 = ganador); null si no está en retryChain. */
  chainPosition: number | null;
};

export async function deriveScenarioFromCase(caseId: string): Promise<ResolvedScenario> {
  const [cRow] = await db
    .select({ cc: clinicalCase, restorationLabel: restorationTypeTable.label })
    .from(clinicalCase)
    .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
    .where(eq(clinicalCase.id, caseId))
    .limit(1) as { cc: typeof clinicalCase.$inferSelect; restorationLabel: string | null }[];

  if (!cRow) throw new Error('Caso no encontrado');
  const teeth = (cRow.cc.teeth as number[]) || [];
  const complexity = (cRow.cc.caseComplexity as import('@/lib/constants/dental').CaseComplexity | null) ?? undefined;
  const scenario = deriveScenarioFromInputs(
    cRow.restorationLabel || '',
    teeth,
    complexity,
    cRow.cc.replacesMissingTeeth,
  );
  if (cRow.cc.derivedWorkType && cRow.cc.derivedCategory) {
    return {
      ...scenario,
      workType: cRow.cc.derivedWorkType as typeof scenario.workType,
      category: cRow.cc.derivedCategory as typeof scenario.category,
    };
  }
  if (cRow.cc.caseLeague) {
    return { ...scenario, caseLeague: cRow.cc.caseLeague };
  }
  return scenario;
}

interface BatchFilterSets {
  cooldownSet: Set<string>;
  skillSet: Set<string>;
}

async function checkTechnicianPassesFilters(
  tech: typeof user.$inferSelect,
  scenario: ResolvedScenario,
  config: FauchardConfigRow,
  exclude: Set<string>,
  mode: 'strict' | 'expand',
  now: Date,
  inactivityThreshold: Date,
  cooldownThreshold: Date,
  batch?: BatchFilterSets,
): Promise<{ ok: boolean; reason?: ExclusionReason }> {
  if (exclude.has(tech.id)) return { ok: false, reason: 'excluded_manually' };
  if (!tech.isAvailable) return { ok: false, reason: 'not_available' };
  if (!leagueMatches(tech.leagueLevel ?? 'bronce', scenario.caseLeague, mode)) {
    return { ok: false, reason: 'league_mismatch' };
  }
  if (tech.suspendedUntil && new Date(tech.suspendedUntil) > now) {
    return { ok: false, reason: 'suspended' };
  }
  if (tech.lastLoginAt && new Date(tech.lastLoginAt) < inactivityThreshold) {
    return { ok: false, reason: 'inactive' };
  }

  if (batch) {
    if (batch.cooldownSet.has(tech.id)) return { ok: false, reason: 'cooldown' };
    if (!batch.skillSet.has(tech.id)) return { ok: false, reason: 'insufficient_skill' };
  } else {
    const t0cooldown = perfStart();
    const [recent] = await db
      .select({ id: caseAssignment.id })
      .from(caseAssignment)
      .where(
        and(
          eq(caseAssignment.technicianId, tech.id),
          gt(caseAssignment.assignedAt, cooldownThreshold),
          eq(caseAssignment.workType, scenario.workType),
        ),
      )
      .limit(1);
    perfLog('checkFilters.cooldown_query', Date.now() - t0cooldown, { techId: tech.id });
    if (recent) return { ok: false, reason: 'cooldown' };

    const minSkill = MIN_SKILL_FOR_CATEGORY[scenario.caseLeague] ?? 1;
    const t0skill = perfStart();
    const [skill] = await db
      .select()
      .from(technicianSkill)
      .where(
        and(
          eq(technicianSkill.userId, tech.id),
          eq(technicianSkill.workType, scenario.workType),
          gte(technicianSkill.designLevel, minSkill),
        ),
      )
      .limit(1);
    perfLog('checkFilters.skill_query', Date.now() - t0skill, { techId: tech.id });
    if (!skill) return { ok: false, reason: 'insufficient_skill' };
  }

  if (isAvailabilityEnabled()) {
    const t0avail = perfStart();
    await ensureTechnicianAvailabilityAction(tech.id);
    if (!(await computeEligibleAction(tech.id, scenario.category, 'cad'))) {
      perfLog('checkFilters.availability_query', Date.now() - t0avail, { techId: tech.id, result: 'ineligible' });
      return { ok: false, reason: 'availability_filter' };
    }
    perfLog('checkFilters.availability_query', Date.now() - t0avail, { techId: tech.id, result: 'eligible' });
  }

  return { ok: true };
}

/** Filtros duros + expansión de liga (máx 2 intentos). */
export async function buildEligiblePoolForScenario(
  scenario: ResolvedScenario,
  config: FauchardConfigRow,
  excludeTechIds: string[] = [],
): Promise<EligiblePoolResult> {
  const t0total = perfStart();
  const now = new Date();
  const inactivityThreshold = new Date(now.getTime() - config.dInactivityDays * 86400000);
  const cooldownThreshold = new Date(now.getTime() - config.tCooldownMinutes * 60000);
  const exclude = new Set(excludeTechIds);

  const t0fetch = perfStart();
  const candidates = await db
    .select()
    .from(user)
    .where(and(eq(user.role, 'tecnico'), eq(user.isActive, true), eq(user.isAvailable, true)));
  perfLog('buildEligiblePool.fetch_candidates', Date.now() - t0fetch, { count: candidates.length });

  const techIds = candidates.map(t => t.id);
  const minSkill = MIN_SKILL_FOR_CATEGORY[scenario.caseLeague] ?? 1;

  const t0batch = perfStart();
  const [recentAssignments, eligibleSkills] = await Promise.all([
    techIds.length > 0
      ? db.select({ technicianId: caseAssignment.technicianId })
          .from(caseAssignment)
          .where(and(
            inArray(caseAssignment.technicianId, techIds),
            gt(caseAssignment.assignedAt, cooldownThreshold),
            eq(caseAssignment.workType, scenario.workType),
          ))
      : Promise.resolve([]),
    techIds.length > 0
      ? db.select({ userId: technicianSkill.userId })
          .from(technicianSkill)
          .where(and(
            inArray(technicianSkill.userId, techIds),
            eq(technicianSkill.workType, scenario.workType),
            gte(technicianSkill.designLevel, minSkill),
          ))
      : Promise.resolve([]),
  ]);
  perfLog('buildEligiblePool.batch_queries', Date.now() - t0batch, { candidates: techIds.length });

  const batch: BatchFilterSets = {
    cooldownSet: new Set(recentAssignments.map(r => r.technicianId)),
    skillSet: new Set(eligibleSkills.map(s => s.userId)),
  };

  for (const mode of ['strict', 'expand'] as const) {
    const pool: typeof user.$inferSelect[] = [];
    const t0loop = perfStart();
    for (const tech of candidates) {
      const { ok } = await checkTechnicianPassesFilters(
        tech, scenario, config, exclude, mode, now, inactivityThreshold, cooldownThreshold, batch,
      );
      if (ok) pool.push(tech);
    }
    perfLog('buildEligiblePool.filter_loop', Date.now() - t0loop, { mode, candidates: candidates.length, poolSize: pool.length });
    if (pool.length > 0) {
      perfLog('buildEligiblePool.total', Date.now() - t0total, { mode, poolSize: pool.length, workType: scenario.workType });
      return { pool, leagueMode: mode, workType: scenario.workType, caseLeague: scenario.caseLeague, config };
    }
  }

  perfLog('buildEligiblePool.total', Date.now() - t0total, { mode: 'none', poolSize: 0, workType: scenario.workType });
  return { pool: [], leagueMode: null, workType: scenario.workType, caseLeague: scenario.caseLeague, config };
}

/** Evalúa técnicos para embudo de simulación — eligible = pool de ranking (liga strict-first). */
export async function evaluateTechniciansForScenario(
  scenario: ResolvedScenario,
  config: FauchardConfigRow,
  excludeTechIds: string[] = [],
): Promise<{
  universe: typeof user.$inferSelect[];
  eligible: typeof user.$inferSelect[];
  excluded: Record<ExclusionReason, number>;
  exclusionByTech: Map<string, ExclusionReason>;
  leagueMode: LeagueMatchMode | null;
}> {
  const now = new Date();
  const inactivityThreshold = new Date(now.getTime() - config.dInactivityDays * 86400000);
  const cooldownThreshold = new Date(now.getTime() - config.tCooldownMinutes * 60000);
  const exclude = new Set(excludeTechIds);

  const { pool, leagueMode } = await buildEligiblePoolForScenario(scenario, config, excludeTechIds);
  const poolIds = new Set(pool.map(t => t.id));

  const universe = await db
    .select()
    .from(user)
    .where(and(eq(user.role, 'tecnico'), eq(user.isActive, true)));

  const universeIds = universe.map(t => t.id);
  const minSkill = MIN_SKILL_FOR_CATEGORY[scenario.caseLeague] ?? 1;
  const [recentAssignments, eligibleSkills] = await Promise.all([
    universeIds.length > 0
      ? db.select({ technicianId: caseAssignment.technicianId })
          .from(caseAssignment)
          .where(and(
            inArray(caseAssignment.technicianId, universeIds),
            gt(caseAssignment.assignedAt, cooldownThreshold),
            eq(caseAssignment.workType, scenario.workType),
          ))
      : Promise.resolve([]),
    universeIds.length > 0
      ? db.select({ userId: technicianSkill.userId })
          .from(technicianSkill)
          .where(and(
            inArray(technicianSkill.userId, universeIds),
            eq(technicianSkill.workType, scenario.workType),
            gte(technicianSkill.designLevel, minSkill),
          ))
      : Promise.resolve([]),
  ]);
  const evalBatch: BatchFilterSets = {
    cooldownSet: new Set(recentAssignments.map(r => r.technicianId)),
    skillSet: new Set(eligibleSkills.map(s => s.userId)),
  };

  const excluded: Record<ExclusionReason, number> = {
    not_available: 0,
    suspended: 0,
    inactive: 0,
    league_mismatch: 0,
    cooldown: 0,
    insufficient_skill: 0,
    availability_filter: 0,
    excluded_manually: 0,
  };
  const exclusionByTech = new Map<string, ExclusionReason>();
  const modeForExclusion = leagueMode ?? 'strict';

  for (const tech of universe) {
    if (poolIds.has(tech.id)) continue;
    const result = await checkTechnicianPassesFilters(
      tech, scenario, config, exclude, modeForExclusion, now, inactivityThreshold, cooldownThreshold, evalBatch,
    );
    if (!result.ok && result.reason) {
      excluded[result.reason]++;
      exclusionByTech.set(tech.id, result.reason);
    }
  }

  return { universe, eligible: pool, excluded, exclusionByTech, leagueMode };
}

type TechRow = typeof user.$inferSelect;

function scenarioToSimulationScenario(scenario: ResolvedScenario): import('@/lib/fauchard/simulationTypes').SimulationScenario {
  return {
    workType: scenario.workType,
    caseLeague: scenario.caseLeague,
    caseComplexity: scenario.caseComplexity,
    category: scenario.category,
  };
}

/** Embudo secuencial: aplica filtros en orden canónico y registra conteos por etapa. */
export async function buildFunnelStagesForScenario(
  scenario: ResolvedScenario,
  config: FauchardConfigRow,
  excludeTechIds: string[] = [],
): Promise<import('@/lib/fauchard/simulationTypes').FunnelStage[]> {
  const { getFunnelStageMeta, markFunnelBottlenecks } = await import('@/lib/fauchard/simulationHelpers');
  const {
    passesCooldown,
    passesExcludedManually,
    passesInactive,
    passesLeagueForMode,
    passesNotAvailable,
    passesSkill,
    passesSuspended,
  } = await import('@/lib/fauchard/funnelStagePredicates');

  const { leagueMode } = await buildEligiblePoolForScenario(scenario, config, excludeTechIds);
  // Si el pool quedó vacío (leagueMode=null), usar 'expand' para que el funnel
  // muestre la razón real de exclusión de cada técnico en el modo más permisivo.
  const leagueFilterMode = leagueMode ?? 'expand';

  const simScenario = scenarioToSimulationScenario(scenario);
  const availabilityOn = isAvailabilityEnabled();
  const now = new Date();
  const inactivityThreshold = new Date(now.getTime() - config.dInactivityDays * 86400000);
  const cooldownThreshold = new Date(now.getTime() - config.tCooldownMinutes * 60000);
  const exclude = new Set(excludeTechIds);
  const minSkill = MIN_SKILL_FOR_CATEGORY[scenario.caseLeague] ?? 1;

  const universe = await db
    .select()
    .from(user)
    .where(and(eq(user.role, 'tecnico'), eq(user.isActive, true)));

  const universeIds = universe.map((t) => t.id);

  const [skillRows, cooldownRows] = await Promise.all([
    universeIds.length
      ? db
          .select({ userId: technicianSkill.userId, designLevel: technicianSkill.designLevel })
          .from(technicianSkill)
          .where(
            and(
              inArray(technicianSkill.userId, universeIds),
              eq(technicianSkill.workType, scenario.workType),
            ),
          )
      : Promise.resolve([] as { userId: string; designLevel: number }[]),
    universeIds.length
      ? db
          .select({ technicianId: caseAssignment.technicianId })
          .from(caseAssignment)
          .where(
            and(
              inArray(caseAssignment.technicianId, universeIds),
              gt(caseAssignment.assignedAt, cooldownThreshold),
              eq(caseAssignment.workType, scenario.workType),
            ),
          )
      : Promise.resolve([] as { technicianId: string }[]),
  ]);

  const skillByUser = new Map<string, number>();
  for (const row of skillRows) {
    const prev = skillByUser.get(row.userId);
    if (prev == null || row.designLevel > prev) {
      skillByUser.set(row.userId, row.designLevel);
    }
  }
  const cooldownTechIds = new Set(cooldownRows.map((r) => r.technicianId));

  type StageDef = {
    id: import('@/lib/fauchard/simulationTypes').FunnelStageId;
    filter: (tech: TechRow) => boolean;
    skipped?: boolean;
  };

  const stageDefs: StageDef[] = [
    {
      id: 'universe',
      filter: () => true,
    },
    {
      id: 'excluded_manually',
      filter: (tech) => passesExcludedManually(tech.id, exclude),
    },
    {
      id: 'not_available',
      filter: (tech) => passesNotAvailable(tech.isAvailable),
    },
    {
      id: 'league',
      filter: (tech) => passesLeagueForMode(tech.leagueLevel, scenario.caseLeague, leagueFilterMode),
    },
    {
      id: 'suspended',
      filter: (tech) => passesSuspended(tech.suspendedUntil, now),
    },
    {
      id: 'inactive',
      filter: (tech) => passesInactive(tech.lastLoginAt, inactivityThreshold),
    },
    {
      id: 'cooldown',
      filter: (tech) => passesCooldown(tech.id, cooldownTechIds),
    },
    {
      id: 'insufficient_skill',
      filter: (tech) => passesSkill(tech.id, skillByUser, minSkill),
    },
  ];

  if (availabilityOn) {
    stageDefs.push({
      id: 'availability_filter',
      filter: () => true,
    });
  } else {
    stageDefs.push({
      id: 'availability_filter',
      filter: () => true,
      skipped: true,
    });
  }

  stageDefs.push({ id: 'eligible', filter: () => true });

  const stages: import('@/lib/fauchard/simulationTypes').FunnelStage[] = [];
  let remaining: TechRow[] = [...universe];

  for (const def of stageDefs) {
    const meta = getFunnelStageMeta(def.id, simScenario, availabilityOn);

    if (def.id === 'universe') {
      stages.push({
        id: 'universe',
        label: meta.label,
        countAfter: remaining.length,
        dropped: 0,
        fixHint: meta.fixHint,
      });
      continue;
    }

    if (def.id === 'availability_filter' && def.skipped) {
      stages.push({
        id: 'availability_filter',
        label: `${meta.label} (inactiva)`,
        countAfter: remaining.length,
        dropped: 0,
        fixHint: meta.fixHint,
        reason: meta.reason,
        skipped: true,
      });
      continue;
    }

    if (def.id === 'availability_filter' && availabilityOn) {
      const next: TechRow[] = [];
      const t0avail = perfStart();
      for (const tech of remaining) {
        const t0each = perfStart();
        await ensureTechnicianAvailabilityAction(tech.id);
        const eligible = await computeEligibleAction(tech.id, scenario.category, 'cad');
        perfLog('buildFunnel.availability_per_tech', Date.now() - t0each, { techId: tech.id, eligible });
        if (eligible) {
          next.push(tech);
        }
      }
      perfLog('buildFunnel.availability_loop', Date.now() - t0avail, { checked: remaining.length, passed: next.length });
      const dropped = remaining.length - next.length;
      stages.push({
        id: 'availability_filter',
        label: meta.label,
        countAfter: next.length,
        dropped,
        fixHint: meta.fixHint,
        reason: meta.reason,
      });
      remaining = next;
      continue;
    }

    if (def.id === 'eligible') {
      stages.push({
        id: 'eligible',
        label: meta.label,
        countAfter: remaining.length,
        dropped: 0,
        fixHint: meta.fixHint,
      });
      continue;
    }

    const next = remaining.filter(def.filter);
    const dropped = remaining.length - next.length;
    stages.push({
      id: def.id,
      label: meta.label,
      countAfter: next.length,
      dropped,
      fixHint: meta.fixHint,
      reason: meta.reason,
      ...(def.id === 'league' && leagueMode ? { leagueModeApplied: leagueMode } : {}),
    });
    remaining = next;
  }

  const poolEmpty = remaining.length === 0;
  return markFunnelBottlenecks(stages, poolEmpty);
}

/** Filtros duros + expansión de liga (máx 2 intentos). */
export async function buildEligiblePool(
  caseId: string,
  excludeTechIds: string[] = [],
): Promise<{ pool: typeof user.$inferSelect[]; workType: string; caseLeague: string; config: FauchardConfigRow }> {
  const config = await getConfigForCase(caseId);
  const scenario = await deriveScenarioFromCase(caseId);
  return buildEligiblePoolForScenario(scenario, config, excludeTechIds);
}

async function bulkAssignmentData(techIds: string[], config: FauchardConfigRow, workType: string) {
  if (!techIds.length) {
    return {
      ratings: [] as { revieweeId: string; rating: number }[],
      completed: [] as {
        technicianId: string;
        completedAt: Date | null;
        publishedAt: Date | null;
        desiredDeliveryAt: Date | null;
        deadlineDays: number | null;
      }[],
      skills: [] as { userId: string; designLevel: number }[],
      activeLoads: new Map<string, number>(),
    };
  }

  const now = new Date();
  // Ventana histórica unificada: gobierna Calidad (Q) y Puntualidad (P).
  const historyWindow = new Date(now.getTime() - config.wQualityDays * 86400000);

  const [ratings, completed, skills, activeRows] = await Promise.all([
    db
      .select({ revieweeId: review.revieweeId, rating: review.rating })
      .from(review)
      .where(
        and(
          inArray(review.revieweeId, techIds),
          gt(review.createdAt, historyWindow),
          eq(review.dimension, 'design'),
        ),
      ),
    db
      .select({
        technicianId: caseAssignment.technicianId,
        completedAt: clinicalCase.completedAt,
        publishedAt: clinicalCase.publishedAt,
        desiredDeliveryAt: clinicalCase.desiredDeliveryAt,
        deadlineDays: caseAssignment.deadlineDays,
      })
      .from(caseAssignment)
      .innerJoin(clinicalCase, eq(clinicalCase.id, caseAssignment.clinicalCaseId))
      .where(
        and(
          inArray(caseAssignment.technicianId, techIds),
          eq(caseAssignment.status, 'accepted'),
          sql`${clinicalCase.completedAt} IS NOT NULL`,
          gt(clinicalCase.completedAt, historyWindow),
        ),
      ),
    db
      .select({ userId: technicianSkill.userId, designLevel: technicianSkill.designLevel })
      .from(technicianSkill)
      .where(and(inArray(technicianSkill.userId, techIds), eq(technicianSkill.workType, workType))),
    db
      .select({ technicianId: clinicalCase.assignedTechnicianId })
      .from(clinicalCase)
      .where(
        and(
          inArray(clinicalCase.assignedTechnicianId, techIds),
          inArray(clinicalCase.status, [...ACTIVE_CASE_STATUSES]),
        ),
      ),
  ]);

  const activeLoads = new Map<string, number>();
  for (const id of techIds) activeLoads.set(id, 0);
  for (const row of activeRows) {
    if (row.technicianId) {
      activeLoads.set(row.technicianId, (activeLoads.get(row.technicianId) ?? 0) + 1);
    }
  }

  return { ratings, completed, skills, activeLoads };
}

async function rankPool(
  pool: typeof user.$inferSelect[],
  workType: string,
  config: FauchardConfigRow,
): Promise<RankedCandidate[]> {
  if (!pool.length) return [];

  const techIds = pool.map((t) => t.id);
  const data = await bulkAssignmentData(techIds, config, workType);
  const weights = parseAssignmentWeights(config);
  const availabilityOn = isAvailabilityEnabled();
  // Piso del divisor de carga: configurable vía fauchard_config.loadReferenceMin (default 5).
  const loadBaseline = config.loadReferenceMin ?? 5;
  const maxLoad = Math.max(loadBaseline, ...Array.from(data.activeLoads.values()), 1);

  const ranked: RankedCandidate[] = [];
  const now = Date.now();

  for (const tech of pool) {
    const techRatings = data.ratings.filter((r) => r.revieweeId === tech.id).map((r) => r.rating);
    const avgRating =
      techRatings.length > 0 ? techRatings.reduce((a, b) => a + b, 0) / techRatings.length : null;

    const invs = data.completed.filter((i) => i.technicianId === tech.id);
    let onTime = 0;
    for (const inv of invs) {
      if (inv.completedAt && isCompletedOnTime(inv.completedAt, inv.desiredDeliveryAt, inv.publishedAt, inv.deadlineDays)) {
        onTime++;
      }
    }
    const onTimeRate = invs.length > 0 ? onTime / invs.length : null;

    const skillRow = data.skills.find((s) => s.userId === tech.id);
    const designLevel = skillRow?.designLevel ?? 0;
    const activeLoad = data.activeLoads.get(tech.id) ?? 0;

    let sanctionLevel = 0 as 0 | 1 | 2 | 3;
    if (availabilityOn) {
      const lvl = await computeLevelForTechnicianAction(tech.id);
      sanctionLevel = lvl.level;
    }

    const daysSinceAssignment = tech.lastInvitedAt
      ? Math.floor((now - new Date(tech.lastInvitedAt).getTime()) / 86400000)
      : Number.MAX_SAFE_INTEGER;

    const { score, components } = computeAssignmentScore(
      {
        avgRating,
        onTimeRate,
        designLevel,
        activeLoad,
        maxActiveLoad: maxLoad,
        sanctionLevel,
        daysSinceAssignment,
        dBonusMaxDays: config.dBonusMaxDays,
      },
      weights,
    );

    ranked.push({ technicianId: tech.id, score, components, activeLoad });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.activeLoad !== b.activeLoad) return a.activeLoad - b.activeLoad;
    const aLast = pool.find((t) => t.id === a.technicianId)?.lastInvitedAt;
    const bLast = pool.find((t) => t.id === b.technicianId)?.lastInvitedAt;
    const aT = aLast ? new Date(aLast).getTime() : 0;
    const bT = bLast ? new Date(bLast).getTime() : 0;
    return aT - bT;
  });

  return ranked;
}

export async function rankCandidatesForScenario(
  scenario: ResolvedScenario,
  config: FauchardConfigRow,
  excludeTechIds: string[] = [],
): Promise<RankedCandidate[]> {
  const { pool } = await buildEligiblePoolForScenario(scenario, config, excludeTechIds);
  return rankPool(pool, scenario.workType, config);
}

export async function rankAssignmentCandidates(
  caseId: string,
  excludeTechIds: string[] = [],
): Promise<RankedCandidate[]> {
  const { pool, workType, config } = await buildEligiblePool(caseId, excludeTechIds);
  return rankPool(pool, workType, config);
}

/** Embudo resumido al entrar en pendiente_pool (mismo motor que simulador). */
async function buildPoolEntryDiagnostics(caseId: string, config: FauchardConfigRow) {
  const scenario = await deriveScenarioFromCase(caseId);
  const { universe, eligible, excluded } = await evaluateTechniciansForScenario(scenario, config);
  const topExclusions = Object.fromEntries(
    Object.entries(excluded)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  );
  return {
    eligible: eligible.length,
    universe: universe.length,
    topExclusions,
    workType: scenario.workType,
    category: scenario.category,
  };
}

async function logCaseEnteredPoolEvent(
  caseId: string,
  actorId: string,
  diagnostics: Awaited<ReturnType<typeof buildPoolEntryDiagnostics>>,
) {
  const parts = Object.entries(diagnostics.topExclusions)
    .map(([k, n]) => `${k}: ${n}`)
    .join(', ');
  const summary = parts
    ? `Principales filtros: ${parts}.`
    : 'Ningún técnico activo pasó los filtros de elegibilidad.';
  await logCaseEvent({
    caseId,
    userId: actorId,
    type: 'sistema',
    action: CASE_EVENTS.CASO_EN_COLA,
    content: `No hay técnicos elegibles ahora. El caso entra en cola de espera.`,
    payload: {
      visibleTo: 'dentista',
      ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
      eligible: diagnostics.eligible,
      universe: diagnostics.universe,
      topExclusions: diagnostics.topExclusions,
      workType: diagnostics.workType,
      category: diagnostics.category,
    },
  });
}

/** Selección + asignación top-1 o cola pool. */
export async function runAssignmentAction(caseId: string): Promise<{
  success: boolean;
  technicianId?: string;
  fauchardConfigId?: string;
  pooled?: boolean;
  error?: string;
}> {
  const identity = await getServerIdentity();
  if (!identity) return { success: false, error: 'No autenticado' };
  const t0run = perfStart();

  try {
    await db
      .update(clinicalCase)
      .set({ internalStatus: INTERNAL_CASE_STATUSES.SELECCIONANDO_TECNICOS })
      .where(eq(clinicalCase.id, caseId));

    const ranked = await rankAssignmentCandidates(caseId);
    const config = await getConfigForCase(caseId);

    if (!ranked.length) {
      if (isAvailabilityEnabled() && isPoolPendienteEnabled()) {
        const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
        const wasAlreadyInPool = cCase?.internalStatus === POOL_INTERNAL_STATUS;
        if (!wasAlreadyInPool) {
          await enterPendingPoolAction(caseId);
          try {
            const diagnostics = await buildPoolEntryDiagnostics(caseId, config);
            await logCaseEnteredPoolEvent(caseId, identity.id as string, diagnostics);
          } catch (e) {
            console.warn('[runAssignmentAction] log CASO_EN_COLA falló:', e);
          }
        }
        return { success: false, pooled: true, error: 'pendiente_pool', fauchardConfigId: config.id };
      }
      return { success: false, error: 'No se encontraron técnicos disponibles para asignar.' };
    }

    perfLog('runAssignmentAction', Date.now() - t0run, { caseId, poolSize: ranked.length });
    return {
      success: true,
      technicianId: ranked[0].technicianId,
      fauchardConfigId: config.id,
    };
  } catch (error) {
    console.error('[runAssignmentAction]', error);
    return { success: false, error: String(error) };
  }
}

export async function assignCaseAction(
  caseId: string,
  technicianId: string,
  opts?: { fauchardConfigId?: string; pinCaseToConfig?: boolean; isReassignment?: boolean; score?: number; systemActorId?: string },
): Promise<ActionResult<{ assignmentId: string; expiresAt: Date }>> {
  const identity = opts?.systemActorId ? null : await getServerIdentity();
  if (!identity && !opts?.systemActorId) return { success: false, error: 'No autenticado' };
  const actorId = (identity?.id ?? opts?.systemActorId) as string;

  try {
    const config = opts?.fauchardConfigId
      ? await loadFauchardConfigById(opts.fauchardConfigId)
      : await getConfigForCase(caseId);

    const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    if (!cCase) return { success: false, error: 'Caso no encontrado' };

    const [existing] = await db
      .select({ id: caseAssignment.id })
      .from(caseAssignment)
      .where(
        and(
          eq(caseAssignment.clinicalCaseId, caseId),
          eq(caseAssignment.technicianId, technicianId),
          eq(caseAssignment.status, 'pending'),
        ),
      )
      .limit(1);
    if (existing) return { success: false, error: 'Ya existe una asignación pendiente para este técnico' };

    const attempts = await db
      .select({ id: caseAssignment.id })
      .from(caseAssignment)
      .where(eq(caseAssignment.clinicalCaseId, caseId));
    if (attempts.length >= maxAttempts(config)) {
      return { success: false, error: 'Se alcanzó el máximo de intentos de asignación' };
    }

    const { workType } = await deriveScenarioFromCase(caseId);
    const expiresAt = new Date(Date.now() + assignmentResponseMinutes(config) * 60000);
    const compensation = cCase.listPriceCost ? parseFloat(String(cCase.listPriceCost)) : null;
    const deadlineDays = deriveDeadlineDays(cCase.desiredDeliveryAt);

    let score = opts?.score;
    if (score == null) {
      const ranked = await rankAssignmentCandidates(caseId);
      score = ranked.find((r) => r.technicianId === technicianId)?.score ?? 0;
    }

    const [created] = await db
      .insert(caseAssignment)
      .values({
        clinicalCaseId: caseId,
        technicianId,
        status: 'pending',
        assignedAt: new Date(),
        expiresAt,
        compensation,
        deadlineDays,
        scoreAtAssignment: String(score.toFixed(4)),
        workType,
        isReassignment: opts?.isReassignment ?? false,
      })
      .returning({ id: caseAssignment.id });

    await db
      .update(user)
      .set({ lastInvitedAt: new Date() })
      .where(eq(user.id, technicianId));

    await db
      .update(clinicalCase)
      .set({
        status: CASE_STATUSES.EN_EVALUACION,
        internalStatus: INTERNAL_CASE_STATUSES.ASIGNACION_PENDIENTE,
        proposedPrice: cCase.listPriceSale ? parseFloat(String(cCase.listPriceSale)) : cCase.proposedPrice,
        updatedAt: new Date(),
        ...(opts?.pinCaseToConfig && opts.fauchardConfigId
          ? { fauchardConfigId: opts.fauchardConfigId }
          : {}),
      })
      .where(eq(clinicalCase.id, caseId));

    await notifyUser(technicianId, 'NUEVA_ASIGNACION', {
      caseId,
      deadline: expiresAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    });

    await logCaseEvent({
      caseId,
      userId: actorId,
      type: 'sistema',
      action: CASE_EVENTS.ASIGNACION_ENVIADA,
      content: 'Asignación registrada.',
      payload: { technicianId, expiresAt: expiresAt.toISOString(), visibleTo: 'sistema' },
    });

    if (created?.id && !opts?.isReassignment) {
      await logCaseEvent({
        caseId,
        userId: technicianId,
        type: 'sistema',
        action: CASE_EVENTS.ASIGNACION_RECIBIDA,
        content: 'Tienes una nueva asignación de diseño.',
        payload: {
          assignmentId: created.id,
          compensation,
          deadlineDays,
          expiresAt: expiresAt.toISOString(),
          visibleTo: 'tecnico',
          ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
        },
      });
    }

    return { success: true, assignmentId: created!.id, expiresAt };
  } catch (error) {
    console.error('[assignCaseAction]', error);
    return { success: false, error: String(error) };
  }
}

export async function acceptAssignmentAction(assignmentId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };

  try {
    const [row] = await db
      .select()
      .from(caseAssignment)
      .where(eq(caseAssignment.id, assignmentId))
      .limit(1);
    if (!row) return { success: false, error: 'Asignación no encontrada' };
    if (row.technicianId !== identity.id) return { success: false, error: 'No autorizado' };
    if (row.status !== 'pending') return { success: false, error: 'Esta asignación ya no está pendiente' };
    if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
      return { success: false, error: 'El plazo para aceptar la asignación ha vencido' };
    }

    const [cCase] = await db
      .select()
      .from(clinicalCase)
      .where(eq(clinicalCase.id, row.clinicalCaseId))
      .limit(1);
    if (!cCase || cCase.status !== CASE_STATUSES.EN_EVALUACION) {
      return { success: false, error: 'El caso ya no está en evaluación' };
    }

    const now = new Date();
    const proposedPrice = cCase.listPriceSale ? parseFloat(String(cCase.listPriceSale)) : null;
    const proposedDeliveryDays = computeProposedDeliveryDays(cCase.publishedAt, cCase.desiredDeliveryAt);

    await db.transaction(async (tx) => {
      await tx
        .update(caseAssignment)
        .set({ status: 'accepted', respondedAt: now, updatedAt: now })
        .where(eq(caseAssignment.id, assignmentId));

      await tx
        .update(clinicalCase)
        .set({
          status: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
          internalStatus: INTERNAL_CASE_STATUSES.ACEPTADA_CONFIGURANDO,
          assignedTechnicianId: row.technicianId,
          assignedAt: now,
          proposedPrice,
          proposedDeliveryDays,
          proposedDeliveryHours: 0,
          updatedAt: now,
          lastActivityAt: now,
        })
        .where(eq(clinicalCase.id, row.clinicalCaseId));
    });

    await logCaseEvent({
      caseId: row.clinicalCaseId,
      userId: identity.id,
      type: 'sistema',
      action: CASE_EVENTS.ASIGNACION_ACEPTADA,
      content: 'Aceptaste la asignación.',
      payload: { assignmentId, visibleTo: 'tecnico' },
    });

    if (cCase.doctorId) {
      await notifyUser(cCase.doctorId, 'ASIGNACION_ACEPTADA', { caseId: row.clinicalCaseId });
    }

    return { success: true };
  } catch (error) {
    console.error('[acceptAssignmentAction]', error);
    return { success: false, error: String(error) };
  }
}

export async function expirePendingAssignmentsForCase(caseId: string): Promise<number> {
  const now = new Date();
  const expired = await db
    .update(caseAssignment)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(caseAssignment.clinicalCaseId, caseId),
        eq(caseAssignment.status, 'pending'),
        sql`${caseAssignment.expiresAt} < ${now}`,
      ),
    )
    .returning({ id: caseAssignment.id, technicianId: caseAssignment.technicianId });

  for (const row of expired) {
    await penalizeNoResponseAction(row.technicianId, row.id);
    await logCaseEvent({
      caseId,
      userId: row.technicianId,
      type: 'sistema',
      action: CASE_EVENTS.ASIGNACION_EXPIRADA,
      content: 'La asignación venció sin respuesta.',
      payload: { assignmentId: row.id, visibleTo: 'tecnico', ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
    });
  }

  return expired.length;
}

export async function batchExpireAssignmentsForCases(caseIds: string[]): Promise<void> {
  for (const id of caseIds) {
    await expirePendingAssignmentsForCase(id);
  }
}

function mergeConfig(base: FauchardConfigRow, override?: Record<string, unknown>): FauchardConfigRow {
  if (!override) return base;
  return { ...base, ...override } as FauchardConfigRow;
}

/** Carga parámetros de un caso publicado para sembrar el simulador admin (paridad con producción). */
export async function getSimulatorSeedFromCaseAction(caseId: string): Promise<
  ActionResult<{
    restorationCode: string;
    materialCode: string;
    shadeCode: string;
    urgencyLabel: string;
    teethCount: number;
    teeth: number[];
    replacesMissingTeeth: boolean | null;
    complexityMode: 'auto' | 'manual';
    caseComplexity?: import('@/lib/constants/dental').CaseComplexity;
    fauchardConfigId?: string;
    fauchardConfigVersion?: number;
    fauchardConfigCreatedAt?: Date;
  }>
> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const [row] = await db
      .select({
        teeth: clinicalCase.teeth,
        replacesMissingTeeth: clinicalCase.replacesMissingTeeth,
        caseComplexity: clinicalCase.caseComplexity,
        fauchardConfigId: clinicalCase.fauchardConfigId,
        fauchardConfigVersion: fauchardConfig.version,
        fauchardConfigCreatedAt: fauchardConfig.createdAt,
        restorationCode: restorationTypeTable.code,
        materialCode: dentalMaterial.code,
        shadeCode: vitaShade.code,
        urgencyLabel: urgencyLevel.label,
      })
      .from(clinicalCase)
      .leftJoin(fauchardConfig, eq(fauchardConfig.id, clinicalCase.fauchardConfigId))
      .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
      .leftJoin(dentalMaterial, eq(dentalMaterial.id, clinicalCase.materialId))
      .leftJoin(vitaShade, eq(vitaShade.id, clinicalCase.shadeId))
      .leftJoin(urgencyLevel, eq(urgencyLevel.id, clinicalCase.urgencyId))
      .where(
        caseId.toUpperCase().startsWith('DF-')
          ? eq(clinicalCase.caseNumber, caseId.toUpperCase())
          : eq(clinicalCase.id, caseId),
      )
      .limit(1);

    if (!row?.restorationCode || !row.materialCode || !row.shadeCode || !row.urgencyLabel) {
      return { success: false, error: 'Caso no encontrado o catálogos incompletos' };
    }

    const teeth = (row.teeth as number[]) ?? [];
    const caseComplexity = row.caseComplexity as import('@/lib/constants/dental').CaseComplexity | null;

    return {
      success: true,
      restorationCode: row.restorationCode,
      materialCode: row.materialCode,
      shadeCode: row.shadeCode,
      urgencyLabel: row.urgencyLabel,
      teethCount: Math.max(1, teeth.length),
      teeth,
      replacesMissingTeeth: row.replacesMissingTeeth,
      complexityMode: caseComplexity ? 'manual' : 'auto',
      ...(caseComplexity ? { caseComplexity } : {}),
      ...(row.fauchardConfigId ? {
        fauchardConfigId: row.fauchardConfigId,
        ...(row.fauchardConfigVersion != null ? { fauchardConfigVersion: row.fauchardConfigVersion } : {}),
        ...(row.fauchardConfigCreatedAt ? { fauchardConfigCreatedAt: row.fauchardConfigCreatedAt } : {}),
      } : {}),
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Simula asignación directa: caso virtual → ranking Q/P/E/B/L/N (pool real). */
export async function simulateAssignmentAction(
  params: import('@/lib/fauchard/simulationTypes').SimulateAssignmentParams,
): Promise<ActionResult<{ simulation: import('@/lib/fauchard/simulationTypes').SimulationResult }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const baseConfig = params.fauchardConfigId
      ? await loadFauchardConfigById(params.fauchardConfigId)
      : await getActiveConfig();
    const config = mergeConfig(baseConfig, params.configOverride);
    const complexityOverride =
      params.complexityMode === 'auto' ? undefined : params.caseComplexity;
    const scenario = deriveScenarioFromInputs(
      params.restorationLabel,
      params.teeth ?? [],
      complexityOverride,
      params.replacesMissingTeeth,
    );
    const exclude = params.excludeTechnicianIds ?? [];

    const { resolvePricePreviewForSimulation, buildChainPositionMap, buildRetryChainDetails } =
      await import('@/lib/fauchard/simulationHelpers');

    const pricePreview = await resolvePricePreviewForSimulation({
      restorationCode: params.restorationCode,
      materialCode: params.materialCode,
      shadeCode: params.shadeCode,
      urgencyLabel: params.urgencyLabel,
    });

    const { universe, eligible, excluded, exclusionByTech } = await evaluateTechniciansForScenario(
      scenario,
      config,
      exclude,
    );
    const stages = await buildFunnelStagesForScenario(scenario, config, exclude);
    const rankedCore = await rankCandidatesForScenario(scenario, config, exclude);
    const eligibleIds = new Set(eligible.map((t) => t.id));
    const techById = new Map(universe.map((t) => [t.id, t]));

    const attemptsBudget = maxAttempts(config);
    const retryChain = rankedCore
      .slice(0, attemptsBudget)
      .map((r) => r.technicianId);
    const chainPosMap = buildChainPositionMap(retryChain);
    const retryChainDetails = buildRetryChainDetails(rankedCore, retryChain, techById);

    const ranked: RankedTechnicianRow[] = [];
    let rank = 1;
    for (const r of rankedCore) {
      const tech = techById.get(r.technicianId);
      const rowRank = rank++;
      const chainPosition = chainPosMap.get(r.technicianId) ?? null;
      ranked.push({
        ...r,
        rank: rowRank,
        fullName: tech?.fullName ?? r.technicianId,
        leagueLevel: tech?.leagueLevel ?? 'bronce',
        excluded: false,
        wouldAssign: chainPosition === 1,
        chainPosition,
      });
    }

    for (const tech of universe) {
      if (eligibleIds.has(tech.id)) continue;
      ranked.push({
        technicianId: tech.id,
        fullName: tech.fullName ?? tech.id,
        leagueLevel: tech.leagueLevel ?? 'bronce',
        score: 0,
        components: { Q: 0, P: 0, E: 0, B: 0, L: 0, N: 0 },
        activeLoad: 0,
        rank: rank++,
        excluded: true,
        exclusionReason: exclusionByTech.get(tech.id),
        wouldAssign: false,
        chainPosition: null,
      });
    }

    const weights = parseAssignmentWeights(config);

    return {
      success: true,
      simulation: {
        scenario: {
          workType: scenario.workType,
          caseLeague: scenario.caseLeague,
          caseComplexity: scenario.caseComplexity,
          category: scenario.category,
        },
        config: {
          maxAssignmentAttempts: attemptsBudget,
          tQuoteMinutes: config.tQuoteMinutes,
          tCooldownMinutes: config.tCooldownMinutes,
          weights,
        },
        funnel: {
          universe: universe.length,
          excluded,
          eligible: eligible.length,
          stages,
        },
        ranked,
        assignmentPreview: {
          selectedTechnicianId: rankedCore[0]?.technicianId ?? null,
          attemptsBudget,
          retryChain,
          retryChainDetails,
        },
        pricePreview,
        poolEmpty: eligible.length === 0,
      },
    };
  } catch (error) {
    console.error('[simulateAssignmentAction]', error);
    return { success: false, error: String(error) };
  }
}
