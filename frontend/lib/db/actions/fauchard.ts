'use server';

/**
 * FAUCHARD ENGINE — El núcleo orquestador de DentFlowAi.
 * 
 * Nombrado en honor a Pierre Fauchard (1678–1761), el médico francés reconocido como 
 * "El Padre de la Odontología Moderna". Su obra revolucionaria transformó el cuidado 
 * dental de un oficio empírico a una ciencia formal.
 */

import { db, infraPromise } from '@/lib/db';
import {
  clinicalCase,
  caseAssignment,
  fauchardConfig,
  fauchardConfigLog,
  technicianSkill,
  user,
  review,
  clinicalCaseEvent,
  restorationType as restorationTypeTable,
  technicianAvailability,
} from '@/lib/db/schema';
import { eq, and, sql, inArray, lt, gt, lte, ne, isNotNull, gte, count, avg, desc } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { notifyUser } from '../../services/notifications';
import { subDays } from 'date-fns';
import { CASE_COMPLEXITY, CASE_STATUSES, INTERNAL_CASE_STATUSES, SERVICE_TYPES, WORK_TYPE_LABELS, WORK_TYPE_TO_CATEGORY, type CaseComplexity, type WorkType, type WorkCategory } from '@/lib/constants/dental';
import type { ActionResult } from '@/lib/types/actions';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';
import { isCompletedOnTime } from '@/lib/cases/workDeadline';
// ─── v5.0 — Modelo de disponibilidad / sanción rolling (gated por flag) ───
import { isAvailabilityEnabled, isLeagueEngineEnabled, isPoolPendienteEnabled } from '@/lib/constants/availabilityFlags';
import { applyLeagueTransitionPenalty } from '@/lib/leagueScore';
import { levelToScoreN, POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { computeEligibleAction, ensureTechnicianAvailabilityAction, type Capacity } from './availability';
import { computeLevelForTechnicianAction, recordNoResponseEventAction } from './noResponseEvents';
import { enterPendingPoolAction } from './poolQueue';

// ─── Tipos internos ────────────────────────────────────────────────────────────

/** Fila `fauchard_config` usada por el motor (activa o anclada por caso). */
export interface FauchardConfigRow {
  id: string;
  version: number;
  alphaQuality: string;
  alphaPunctuality: string;
  alphaExperience: string;
  alphaLoad: string;
  alphaBonus: string;
  wQualityDays: number;
  wLoadDays: number;
  cMax: string;
  dBonusMaxDays: number;
  tCooldownMinutes: number;
  dInactivityDays: number;
  nInvited: number;
  qMinSelection: string;
  tQuoteMinutes: number;
  tProposalHours: number;
  platformFee: string;
  lMinRating: string;
  lCasesEvaluated: number;
  lMinPunctuality: string;
  lCasesCompleted: number;
  lCasesTransition: number;
  lPenaltyTransition: string;
  lDescentRating: string;
  lDescentDays: number;
  /** v4.6 — Calendario laboral (usado para computar workDeadline). */
  businessHoursStart: number;
  businessHoursEnd: number;
  businessDaysMask: number;
  /** v5.0 — Plazos, sanción rolling, cola pool y score αN (ver Fase 1). */
  tDentistReviewHours: number;
  tNoEligiblePoolHours: number;
  maxPoolCycles: number;
  replacementCutoffMinutes: number;
  noResponseWindowDays: number;
  noResponseRehabilitationDays: number;
  level1Threshold: number;
  level2Threshold: number;
  level3Threshold: number;
  inactivityAutoOffDays: number;
  inactivityReminderDays: number;
  alphaNoResponse: string;
  changeReason: string | null;
}

/** Capacidades (CAD) requeridas — la app solo opera en modo solo_diseno. */
function capacitiesForServiceType(_serviceType: string): Capacity[] {
  return ['cad'];
}

/** Categoría de disponibilidad (5) del caso a partir de su work_type (15). */
function categoryForWorkType(workType: string): WorkCategory {
  return WORK_TYPE_TO_CATEGORY[workType as WorkType] ?? 'coronas';
}

// Nivel mínimo de designLevel requerido según la categoría del caso
const MIN_SKILL_FOR_CATEGORY: Record<string, number> = {
  bronce: 1,
  plata: 3,
  oro: 5,
  elite: 7,
};

// ─── Mapeo de restoration_type → work_type (para el algoritmo) ────────────────

// Mapea restoration_type.label → work_type. Las labels son estándares clínicos
// estables (no se renombran). Si el admin las modifica, el mapeo cae al default.
const RESTORATION_TO_WORK_TYPE: Record<string, string> = {
  'Corona Unitaria':       'corona_posterior',
  'Inlay':                 'inlay_onlay',
  'Onlay':                 'inlay_onlay',
  'Carilla':               'carilla_unitaria',
  'Puente':                'puente_3u',
  'Corona sobre implante': 'corona_implante',
  'Denture':               'protesis_total',
  'Guía Quirúrgica':       'guia_quirurgica_simple',
  'Otro':                  'corona_posterior',
};

function getWorkTypeForCase(restorationLabel: string, teeth: number[] = []): string {
  if (teeth.length >= 4 && restorationLabel === 'Carilla') return 'carillas_multiples';
  if (teeth.length >= 4 && restorationLabel === 'Puente') return 'puente_4mas';
  if (teeth.length >= 10) return 'full_arch';

  return RESTORATION_TO_WORK_TYPE[restorationLabel] || 'corona_posterior';
}

// ─── Helpers: configuración activa global / anclada por caso / por id ─────────

export async function getActiveConfig(): Promise<FauchardConfigRow> {
  if (infraPromise) await infraPromise;
  const [config] = await db
    .select()
    .from(fauchardConfig)
    .where(eq(fauchardConfig.isActive, true))
    .orderBy(desc(fauchardConfig.updatedAt), desc(fauchardConfig.version))
    .limit(1);
  if (!config) throw new Error('[Fauchard] No hay configuración activa del algoritmo');
  return config as FauchardConfigRow;
}

/** Lee una fila de config por id (activa o histórica anclada a un caso). */
export async function loadFauchardConfigById(configId: string): Promise<FauchardConfigRow> {
  const [row] = await db.select().from(fauchardConfig).where(eq(fauchardConfig.id, configId)).limit(1);
  if (!row) throw new Error(`[Fauchard] Configuración no encontrada: ${configId}`);
  return row as FauchardConfigRow;
}

/** Config efectiva para un caso: fila anclada si existe; si no, la activa global (borrador / legacy). */
export async function getConfigForCase(caseId: string): Promise<FauchardConfigRow> {
  const [c] = await db
    .select({ fk: clinicalCase.fauchardConfigId })
    .from(clinicalCase)
    .where(eq(clinicalCase.id, caseId))
    .limit(1);
  if (c?.fk) return loadFauchardConfigById(c.fk);
  return getActiveConfig();
}

// ─── Batch expiration — called from case list to avoid N+1 ───────────────────

export async function batchExpireInvitationsForCases(caseIds: string[]): Promise<void> {
  if (!caseIds.length) return;
  await db
    .update(caseAssignment)
    .set({ status: 'expired' })
    .where(
      and(
        inArray(caseAssignment.clinicalCaseId, caseIds),
        eq(caseAssignment.status, 'pending'),
        lt(caseAssignment.expiresAt, new Date())
      )
    );
}

// Dimensiones de calidad relevantes — solo diseño.
function dimensionsForServiceType(_serviceType: string): string[] {
  return ['design'];
}

// ─── Bulk data loader for pool scoring (avoids N×5 DB queries in runFauchard) ─

type BulkScoringData = {
  reviews: { revieweeId: string; rating: number; dimension: string }[];
  completedInvs: {
    technicianId: string;
    completedAt: Date | null;
    publishedAt: Date | null;
    desiredDeliveryAt: Date | null;
    deadlineDays: number | null;
    deadlineHours: number | null;
  }[];
  skills: { userId: string; workType: string; designLevel: number }[];
  recentInvs: { technicianId: string }[];
  techUsers: { id: string; lastInvitedAt: Date | null; leagueTransitionStartedAt: Date | null }[];
};

async function bulkLoadTechnicianData(
  techIds: string[],
  config: FauchardConfigRow,
  workType: string
): Promise<BulkScoringData> {
  if (!techIds.length) return { reviews: [], completedInvs: [], skills: [], recentInvs: [], techUsers: [] };

  const now = new Date();
  const qualityWindow = new Date(now.getTime() - config.wQualityDays * 86400000);
  const loadWindow = new Date(now.getTime() - config.wLoadDays * 86400000);

  const [reviews, completedInvs, skills, recentInvs, techUsers] = await Promise.all([
    db.select({ revieweeId: review.revieweeId, rating: review.rating, dimension: review.dimension })
      .from(review)
      .where(and(inArray(review.revieweeId, techIds), gt(review.createdAt, qualityWindow))),

    db.select({
      technicianId: caseAssignment.technicianId,
      completedAt: clinicalCase.completedAt,
      publishedAt: clinicalCase.publishedAt,
      desiredDeliveryAt: clinicalCase.desiredDeliveryAt,
      deadlineDays: caseAssignment.deadlineDays,
      deadlineHours: caseAssignment.deadlineHours,
    })
    .from(caseAssignment)
    .innerJoin(clinicalCase, eq(caseAssignment.clinicalCaseId, clinicalCase.id))
    .where(and(
      inArray(caseAssignment.technicianId, techIds),
      eq(caseAssignment.status, 'accepted'),
      isNotNull(clinicalCase.completedAt),
    )),

    db.select({
      userId: technicianSkill.userId,
      workType: technicianSkill.workType,
      designLevel: technicianSkill.designLevel,
    })
    .from(technicianSkill)
    .where(and(inArray(technicianSkill.userId, techIds), eq(technicianSkill.workType, workType))),

    db.select({ technicianId: caseAssignment.technicianId })
      .from(caseAssignment)
      .where(and(inArray(caseAssignment.technicianId, techIds), gt(caseAssignment.assignedAt, loadWindow))),

    db.select({ id: user.id, lastInvitedAt: user.lastInvitedAt, leagueTransitionStartedAt: user.leagueTransitionStartedAt })
      .from(user)
      .where(inArray(user.id, techIds)),
  ]);

  return { reviews, completedInvs, skills, recentInvs, techUsers };
}

/** @deprecated Usar rankAssignmentCandidates / computeAssignmentScore (Q/P/E/L/N). */
function calculateScoreFromBulkData(
  technicianId: string,
  data: BulkScoringData,
  config: FauchardConfigRow,
  avgPoolLoad: number,
  serviceType: string,
  sanction?: { n: number }
): { score: number; components: { Q: number; P: number; E: number; C: number; B: number } } {
  // Pesos del score: ÚNICA fuente de verdad = la config (6 pesos, Σ6=1.0,
  // editables en "Pesos del Score"). El término −αN·N solo penaliza cuando hay
  // sanción (N>0, modelo de disponibilidad on); con N=0 se anula solo.
  const α1 = parseFloat(config.alphaQuality);
  const α2 = parseFloat(config.alphaPunctuality);
  const α3 = parseFloat(config.alphaExperience);
  const α4 = parseFloat(config.alphaLoad);
  const α5 = parseFloat(config.alphaBonus);
  const αN = parseFloat(config.alphaNoResponse ?? '0.250');
  const N = sanction?.n ?? 0;
  const cMax = parseFloat(config.cMax);
  const now = new Date();

  // Q — filtrado por dimensión (CAD/CAM) según la capacidad del caso.
  const qualityDims = dimensionsForServiceType(serviceType);
  const techRatings = data.reviews
    .filter(r => r.revieweeId === technicianId && qualityDims.includes(r.dimension))
    .map(r => r.rating);
  const avgRating = techRatings.length > 0 ? techRatings.reduce((a, b) => a + b, 0) / techRatings.length : null;
  const Q = avgRating !== null ? avgRating / 5 : 0.5;

  // P
  const techInvs = data.completedInvs.filter(i => i.technicianId === technicianId);
  let onTimeCases = 0;
  for (const inv of techInvs) {
    if (inv.completedAt && isCompletedOnTime(inv.completedAt, inv.desiredDeliveryAt, inv.publishedAt, inv.deadlineDays)) {
      onTimeCases++;
    }
  }
  const P = techInvs.length > 0 ? onTimeCases / techInvs.length : 0.80;

  // E
  const skillRow = data.skills.find(s => s.userId === technicianId);
  let skillLevel = 0;
  if (skillRow) {
    skillLevel = skillRow.designLevel ?? 0;
  }
  const E = skillLevel / 7;

  // C
  const invitationCount = data.recentInvs.filter(i => i.technicianId === technicianId).length;
  const C = Math.min(invitationCount / (avgPoolLoad > 0 ? avgPoolLoad : 1), cMax);

  // B
  const techUser = data.techUsers.find(u => u.id === technicianId);
  const lastInvited = techUser?.lastInvitedAt;
  const daysSince = lastInvited
    ? (now.getTime() - new Date(lastInvited).getTime()) / 86400000
    : config.dBonusMaxDays;
  const B = Math.min(daysSince / config.dBonusMaxDays, 1.0);

  const baseScore = α1 * Q + α2 * P + α3 * E - α4 * C + α5 * B - αN * N;

  // Penalización de transición de liga (Fase 2): mientras el técnico está en su
  // período de prueba en la liga superior, su score se reduce por (1 - lPenaltyTransition).
  const inTransition = isLeagueEngineEnabled() && !!techUser?.leagueTransitionStartedAt;
  const score = applyLeagueTransitionPenalty(baseScore, inTransition, parseFloat(config.lPenaltyTransition));

  return { score: Math.max(0, score), components: { Q, P, E, C, B } };
}

// ─── S2-02: Calcular score de un técnico para un caso ────────────────────────

/** @deprecated Usar rankAssignmentCandidates / computeAssignmentScore (Q/P/E/L/N). */
async function calculateTechnicianScore(
  technicianId: string,
  workType: string,
  serviceType: string,
  config: FauchardConfigRow,
  avgPoolLoad: number = 5
): Promise<{ score: number; components: { Q: number; P: number; E: number; C: number; B: number; N: number } }> {
  const α1 = parseFloat(config.alphaQuality);
  const α2 = parseFloat(config.alphaPunctuality);
  const α3 = parseFloat(config.alphaExperience);
  const α4 = parseFloat(config.alphaLoad);
  const α5 = parseFloat(config.alphaBonus);
  const αN = parseFloat(config.alphaNoResponse ?? '0.250');
  const cMax = parseFloat(config.cMax);

  const now = new Date();
  const qualityWindow = new Date(now.getTime() - config.wQualityDays * 86400000);
  const loadWindow = new Date(now.getTime() - config.wLoadDays * 86400000);

  // Q — Calidad histórica: promedio de ratings en la ventana de calidad,
  // filtrado por la(s) dimensión(es) que corresponden a la capacidad evaluada
  // (CAD→design, CAM→fabrication, integral→ambas).
  const qualityDims = dimensionsForServiceType(serviceType);
  const qualityRows = await db
    .select({ rating: review.rating })
    .from(review)
    .where(
      and(
        eq(review.revieweeId, technicianId),
        inArray(review.dimension, qualityDims),
        gt(review.createdAt, qualityWindow)
      )
    );

  const ratings = qualityRows.map(r => r.rating);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const Q = avgRating !== null ? avgRating / 5 : 0.5; // Default neutro para técnicos nuevos

  // P — Puntualidad: casos entregados en plazo / total completados
  const completedInvs = await db
    .select({
      completedAt: clinicalCase.completedAt,
      assignedAt: clinicalCase.assignedAt,
      deadlineDays: caseAssignment.deadlineDays,
      deadlineHours: caseAssignment.deadlineHours,
    })
    .from(caseAssignment)
    .innerJoin(clinicalCase, eq(caseAssignment.clinicalCaseId, clinicalCase.id))
    .where(and(
      eq(caseAssignment.technicianId, technicianId),
      eq(caseAssignment.status, 'confirmed'),
      isNotNull(clinicalCase.completedAt),
      isNotNull(clinicalCase.assignedAt),
    ));

  const totalCompleted = completedInvs.length;
  let onTimeCases = 0;
  for (const inv of completedInvs) {
    if (inv.completedAt && inv.assignedAt && (inv.deadlineDays || inv.deadlineHours)) {
      // Aproximación de scoring: no respeta horario laboral ni feriados.
      // Si hay horas, se suman como ventana 24/7; si hay días, se cuentan calendario.
      const ms =
        (inv.deadlineDays ?? 0) * 86_400_000 + (inv.deadlineHours ?? 0) * 3_600_000;
      const deadline = new Date(new Date(inv.assignedAt).getTime() + ms);
      if (new Date(inv.completedAt) <= deadline) onTimeCases++;
    }
  }
  const P = totalCompleted > 0 ? onTimeCases / totalCompleted : 0.80;

  // E — Experiencia en el tipo de trabajo
  const [skillRow] = await db
    .select()
    .from(technicianSkill)
    .where(and(eq(technicianSkill.userId, technicianId), eq(technicianSkill.workType, workType)))
    .limit(1);

  let skillLevel = 0;
  if (skillRow) {
    skillLevel = skillRow.designLevel ?? 0;
  }
  const E = skillLevel / 7;

  // C — Índice de carga reciente
  const recentInvs = await db
    .select({ id: caseAssignment.id })
    .from(caseAssignment)
    .where(and(eq(caseAssignment.technicianId, technicianId), gt(caseAssignment.assignedAt, loadWindow)));
  const invitationCount = recentInvs.length;

  const C = Math.min(invitationCount / (avgPoolLoad > 0 ? avgPoolLoad : 1), cMax);

  // B — Bono de infrautilización
  const [techRow] = await db
    .select({ lastInvitedAt: user.lastInvitedAt, leagueTransitionStartedAt: user.leagueTransitionStartedAt })
    .from(user)
    .where(eq(user.id, technicianId))
    .limit(1);

  const lastInvited = techRow?.lastInvitedAt;
  const daysSince = lastInvited
    ? (now.getTime() - new Date(lastInvited).getTime()) / 86400000
    : config.dBonusMaxDays; // Si nunca fue invitado, bono máximo
  const B = Math.min(daysSince / config.dBonusMaxDays, 1.0);

  // N — Sanción por no-respuesta (término −αN·N). Solo penaliza con el modelo de
  // disponibilidad on y cuando el técnico tiene sanción acumulada (N>0); si no, N=0.
  let N = 0;
  if (isAvailabilityEnabled()) {
    const lvl = await computeLevelForTechnicianAction(technicianId);
    N = levelToScoreN(lvl.level);
  }

  const baseScore = α1 * Q + α2 * P + α3 * E - α4 * C + α5 * B - αN * N;

  // Penalización de transición de liga (Fase 2) — ver calculateScoreFromBulkData.
  const inTransition = isLeagueEngineEnabled() && !!techRow?.leagueTransitionStartedAt;
  const score = applyLeagueTransitionPenalty(baseScore, inTransition, parseFloat(config.lPenaltyTransition));

  return { score: Math.max(0, score), components: { Q, P, E, C, B, N } };
}

// ─── S2-01: Clasificar un caso ────────────────────────────────────────────────

export async function classifyCaseAction(caseId: string) {
  const identity = await getServerIdentity();
  if (!identity) return { success: false, error: 'No autenticado' };

  try {
    const [cCase] = await db
      .select({
        cc: clinicalCase,
        restorationCode: restorationTypeTable.label,
      })
      .from(clinicalCase)
      .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
      .where(eq(clinicalCase.id, caseId))
      .limit(1) as any;

    if (!cCase) return { success: false, error: 'Caso no encontrado' };

    const teeth = (cCase.cc.teeth as number[]) || [];
    const restorationType = cCase.restorationCode || '';

    // Determinar complejidad
    let complexity: CaseComplexity = CASE_COMPLEXITY.BASICO;
    if (
      teeth.length >= 10 ||
      ['full_arch', 'protesis_parcial_removible', 'protesis_total', 'sobredentadura', 'barra_implantes'].includes(
        RESTORATION_TO_WORK_TYPE[restorationType] || ''
      )
    ) {
      complexity = CASE_COMPLEXITY.AVANZADO;
    } else if (
      teeth.length >= 4 ||
      ['puente_4mas', 'carillas_multiples'].includes(RESTORATION_TO_WORK_TYPE[restorationType] || '')
    ) {
      complexity = CASE_COMPLEXITY.INTERMEDIO;
    } else if (
      restorationType === 'Guía Quirúrgica' ||
      (cCase.cc.notesEsthetic && cCase.cc.notesEsthetic.length > 100)
    ) {
      complexity = CASE_COMPLEXITY.CRITICO;
    }

    // Siempre solo_diseno — la app ya no admite fabricación.
    const serviceType: string = SERVICE_TYPES.SOLO_DISENO;

    // Determinar work_type para el algoritmo
    const workType = getWorkTypeForCase(restorationType, teeth);

    const complexityToLeague: Record<string, string> = {
      [CASE_COMPLEXITY.BASICO]: 'bronce',
      [CASE_COMPLEXITY.INTERMEDIO]: 'plata',
      [CASE_COMPLEXITY.AVANZADO]: 'oro',
      [CASE_COMPLEXITY.CRITICO]: 'elite',
    };
    const caseLeague = complexityToLeague[complexity] ?? 'bronce';

    await db
      .update(clinicalCase)
      .set({
        caseComplexity: complexity,
        serviceType,
        caseLeague,
        internalStatus: INTERNAL_CASE_STATUSES.CLASIFICANDO,
        updatedAt: new Date(),
      })
      .where(eq(clinicalCase.id, caseId));

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: 'CASO_CLASIFICADO',
      content: `Caso clasificado: ${complexity} / ${serviceType}`,
      payload: { complexity, serviceType, workType, visibleTo: 'sistema' },
    });

    return { success: true, data: { complexity, serviceType, workType } };
  } catch (error) {
    console.error('[classifyCaseAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S2-03: Ejecutar el algoritmo de selección ────────────────────────────────

export async function runFauchardAction(caseId: string): Promise<{
  success: boolean;
  technicianIds?: string[];
  fauchardConfigId?: string;
  error?: string;
  pooled?: boolean;
}> {
  const { runAssignmentAction } = await import('./assignment');
  const result = await runAssignmentAction(caseId);
  if (result.pooled) {
    return { success: false, pooled: true, fauchardConfigId: result.fauchardConfigId, error: result.error };
  }
  if (!result.success || !result.technicianId) {
    return { success: false, error: result.error, fauchardConfigId: result.fauchardConfigId };
  }
  return {
    success: true,
    technicianIds: [result.technicianId],
    fauchardConfigId: result.fauchardConfigId,
  };
}


// ─── v5.0 — Helpers de elegibilidad, reemplazo y reactivación de cola ────────

/** ¿El técnico cumple el AND triple para el caso? (true si el modelo está apagado). */
export async function isTechnicianEligibleForCaseAction(caseId: string, technicianId: string): Promise<boolean> {
  if (!isAvailabilityEnabled()) return true;
  const [cRow] = await db
    .select({ cc: clinicalCase, restorationCode: restorationTypeTable.label })
    .from(clinicalCase)
    .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
    .where(eq(clinicalCase.id, caseId))
    .limit(1) as any;
  if (!cRow) return false;
  const workType = getWorkTypeForCase(cRow.restorationCode || '', (cRow.cc.teeth as number[]) || []);
  const serviceType = cRow.cc.serviceType || SERVICE_TYPES.SOLO_DISENO;
  const category = categoryForWorkType(workType);
  // Self-heal: garantizar la fila antes de evaluar (computeEligibleAction excluye sin fila).
  await ensureTechnicianAvailabilityAction(technicianId);
  for (const cap of capacitiesForServiceType(serviceType)) {
    if (!(await computeEligibleAction(technicianId, category, cap))) return false;
  }
  return true;
}

/**
 * Selecciona el mejor candidato de reemplazo (§3.3): técnico elegible no excluido,
 * con skill suficiente, AND triple cumplido (si el modelo está on), mayor score.
 * Devuelve `technicianId` undefined si no hay candidato disponible.
 */
export async function selectReplacementCandidateAction(
  caseId: string,
  excludeTechIds: string[],
): Promise<{ success: boolean; technicianId?: string; error?: string }> {
  try {
    const { rankAssignmentCandidates } = await import('./assignment');
    const ranked = await rankAssignmentCandidates(caseId, excludeTechIds);
    return { success: true, technicianId: ranked[0]?.technicianId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Reactivación de cola (§5.2): re-corre la selección completa para un caso en
 * `pendiente_pool`. Si ahora hay elegibles, invita y limpia la marca; si no, el
 * caso permanece en cola (runFauchard no re-incrementa el ciclo si ya está pooled).
 */
export async function reevaluatePendingPoolCaseAction(
  caseId: string,
): Promise<{ success: boolean; reactivated?: boolean; error?: string }> {
  try {
    const sel = await runFauchardAction(caseId);
    if (sel.success && sel.technicianIds?.length && sel.fauchardConfigId) {
      await db.update(clinicalCase).set({ internalStatus: null, updatedAt: new Date() }).where(eq(clinicalCase.id, caseId));
      await sendInvitationsAction(caseId, sel.technicianIds, { fauchardConfigId: sel.fauchardConfigId, pinCaseToConfig: true });
      return { success: true, reactivated: true };
    }
    return { success: true, reactivated: false };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ─── S2-04: Crear invitaciones para técnicos seleccionados ───────────────────

export async function sendInvitationsAction(
  caseId: string,
  technicianIds: string[],
  inviteCtx?: { fauchardConfigId: string; pinCaseToConfig?: boolean },
) {
  const { assignCaseAction } = await import('./assignment');
  const techId = technicianIds[0];
  if (!techId) return { success: false, error: 'Sin técnico para asignar' };
  const res = await assignCaseAction(caseId, techId, {
    fauchardConfigId: inviteCtx?.fauchardConfigId,
    pinCaseToConfig: inviteCtx?.pinCaseToConfig,
  });
  if (!res.success) return res;
  return { success: true, invitedCount: 1, skippedInvites: 0, expiresAt: res.expiresAt };
}

// ─── Asignación: aceptar (reemplaza cotización) ─────────────────────────────

/** @deprecated — redirige a aceptación de asignación. */
export type QuoteInput = {
  kind: 'flat';
  price: number;
  deliveryDays?: number;
  deliveryHours?: number;
  notes?: string;
};

export async function submitQuoteAction(
  invitationId: string,
  _priceOrInput?: number | QuoteInput,
  _deliveryDays?: number,
  _notes?: string,
) {
  const { acceptAssignmentAction } = await import('./assignment');
  return acceptAssignmentAction(invitationId);
}

// ─── S2-06b: Verificación lazy de expiración ─────────────────────────────────

/** Etapa 1: expira invitaciones `pending` vencidas (no evalúa cotizaciones). */
export async function expirePendingInvitationsForCase(caseId: string) {
  const now = new Date();
  const expiredPending = await db
    .select()
    .from(caseAssignment)
    .where(
      and(
        eq(caseAssignment.clinicalCaseId, caseId),
        eq(caseAssignment.status, 'pending'),
        lt(caseAssignment.expiresAt, now),
      ),
    );

  for (const inv of expiredPending) {
    await db
      .update(caseAssignment)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(caseAssignment.id, inv.id));

    await logCaseEvent({
      caseId: inv.clinicalCaseId,
      userId: inv.technicianId,
      type: 'sistema',
      action: CASE_EVENTS.INVITACION_EXPIRADA,
      content: 'Se venció el plazo para cotizar sin respuesta.',
      payload: {
        invitationId: inv.id,
        visibleTo: 'tecnico',
        ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
      },
    });

    await penalizeNoResponseAction(inv.technicianId, inv.id);
  }

  return { expired: expiredPending.length };
}

/**
 * Puente a etapa 2: evalúa si el caso sigue en `enEvaluacion` y no quedan invitaciones `pending`.
 * Incluye ronda sin cotizaciones (solo invitaciones resueltas/expiradas).
 */
export async function tryEvaluateQuotesIfReady(caseId: string) {
  const [caseRow] = await db
    .select({ status: clinicalCase.status })
    .from(clinicalCase)
    .where(eq(clinicalCase.id, caseId))
    .limit(1);

  if (caseRow?.status !== CASE_STATUSES.EN_EVALUACION) {
    return { evaluated: false, reason: 'not_en_evaluacion' as const };
  }

  const stillPending = await db
    .select({ id: caseAssignment.id })
    .from(caseAssignment)
    .where(and(eq(caseAssignment.clinicalCaseId, caseId), eq(caseAssignment.status, 'pending')));

  if (stillPending.length > 0) {
    return { evaluated: false, reason: 'pending_invitations' as const };
  }

  const [invCount] = await db
    .select({ count: count() })
    .from(caseAssignment)
    .where(eq(caseAssignment.clinicalCaseId, caseId));

  if (Number(invCount?.count ?? 0) === 0) {
    return { evaluated: false, reason: 'no_invitations' as const };
  }

  const result = await evaluateQuotesAction(caseId);
  return {
    evaluated: true,
    evaluateResult: result,
  };
}

/** Expira invitaciones vencidas y, si corresponde, evalúa (submitQuote, cron). */
export async function checkAndExpireInvitationsAction(caseId: string) {
  const { expired } = await expirePendingInvitationsForCase(caseId);
  const evalOut = await tryEvaluateQuotesIfReady(caseId);
  return {
    expired,
    evaluated: evalOut.evaluated,
    evaluateResult: evalOut.evaluated ? evalOut.evaluateResult : undefined,
  };
}

// ─── Evaluación comparativo (eliminado) ───────────────────────────────────────

/** @deprecated — el comparativo ya no existe. */
export async function evaluateQuotesAction(_caseId: string) {
  return { success: true, skipped: true };
}

// ─── S2-08: Publicar vista comparativa (sin asignar laboratorio ni precio pactado)

async function buildProposalAction(caseId: string, _orderedQuotedIds: string[]) {
  try {
    const config = await getConfigForCase(caseId);
    const platformFee = parseFloat(config.platformFee);
    const proposalExpiresAt = new Date(Date.now() + parseFloat(String(config.tProposalHours)) * 3600000);

    const updated = await db
      .update(clinicalCase)
      .set({
        proposedPrice: null,
        proposedDeliveryDays: null,
        platformFee: String(platformFee),
        proposalExpiresAt,
        status: CASE_STATUSES.PROPUESTA_LISTA,
        internalStatus: INTERNAL_CASE_STATUSES.PROPUESTA_PRESENTADA,
        currentResponsibility: 'dentista',
        assignedTechnicianId: null,
        assignedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(clinicalCase.id, caseId), eq(clinicalCase.status, CASE_STATUSES.EN_EVALUACION)),
      )
      .returning();

    if (!updated.length) {
      return { success: true, alreadyBuilt: true as const };
    }

    const [cCase] = updated;
    const n = _orderedQuotedIds.length;
    const docId = (cCase as any)?.doctorId as string | undefined;

    if (docId) {
      await logCaseEvent({
        caseId,
        userId: docId,
        type: 'sistema',
        action: 'FAUCHARD_PRESENTACION_CERRADA',
        content: 'Comparativo cerrado.',
        payload: {
          offerCount: n,
          expiresAt: proposalExpiresAt.toISOString(),
          visibleTo: 'sistema',
          ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
        },
        stateChange: { from: CASE_STATUSES.EN_EVALUACION, to: CASE_STATUSES.PROPUESTA_LISTA },
      });

      await logCaseEvent({
        caseId,
        userId: docId,
        type: 'sistema',
        action: CASE_EVENTS.OFERTAS_COMPARATIVAS_LISTAS,
        content: `Tienes ${n} oferta(s) listas para revisar.`,
        payload: { visibleTo: 'sistema', offerCount: n },
        stateChange: { from: CASE_STATUSES.EN_EVALUACION, to: CASE_STATUSES.PROPUESTA_LISTA },
      });

      await notifyUser(docId, 'PROPUESTA_LISTA' as any, {
        caseId,
        expiresAt: proposalExpiresAt.toISOString(),
      });
    }

    return { success: true, alreadyBuilt: false as const, proposalExpiresAt, offerCount: n };
  } catch (error) {
    console.error('[buildProposalAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S8-04: Expiración de Propuestas (Dentista no respondió) ──────────────────

export async function checkAndExpireProposalsAction() {
  const now = new Date();
  try {
    const expiredProposals = await db
      .select()
      .from(clinicalCase)
      .where(
        and(
          eq(clinicalCase.status, 'propuestaLista'),
          lt(clinicalCase.proposalExpiresAt, now)
        )
      );

    for (const c of expiredProposals) {
      const { expireDentistComparativeWindowAction } = await import('./proposal');
      await expireDentistComparativeWindowAction(c.id);
    }

    return { success: true, expired: expiredProposals.length };
  } catch (error) {
    console.error('[checkAndExpireProposalsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S2-10: Penalizar técnico por no responder ───────────────────────────────

export async function penalizeNoResponseAction(technicianId: string, invitationId?: string) {
  try {
    // ─── v5.0: sanción rolling gradual cuando el modelo está habilitado ───
    if (isAvailabilityEnabled()) {
      await recordNoResponseEventAction(technicianId, invitationId ?? null);
      const lvl = await computeLevelForTechnicianAction(technicianId);

      if (lvl.level >= 3) {
        // Nivel 3 → Auto-OFF del switch global + auto-rechazo de pendientes + email.
        await db
          .update(technicianAvailability)
          .set({ levelGlobal: false, updatedAt: new Date() })
          .where(eq(technicianAvailability.userId, technicianId));

        const pendings = await db
          .select({ id: caseAssignment.id })
          .from(caseAssignment)
          .where(and(eq(caseAssignment.technicianId, technicianId), eq(caseAssignment.status, 'pending')));
        if (pendings.length) {
          const { autoRejectOnAutoOffAction } = await import('./rejection');
          await autoRejectOnAutoOffAction(technicianId, pendings.map((p) => p.id));
        }
        await notifyUser(technicianId, 'NIVEL_3_AUTO_OFF', { count: lvl.count });
      } else if (lvl.level === 2) {
        // Nivel 2 → penalización al score (ya aplicada vía −αN·N) + email informativo.
        await notifyUser(technicianId, 'NIVEL_2_ALCANZADO', { count: lvl.count });
      }
      // Nivel 1 → solo aviso in-app (sin email); se refleja en el panel del técnico (Fase 4).
      return;
    }

    // ─── Modelo legacy (flag off): exclusión binaria + suspensión a las 3 ───
    const [tech] = await db
      .select()
      .from(user)
      .where(eq(user.id, technicianId))
      .limit(1);

    const newCount = (tech?.consecutiveNoResponse ?? 0) + 1;

    if (newCount >= 3) {
      // Suspensión temporal: 48 horas
      const suspendedUntil = new Date(Date.now() + 48 * 3600000);
      await db.update(user)
        .set({ consecutiveNoResponse: newCount, suspendedUntil, updatedAt: new Date() })
        .where(eq(user.id, technicianId));

      await notifyUser(technicianId, 'SUSPENSION_TEMPORAL' as any, {
        reason: 'no_response',
        until: suspendedUntil.toISOString(),
      });
    } else {
      await db.update(user)
        .set({ consecutiveNoResponse: newCount, updatedAt: new Date() })
        .where(eq(user.id, technicianId));
    }
  } catch (error) {
    console.error('[penalizeNoResponseAction] Error:', error);
  }
}

// ─── Pipeline completo: clasificar → seleccionar → invitar ────────────────────

export async function submitCaseToFauchardAction(caseId: string) {
  try {
    const [row] = await db
      .select({ status: clinicalCase.status })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    if (!row) return { success: false, error: 'Caso no encontrado' };

    // Desde borrador, el flujo canónico es el mismo que el botón "Publicar" del panel (incluye auth, UCH y rollback).
    if (row.status === CASE_STATUSES.BORRADOR) {
      const { publishCaseAction } = await import('./cases');
      return publishCaseAction(caseId);
    }

    // Caso ya publicado: re-ejecutar solo el pipeline de selección + invitaciones (p. ej. reintentos internos).
    const [preCase] = await db
      .select({ fk: clinicalCase.fauchardConfigId })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    const classifyResult = await classifyCaseAction(caseId);
    if (!classifyResult.success) throw new Error(classifyResult.error);

    const selectionResult = await runFauchardAction(caseId);
    if (!selectionResult.success || !selectionResult.technicianIds?.length || !selectionResult.fauchardConfigId) {
      throw new Error(selectionResult.error || 'Sin técnicos disponibles');
    }

    const invitationResult = await sendInvitationsAction(caseId, selectionResult.technicianIds, {
      fauchardConfigId: selectionResult.fauchardConfigId,
      pinCaseToConfig: !preCase?.fk,
    });
    if (!invitationResult.success) throw new Error(invitationResult.error);

    return { success: true };
  } catch (error) {
    console.error('[submitCaseToFauchardAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S6-01: Obtener configuración completa (Admin) ───────────────────────────

export async function getFauchardConfigAction(): Promise<ActionResult<{ config: any }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  if (infraPromise) await infraPromise;

  try {
    const [config] = await db
      .select({
        id: fauchardConfig.id,
        version: fauchardConfig.version,
        alphaQuality: fauchardConfig.alphaQuality,
        alphaPunctuality: fauchardConfig.alphaPunctuality,
        alphaExperience: fauchardConfig.alphaExperience,
        alphaLoad: fauchardConfig.alphaLoad,
        alphaBonus: fauchardConfig.alphaBonus,
        wQualityDays: fauchardConfig.wQualityDays,
        wLoadDays: fauchardConfig.wLoadDays,
        cMax: fauchardConfig.cMax,
        dBonusMaxDays: fauchardConfig.dBonusMaxDays,
        tCooldownMinutes: fauchardConfig.tCooldownMinutes,
        dInactivityDays: fauchardConfig.dInactivityDays,
        maxAssignmentAttempts: fauchardConfig.maxAssignmentAttempts,
        nInvited: fauchardConfig.nInvited,
        qMinSelection: fauchardConfig.qMinSelection,
        tQuoteMinutes: fauchardConfig.tQuoteMinutes,
        tProposalHours: fauchardConfig.tProposalHours,
        platformFee: fauchardConfig.platformFee,
        lMinRating: fauchardConfig.lMinRating,
        lCasesEvaluated: fauchardConfig.lCasesEvaluated,
        lMinPunctuality: fauchardConfig.lMinPunctuality,
        lCasesCompleted: fauchardConfig.lCasesCompleted,
        lCasesTransition: fauchardConfig.lCasesTransition,
        lPenaltyTransition: fauchardConfig.lPenaltyTransition,
        lDescentRating: fauchardConfig.lDescentRating,
        lDescentDays: fauchardConfig.lDescentDays,
        businessHoursStart: fauchardConfig.businessHoursStart,
        businessHoursEnd: fauchardConfig.businessHoursEnd,
        businessDaysMask: fauchardConfig.businessDaysMask,
        // v5.0 — Plazos, sanción rolling, cola pool y score αN.
        tDentistReviewHours: fauchardConfig.tDentistReviewHours,
        tNoEligiblePoolHours: fauchardConfig.tNoEligiblePoolHours,
        maxPoolCycles: fauchardConfig.maxPoolCycles,
        replacementCutoffMinutes: fauchardConfig.replacementCutoffMinutes,
        noResponseWindowDays: fauchardConfig.noResponseWindowDays,
        noResponseRehabilitationDays: fauchardConfig.noResponseRehabilitationDays,
        level1Threshold: fauchardConfig.level1Threshold,
        level2Threshold: fauchardConfig.level2Threshold,
        level3Threshold: fauchardConfig.level3Threshold,
        inactivityAutoOffDays: fauchardConfig.inactivityAutoOffDays,
        inactivityReminderDays: fauchardConfig.inactivityReminderDays,
        alphaNoResponse: fauchardConfig.alphaNoResponse,
        updatedAt: fauchardConfig.updatedAt,
        updatedBy: fauchardConfig.updatedBy,
        updatedByName: user.fullName,
      })
      .from(fauchardConfig)
      .leftJoin(user, eq(fauchardConfig.updatedBy, user.id))
      .where(eq(fauchardConfig.isActive, true))
      .orderBy(desc(fauchardConfig.updatedAt), desc(fauchardConfig.version))
      .limit(1);

    if (!config) return { success: false, error: 'Configuración no encontrada' };

    return { success: true, config };
  } catch (error) {
    console.error('[getFauchardConfigAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S6-02: Actualizar parámetros del algoritmo (Admin) ──────────────────────

export async function updateFauchardParamsAction(params: Record<string, any>, reason?: string): Promise<ActionResult<{ newVersion: number }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(fauchardConfig)
        .where(eq(fauchardConfig.isActive, true))
        .orderBy(desc(fauchardConfig.updatedAt), desc(fauchardConfig.version))
        .limit(1);

      if (!current) throw new Error('No hay configuración activa');

      // 1. Validaciones de pesos (α) — suma SOLO los α presentes en params (5 factores).
      const ALL_ALPHA_KEYS = ['alphaQuality', 'alphaPunctuality', 'alphaExperience', 'alphaLoad', 'alphaNoResponse'];
      const presentAlphaKeys = ALL_ALPHA_KEYS.filter((k) => params[k] !== undefined);
      if (presentAlphaKeys.length > 0) {
        let αSum = 0;
        for (const key of presentAlphaKeys) {
          const val = parseFloat(params[key]);
          if (isNaN(val) || val < 0 || val > 0.5) {
            throw new Error(`Peso ${key} inválido (0.0 - 0.50)`);
          }
          αSum += val;
        }
        if (Math.abs(αSum - 1.0) > 0.001) {
          throw new Error(`La suma de los pesos debe ser exactamente 1.0 (suma actual: ${αSum.toFixed(3)})`);
        }
      }

      // 2. Otras validaciones
      if (params.maxAssignmentAttempts !== undefined) {
        const v = parseInt(String(params.maxAssignmentAttempts), 10);
        if (isNaN(v) || v < 1 || v > 10) {
          throw new Error('Intentos máximos de asignación (maxAssignmentAttempts) debe estar entre 1 y 10');
        }
      }
      if (params.tQuoteMinutes !== undefined && (params.tQuoteMinutes < 1 || params.tQuoteMinutes > 1440)) {
        throw new Error('Tiempo de respuesta a asignación (tQuoteMinutes) debe estar entre 1 y 1440 minutos (1 min a 24 h)');
      }
      if (params.tCooldownMinutes !== undefined && (params.tCooldownMinutes < 1 || params.tCooldownMinutes > 1440)) {
        throw new Error('Cooldown invitaciones (tCooldownMinutes) debe estar entre 1 y 1440 minutos (1 min a 24 h)');
      }

      // v5.0 — Plazos, sanción, umbrales y heartbeat (cotas §11.2).
      const intParam = (k: string) => (params[k] !== undefined ? parseInt(params[k]) : (current as any)[k]);
      const range = (k: string, min: number, max: number, label: string) => {
        if (params[k] === undefined) return;
        const v = parseInt(params[k]);
        if (isNaN(v) || v < min || v > max) throw new Error(`${label} debe estar entre ${min} y ${max}`);
      };
      range('tDentistReviewHours', 1, 336, 'Plazo de revisión del dentista (h)');
      range('tNoEligiblePoolHours', 1, 168, 'Tiempo de espera de técnicos (h)');
      range('maxPoolCycles', 1, 10, 'Ciclos de espera');
      range('replacementCutoffMinutes', 0, 120, 'Margen de reemplazo (min)');
      range('noResponseWindowDays', 1, 90, 'Ventana de no-respuesta (días)');
      range('noResponseRehabilitationDays', 1, 180, 'Días de rehabilitación');
      range('level1Threshold', 1, 50, 'Umbral Nivel 1');
      range('level2Threshold', 1, 50, 'Umbral Nivel 2');
      range('level3Threshold', 1, 50, 'Umbral Nivel 3');
      range('inactivityAutoOffDays', 1, 365, 'Días para auto-OFF preventivo');
      range('inactivityReminderDays', 1, 365, 'Días para recordatorio');

      // Orden estricto de umbrales y heartbeat.
      const l1 = intParam('level1Threshold');
      const l2 = intParam('level2Threshold');
      const l3 = intParam('level3Threshold');
      if (!(l1 < l2 && l2 < l3)) {
        throw new Error('Los umbrales deben cumplir Nivel 1 < Nivel 2 < Nivel 3');
      }
      const reminder = intParam('inactivityReminderDays');
      const autoOff = intParam('inactivityAutoOffDays');
      if (!(reminder < autoOff)) {
        throw new Error('El recordatorio debe ser anterior al auto-OFF (recordatorio < auto-OFF)');
      }

      // 3. Detectar cambios para el log
      const changes: { key: string; old: any; new: any }[] = [];
      const updatedFields: Record<string, any> = {
        updatedBy: identity.adminId ?? identity.id,
        updatedAt: new Date(),
        version: current.version + 1,
        // v5.0 — motivo del cambio (auditoría); null si el panel no lo provee.
        changeReason: reason?.trim() || null,
      };

      const metadataKeys = ['id', 'version', 'isActive', 'updatedBy', 'createdAt', 'updatedAt'];

      for (const [key, newValue] of Object.entries(params)) {
        if (key in current && !metadataKeys.includes(key)) {
          const oldValue = current[key as keyof typeof current];

          let isDifferent = false;
          if (typeof oldValue === 'string' && typeof newValue === 'number') {
            isDifferent = Math.abs(parseFloat(oldValue) - newValue) > 0.0001;
          } else if (oldValue !== newValue) {
            isDifferent = true;
          }

          if (isDifferent) {
            changes.push({ key, old: String(oldValue), new: String(newValue) });
            updatedFields[key] = newValue;
          }
        }
      }

      if (changes.length === 0) return { success: true, newVersion: current.version };

      const oldId = current.id;
      const merged = {
        ...current,
        ...updatedFields,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { id: _dropped, ...insertPayload } = merged;

      const [inserted] = await tx.insert(fauchardConfig).values(insertPayload as any).returning({ id: fauchardConfig.id });

      const newId = inserted!.id;

      await tx.update(fauchardConfig).set({ isActive: false }).where(eq(fauchardConfig.id, oldId));

      await tx.update(fauchardConfig).set({ isActive: true }).where(eq(fauchardConfig.id, newId));

      for (const change of changes) {
        await tx.insert(fauchardConfigLog).values({
          configId: newId,
          changedBy: identity.adminId ?? (identity.id as string),
          parameterKey: change.key,
          oldValue: change.old,
          newValue: change.new,
          changedAt: new Date(),
        });
      }

      return { success: true, newVersion: updatedFields.version as number };
    });
  } catch (error) {
    console.error('[updateFauchardParamsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S6-03: Obtener log de cambios (Admin) ───────────────────────────────────

export async function getFauchardConfigLogAction(limit = 100): Promise<ActionResult<{ logs: any[] }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  try {
    const logs = await db
      .select({
        id: fauchardConfigLog.id,
        configId: fauchardConfigLog.configId,
        parameterKey: fauchardConfigLog.parameterKey,
        oldValue: fauchardConfigLog.oldValue,
        newValue: fauchardConfigLog.newValue,
        changedAt: fauchardConfigLog.changedAt,
        changedByName: user.fullName,
      })
      .from(fauchardConfigLog)
      .leftJoin(user, eq(fauchardConfigLog.changedBy, user.id))
      .orderBy(desc(fauchardConfigLog.changedAt))
      .limit(limit);

    return { success: true, logs };
  } catch (error) {
    console.error('[getFauchardConfigLogAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S7-01: Obtener métricas de salud del algoritmo (Admin) ──────────────────

export async function getFauchardMetricsAction(days: number = 30): Promise<ActionResult<{ metrics: any }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const now = new Date();
    const startDate = subDays(now, days);
    if (infraPromise) await infraPromise;
    const config = await getActiveConfig();

    const technicians = await db
      .select()
      .from(user)
      .where(eq(user.role, 'tecnico'));

    const assignmentRows = await db
      .select({
        technicianId: caseAssignment.technicianId,
        status: caseAssignment.status,
        compensation: caseAssignment.compensation,
        assignedAt: caseAssignment.assignedAt,
        respondedAt: caseAssignment.respondedAt,
      })
      .from(caseAssignment)
      .where(gte(caseAssignment.assignedAt, startDate));

    type TechStat = {
      technicianId: string;
      fullName: string | null;
      leagueLevel: string | null;
      leagueInTransition: boolean;
      isAvailable: boolean | null;
      assignmentsCount: number;
      respondedCount: number;
      acceptedCount: number;
      rejectedCount: number;
      expiredCount: number;
      compensations: number[];
      responseMinutes: number[];
      lastInvitedAt: Date | null;
    };

    const techStats: Record<string, TechStat> = {};
    for (const tech of technicians) {
      techStats[tech.id] = {
        technicianId: tech.id,
        fullName: tech.fullName,
        leagueLevel: tech.leagueLevel,
        leagueInTransition: !!tech.leagueTransitionStartedAt,
        isAvailable: tech.isAvailable,
        assignmentsCount: 0,
        respondedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        expiredCount: 0,
        compensations: [],
        responseMinutes: [],
        lastInvitedAt: tech.lastInvitedAt,
      };
    }

    for (const row of assignmentRows) {
      const ts = techStats[row.technicianId];
      if (!ts) continue;
      ts.assignmentsCount++;
      if (row.status === 'accepted' || row.status === 'rejected') {
        ts.respondedCount++;
        if (row.respondedAt && row.assignedAt) {
          ts.responseMinutes.push(
            (new Date(row.respondedAt).getTime() - new Date(row.assignedAt).getTime()) / 60000,
          );
        }
      }
      if (row.status === 'accepted') ts.acceptedCount++;
      if (row.status === 'rejected') ts.rejectedCount++;
      if (row.status === 'expired') ts.expiredCount++;
      if (row.compensation) ts.compensations.push(row.compensation);
    }

    const { rankCandidatesForScenario } = await import('./assignment');
    const { deriveScenarioFromInputs } = await import('@/lib/fauchard/assignmentScenario');
    const scenario = deriveScenarioFromInputs('Corona Unitaria', []);
    const ranked = await rankCandidatesForScenario(scenario, config);
    const scoreByTech = new Map(ranked.map((r) => [r.technicianId, r.score]));

    const assignmentsByTechnician = Object.values(techStats).map((ts) => {
      const decided = ts.acceptedCount + ts.rejectedCount;
      return {
        ...ts,
        technicianResponseRate: ts.assignmentsCount > 0 ? ts.respondedCount / ts.assignmentsCount : 0,
        acceptRate: decided > 0 ? ts.acceptedCount / decided : 0,
        avgCompensation:
          ts.compensations.length > 0
            ? ts.compensations.reduce((a, b) => a + b, 0) / ts.compensations.length
            : 0,
        avgResponseMinutes:
          ts.responseMinutes.length > 0
            ? ts.responseMinutes.reduce((a, b) => a + b, 0) / ts.responseMinutes.length
            : null,
        currentScore: scoreByTech.get(ts.technicianId) ?? 0,
        daysWithoutAssignment: ts.lastInvitedAt
          ? Math.floor((now.getTime() - new Date(ts.lastInvitedAt).getTime()) / 86400000)
          : 999,
      };
    });

    const sortedByScore = [...assignmentsByTechnician].sort((a, b) => b.currentScore - a.currentScore);
    const top25Count = Math.ceil(sortedByScore.length * 0.25);
    const topQuartile = sortedByScore.slice(0, top25Count);
    const totalAssignments = assignmentsByTechnician.reduce((acc, t) => acc + t.assignmentsCount, 0);
    const topAssignments = topQuartile.reduce((acc, t) => acc + t.assignmentsCount, 0);
    const topQuartileShare = totalAssignments > 0 ? topAssignments / totalAssignments : 0;

    const alerts: {
      type: 'concentration' | 'inactive_technician' | 'empty_pool';
      message: string;
      severity: 'warning' | 'critical';
    }[] = [];

    if (topQuartileShare > 0.6) {
      alerts.push({
        type: 'concentration',
        severity: 'warning',
        message: `Concentración alta: el 25% superior de los técnicos acapara el ${(topQuartileShare * 100).toFixed(0)}% de las asignaciones.`,
      });
    }

    const inactiveAvailable = assignmentsByTechnician.filter(
      (t) => t.isAvailable && t.assignmentsCount === 0 && t.daysWithoutAssignment > 7,
    );
    if (inactiveAvailable.length > 0) {
      alerts.push({
        type: 'inactive_technician',
        severity: 'warning',
        message: `${inactiveAvailable.length} técnicos disponibles no han recibido asignaciones en la última semana.`,
      });
    }

    const failedCasesData = await db
      .select({
        caseId: clinicalCase.id,
        status: clinicalCase.status,
        internalStatus: clinicalCase.internalStatus,
        updatedAt: clinicalCase.updatedAt,
      })
      .from(clinicalCase)
      .where(
        and(
          inArray(clinicalCase.status, [
            INTERNAL_CASE_STATUSES.SIN_ASIGNACION_FALLO,
            INTERNAL_CASE_STATUSES.SIN_COTIZACIONES_FALLO,
          ]),
          gte(clinicalCase.updatedAt, startDate),
        ),
      )
      .orderBy(desc(clinicalCase.updatedAt));

    const failedCases = failedCasesData.map((c) => ({
      caseId: c.caseId,
      status: c.status,
      internalStatus: c.internalStatus,
      reason:
        c.status === INTERNAL_CASE_STATUSES.SIN_ASIGNACION_FALLO
          ? 'Sin técnicos elegibles para asignar'
          : 'Pool agotado sin asignación exitosa',
      createdAt: c.updatedAt,
    }));

    if (failedCases.length > 0) {
      alerts.push({
        type: 'empty_pool',
        severity: 'critical',
        message: `Se detectaron ${failedCases.length} casos sin asignación en el período.`,
      });
    }

    const totalResponded = assignmentsByTechnician.reduce((a, b) => a + b.respondedCount, 0);
    const totalAccepted = assignmentsByTechnician.reduce((a, b) => a + b.acceptedCount, 0);
    const totalRejected = assignmentsByTechnician.reduce((a, b) => a + b.rejectedCount, 0);
    const allResponseMinutes = assignmentRows
      .filter(
        (r) =>
          r.respondedAt &&
          r.assignedAt &&
          (r.status === 'accepted' || r.status === 'rejected'),
      )
      .map(
        (r) =>
          (new Date(r.respondedAt!).getTime() - new Date(r.assignedAt).getTime()) / 60000,
      );
    const globalAvgResponseMinutes =
      allResponseMinutes.length > 0
        ? allResponseMinutes.reduce((a, b) => a + b, 0) / allResponseMinutes.length
        : null;

    return {
      success: true,
      metrics: {
        assignmentsByTechnician,
        topQuartileShare,
        alerts,
        failedCases,
        technicianResponseRate: totalAssignments > 0 ? totalResponded / totalAssignments : 0,
        technicianAcceptanceRate:
          totalAccepted + totalRejected > 0 ? totalAccepted / (totalAccepted + totalRejected) : 0,
        avgResponseMinutes: globalAvgResponseMinutes,
      },
    };
  } catch (error) {
    console.error('[getFauchardMetricsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S7-02: Simular asignación directa (Admin) ───────────────────────────────

export async function simulateFauchardAction(params: {
  restorationType: string;
  restorationCode?: string;
  caseComplexity?: string;
  complexityMode?: 'auto' | 'manual';
  serviceType?: string;
  teeth?: number[];
  excludeTechnicianIds?: string[];
  configOverride?: Record<string, unknown>;
  materialCode?: string;
  shadeCode?: string;
  urgencyLabel?: string;
  notesEstheticLength?: number;
}): Promise<ActionResult<{ simulation: import('@/lib/fauchard/simulationTypes').SimulationResult }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') {
    return { success: false, error: 'No autorizado' };
  }

  const { simulateAssignmentAction } = await import('./assignment');
  const restorationLabel =
    WORK_TYPE_LABELS[params.restorationType] ?? params.restorationType;

  return simulateAssignmentAction({
    restorationLabel,
    restorationCode: params.restorationCode,
    teeth: params.teeth,
    caseComplexity: params.caseComplexity as CaseComplexity | undefined,
    complexityMode: params.complexityMode,
    excludeTechnicianIds: params.excludeTechnicianIds,
    configOverride: params.configOverride,
    materialCode: params.materialCode,
    shadeCode: params.shadeCode,
    urgencyLabel: params.urgencyLabel,
    notesEstheticLength: params.notesEstheticLength,
  });
}

// ─── S7-05: Cambiar disponibilidad manualmente (Admin) ───────────────────────

export async function toggleTechnicianAvailabilityAdminAction(technicianId: string, available: boolean): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  try {
    await db.update(user)
      .set({ isAvailable: available, updatedAt: new Date() })
      .where(eq(user.id, technicianId));
    
    return { success: true };
  } catch (error) {
    console.error('[toggleTechnicianAvailabilityAdminAction] Error:', error);
    return { success: false, error: String(error) };
  }
}
