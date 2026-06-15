'use server';

/**
 * Motor de asignación directa Fauchard (solo diseño).
 * Reemplaza invitación + cotización + comparativo.
 */

import { db } from '@/lib/db';
import {
  caseAssignment,
  clinicalCase,
  restorationType as restorationTypeTable,
  review,
  technicianSkill,
  user,
} from '@/lib/db/schema';
import { and, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { notifyUser } from '@/lib/services/notifications';
import {
  CASE_STATUSES,
  INTERNAL_CASE_STATUSES,
  SERVICE_TYPES,
} from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import type { ActionResult } from '@/lib/types/actions';
import {
  categoryForWorkType,
  getWorkTypeForCase,
  LEAGUE_ORDER,
  MIN_SKILL_FOR_CATEGORY,
} from '@/lib/fauchard/caseWorkType';
import {
  computeAssignmentScore,
  parseAssignmentWeights,
} from '@/lib/fauchard/assignmentScore';
import { levelToScoreN, POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { isAvailabilityEnabled, isPoolPendienteEnabled } from '@/lib/constants/availabilityFlags';
import { computeEligibleAction, ensureTechnicianAvailabilityAction } from './availability';
import { computeLevelForTechnicianAction } from './noResponseEvents';
import {
  classifyCaseAction,
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

function leagueMatches(techLeague: string, caseLeague: string, mode: 'strict' | 'expand'): boolean {
  const t = (techLeague ?? 'bronce').toLowerCase();
  const c = caseLeague.toLowerCase();
  if (mode === 'strict') return t === c;
  const idx = LEAGUE_ORDER.indexOf(c as (typeof LEAGUE_ORDER)[number]);
  const expanded = LEAGUE_ORDER.slice(Math.max(0, idx - 1));
  return expanded.includes(t as (typeof LEAGUE_ORDER)[number]);
}

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
  components: { Q: number; P: number; E: number; L: number; N: number };
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
  const notesLen = cRow.cc.notesEsthetic?.length ?? 0;
  const complexity = (cRow.cc.caseComplexity as import('@/lib/constants/dental').CaseComplexity | null) ?? undefined;
  const scenario = deriveScenarioFromInputs(cRow.restorationLabel || '', teeth, complexity, notesLen);
  if (cRow.cc.caseLeague) {
    return { ...scenario, caseLeague: cRow.cc.caseLeague };
  }
  return scenario;
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
  if (recent) return { ok: false, reason: 'cooldown' };

  const minSkill = MIN_SKILL_FOR_CATEGORY[scenario.caseLeague] ?? 1;
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
  if (!skill) return { ok: false, reason: 'insufficient_skill' };

  if (isAvailabilityEnabled()) {
    await ensureTechnicianAvailabilityAction(tech.id);
    if (!(await computeEligibleAction(tech.id, scenario.category, 'cad'))) {
      return { ok: false, reason: 'availability_filter' };
    }
  }

  return { ok: true };
}

/** Filtros duros + expansión de liga (máx 2 intentos). */
export async function buildEligiblePoolForScenario(
  scenario: ResolvedScenario,
  config: FauchardConfigRow,
  excludeTechIds: string[] = [],
): Promise<{ pool: typeof user.$inferSelect[]; workType: string; caseLeague: string; config: FauchardConfigRow }> {
  const now = new Date();
  const inactivityThreshold = new Date(now.getTime() - config.dInactivityDays * 86400000);
  const cooldownThreshold = new Date(now.getTime() - config.tCooldownMinutes * 60000);
  const exclude = new Set(excludeTechIds);

  const candidates = await db
    .select()
    .from(user)
    .where(and(eq(user.role, 'tecnico'), eq(user.isActive, true), eq(user.isAvailable, true)));

  for (const mode of ['strict', 'expand'] as const) {
    const pool: typeof user.$inferSelect[] = [];
    for (const tech of candidates) {
      const { ok } = await checkTechnicianPassesFilters(
        tech, scenario, config, exclude, mode, now, inactivityThreshold, cooldownThreshold,
      );
      if (ok) pool.push(tech);
    }
    if (pool.length > 0) {
      return { pool, workType: scenario.workType, caseLeague: scenario.caseLeague, config };
    }
  }

  return { pool: [], workType: scenario.workType, caseLeague: scenario.caseLeague, config };
}

/** Evalúa todos los técnicos activos para embudo de simulación. */
export async function evaluateTechniciansForScenario(
  scenario: ResolvedScenario,
  config: FauchardConfigRow,
  excludeTechIds: string[] = [],
): Promise<{
  universe: typeof user.$inferSelect[];
  eligible: typeof user.$inferSelect[];
  excluded: Record<ExclusionReason, number>;
  exclusionByTech: Map<string, ExclusionReason>;
}> {
  const now = new Date();
  const inactivityThreshold = new Date(now.getTime() - config.dInactivityDays * 86400000);
  const cooldownThreshold = new Date(now.getTime() - config.tCooldownMinutes * 60000);
  const exclude = new Set(excludeTechIds);

  const universe = await db
    .select()
    .from(user)
    .where(and(eq(user.role, 'tecnico'), eq(user.isActive, true)));

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
  const eligible: typeof user.$inferSelect[] = [];

  for (const tech of universe) {
    let passed = false;
    let reason: ExclusionReason | undefined;
    for (const mode of ['strict', 'expand'] as const) {
      const result = await checkTechnicianPassesFilters(
        tech, scenario, config, exclude, mode, now, inactivityThreshold, cooldownThreshold,
      );
      if (result.ok) {
        passed = true;
        break;
      }
      reason = result.reason;
    }
    if (passed) {
      eligible.push(tech);
    } else if (reason) {
      excluded[reason]++;
      exclusionByTech.set(tech.id, reason);
    }
  }

  return { universe, eligible, excluded, exclusionByTech };
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
  const qualityWindow = new Date(now.getTime() - config.wQualityDays * 86400000);

  const [ratings, completed, skills, activeRows] = await Promise.all([
    db
      .select({ revieweeId: review.revieweeId, rating: review.rating })
      .from(review)
      .where(
        and(
          inArray(review.revieweeId, techIds),
          gt(review.createdAt, qualityWindow),
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
  const maxLoad = Math.max(5, ...Array.from(data.activeLoads.values()), 1);

  const ranked: RankedCandidate[] = [];

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

    const { score, components } = computeAssignmentScore(
      {
        avgRating,
        onTimeRate,
        designLevel,
        activeLoad,
        maxActiveLoad: maxLoad,
        sanctionLevel,
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
        if (cCase?.internalStatus !== POOL_INTERNAL_STATUS) {
          await enterPendingPoolAction(caseId);
        }
        return { success: false, pooled: true, error: 'pendiente_pool', fauchardConfigId: config.id };
      }
      return { success: false, error: 'No se encontraron técnicos disponibles para asignar.' };
    }

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
  opts?: { fauchardConfigId?: string; pinCaseToConfig?: boolean; isReassignment?: boolean; score?: number },
): Promise<ActionResult<{ assignmentId: string; expiresAt: Date }>> {
  const identity = await getServerIdentity();
  if (!identity) return { success: false, error: 'No autenticado' };

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

    const [cRow] = await db
      .select({ restorationLabel: restorationTypeTable.label })
      .from(clinicalCase)
      .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
      .where(eq(clinicalCase.id, caseId))
      .limit(1) as { restorationLabel: string | null }[];

    const workType = getWorkTypeForCase(cRow?.restorationLabel || '', (cCase.teeth as number[]) || []);
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
      userId: identity.id as string,
      type: 'sistema',
      action: CASE_EVENTS.ASIGNACION_ENVIADA,
      content: 'Asignación registrada.',
      payload: { technicianId, expiresAt: expiresAt.toISOString(), visibleTo: 'sistema' },
    });

    if (created?.id) {
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

/** @deprecated alias */
export const batchExpireInvitationsForCases = batchExpireAssignmentsForCases;

function mergeConfig(base: FauchardConfigRow, override?: Record<string, unknown>): FauchardConfigRow {
  if (!override) return base;
  return { ...base, ...override } as FauchardConfigRow;
}

/** Simula asignación directa: caso virtual → ranking Q/P/E/L/N (pool real). */
export async function simulateAssignmentAction(
  params: import('@/lib/fauchard/simulationTypes').SimulateAssignmentParams,
): Promise<ActionResult<{ simulation: import('@/lib/fauchard/simulationTypes').SimulationResult }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const baseConfig = await getActiveConfig();
    const config = mergeConfig(baseConfig, params.configOverride);
    const complexityOverride =
      params.complexityMode === 'auto' ? undefined : params.caseComplexity;
    const scenario = deriveScenarioFromInputs(
      params.restorationLabel,
      params.teeth ?? [],
      complexityOverride,
      params.notesEstheticLength ?? 0,
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
        components: { Q: 0, P: 0, E: 0, L: 0, N: 0 },
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
