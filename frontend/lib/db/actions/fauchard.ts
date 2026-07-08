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
  user,
  restorationType as restorationTypeTable,
  technicianAvailability,
} from '@/lib/db/schema';
import { eq, and, inArray, or, lt, gte, count, desc } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { notifyUser } from '../../services/notifications';
import { subDays } from 'date-fns';
import { CASE_STATUSES, INTERNAL_CASE_STATUSES, SERVICE_TYPES, WORK_TYPE_LABELS, WORK_CATEGORY_LABELS, type CaseComplexity } from '@/lib/constants/dental';
import { resolveScenario, categoryForWorkType } from '@/lib/fauchard/caseWorkType';
import type { ActionResult } from '@/lib/types/actions';
// ─── v5.0 — Modelo de disponibilidad / sanción rolling ───
import { levelToScoreN, POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { computeEligibleAction, ensureTechnicianAvailabilityAction, type Capacity } from './availability';
import { computeLevelForTechnicianAction, recordNoResponseEventAction } from './noResponseEvents';
import { configValuesDiffer, roundAlphaWeight, ACTIVE_ALPHA_KEYS } from '@/lib/fauchard/alphaWeightNormalize';

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
  loadReferenceMin: number;
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

/** Metadatos que se excluyen al comparar/copiar versiones de config. */
const METADATA_KEYS = new Set([
  'id', 'version', 'isActive', 'updatedBy', 'createdAt', 'updatedAt', 'changeReason',
]);

/** Metadata mínima de una versión de config para el historial. */
export interface ConfigVersionMeta {
  id: string;
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedByName: string | null;
  changeReason: string | null;
}

/** KPIs agregados de los casos evaluados bajo una versión de config.
 *  Campos alineados con AssignmentMetricsPanel del monitor. */
export interface ConfigVersionKpis {
  totalCasesPublished: number;
  /** Resp ÷ Asig — técnicos que respondieron (aceptaron o rechazaron) */
  technicianResponseRate: number | null;
  /** Acept ÷ Resp — de las respuestas, cuántas terminaron en aceptado */
  technicianAcceptanceRate: number | null;
  /** Minutos promedio entre assignedAt y respondedAt */
  avgResponseMinutes: number | null;
  /** Casos con status sin_asignacion_fallo */
  failedCasesCount: number;
}

/** Capacidades (CAD) requeridas — la app solo opera en modo solo_diseno. */
function capacitiesForServiceType(_serviceType: string): Capacity[] {
  return ['cad'];
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

    const resolved = resolveScenario({
      restorationLabel: restorationType,
      teeth,
      replacesMissingTeeth: cCase.cc.replacesMissingTeeth,
    });

    const { workType, caseComplexity: complexity, caseLeague, category } = resolved;
    const serviceType: string = SERVICE_TYPES.SOLO_DISENO;

    const categoryLabel = WORK_CATEGORY_LABELS[category];
    const workTypeLabel = WORK_TYPE_LABELS[workType] ?? workType;

    await db
      .update(clinicalCase)
      .set({
        caseComplexity: complexity,
        serviceType,
        caseLeague,
        derivedWorkType: workType,
        derivedCategory: category,
        internalStatus: INTERNAL_CASE_STATUSES.CLASIFICANDO,
        updatedAt: new Date(),
      })
      .where(eq(clinicalCase.id, caseId));

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: 'CASO_CLASIFICADO',
      content: `Caso clasificado: ${complexity} · ${categoryLabel} · ${workTypeLabel}`,
      payload: {
        complexity,
        serviceType,
        workType,
        workTypeLabel,
        category,
        categoryLabel,
        visibleTo: 'dentista',
      },
    });

    return { success: true, data: { complexity, serviceType, workType, category } };
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

/** ¿El técnico cumple el AND triple para el caso? */
export async function isTechnicianEligibleForCaseAction(caseId: string, technicianId: string): Promise<boolean> {
  const [cRow] = await db
    .select({ cc: clinicalCase, restorationCode: restorationTypeTable.label })
    .from(clinicalCase)
    .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
    .where(eq(clinicalCase.id, caseId))
    .limit(1) as any;
  if (!cRow) return false;
  const workType = cRow.cc.derivedWorkType
    ?? resolveScenario({
      restorationLabel: cRow.restorationCode || '',
      teeth: (cRow.cc.teeth as number[]) || [],
      replacesMissingTeeth: cRow.cc.replacesMissingTeeth,
    }).workType;
  const serviceType = cRow.cc.serviceType || SERVICE_TYPES.SOLO_DISENO;
  const category = cRow.cc.derivedCategory
    ? (cRow.cc.derivedCategory as import('@/lib/constants/dental').WorkCategory)
    : categoryForWorkType(workType);
  // Self-heal: garantizar la fila antes de evaluar (computeEligibleAction excluye sin fila).
  await ensureTechnicianAvailabilityAction(technicianId);
  for (const cap of capacitiesForServiceType(serviceType)) {
    if (!(await computeEligibleAction(technicianId, category, cap))) return false;
  }
  return true;
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
    const { rankAssignmentCandidates, assignCaseAction } = await import('./assignment');
    const config = await getConfigForCase(caseId);

    // Obtener un actorId de sistema: el dentista del caso sirve como actor del evento.
    const [cRow] = await db.select({ doctorId: clinicalCase.doctorId }).from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    const systemActorId = cRow?.doctorId ?? 'sistema';

    const ranked = await rankAssignmentCandidates(caseId);
    if (!ranked.length) return { success: true, reactivated: false };

    const top = ranked[0];
    const res = await assignCaseAction(caseId, top.technicianId, {
      fauchardConfigId: config.id,
      pinCaseToConfig: true,
      score: top.score,
      systemActorId,
    });
    if (!res.success) return { success: true, reactivated: false };
    return { success: true, reactivated: true };
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

// ─── Evaluación comparativo (eliminado) ───────────────────────────────────────

/** @deprecated — el comparativo ya no existe. */
export async function evaluateQuotesAction(_caseId: string) {
  return { success: true, skipped: true };
}

// ─── S2-10: Penalizar técnico por no responder ───────────────────────────────

export async function penalizeNoResponseAction(technicianId: string, invitationId?: string) {
  try {
    // Sanción rolling gradual (v5.0): evento en ventana + nivel 1/2/3.
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
        loadReferenceMin: fauchardConfig.loadReferenceMin,
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

export async function updateFauchardParamsAction(
  params: Record<string, any>,
  reason?: string,
): Promise<ActionResult<{ newVersion: number; persisted?: boolean }>> {
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

      // 1. Validaciones de pesos (α) — suma SOLO los 6 α activos presentes en params.
      const presentAlphaKeys = ACTIVE_ALPHA_KEYS.filter((k) => params[k] !== undefined);
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

      const effectiveParams = { ...params };

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
      range('loadReferenceMin', 5, 50, 'Carga de Trabajo (Min)');

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

      for (const [key, rawValue] of Object.entries(effectiveParams)) {
        if (key in current && !METADATA_KEYS.has(key)) {
          const oldValue = current[key as keyof typeof current];
          const newValue = (ACTIVE_ALPHA_KEYS as readonly string[]).includes(key)
            ? roundAlphaWeight(Number(rawValue))
            : rawValue;

          if (configValuesDiffer(oldValue, newValue)) {
            changes.push({ key, old: String(oldValue), new: String(newValue) });
            updatedFields[key] = newValue;
          }
        }
      }

      if (changes.length === 0) {
        return { success: true, persisted: false, newVersion: current.version };
      }

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

      return { success: true, persisted: true, newVersion: updatedFields.version as number };
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

// ─── S6-04: Listar todas las versiones de config (Admin) ─────────────────────

export async function listAllConfigVersionsAction(): Promise<ActionResult<{ versions: ConfigVersionMeta[] }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') return { success: false, error: 'No autorizado' };

  try {
    if (infraPromise) await infraPromise;
    const versions = await db
      .select({
        id: fauchardConfig.id,
        version: fauchardConfig.version,
        isActive: fauchardConfig.isActive,
        createdAt: fauchardConfig.createdAt,
        changeReason: fauchardConfig.changeReason,
        updatedByName: user.fullName,
      })
      .from(fauchardConfig)
      .leftJoin(user, eq(fauchardConfig.updatedBy, user.id))
      .orderBy(desc(fauchardConfig.version));

    return { success: true, versions: versions as ConfigVersionMeta[] };
  } catch (error) {
    console.error('[listAllConfigVersionsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S6-05: KPIs agregados por versión de config (Admin) ─────────────────────

export async function getConfigVersionKpisAction(configId: string): Promise<ActionResult<{ kpis: ConfigVersionKpis }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') return { success: false, error: 'No autorizado' };

  const empty: ConfigVersionKpis = {
    totalCasesPublished: 0,
    technicianResponseRate: null,
    technicianAcceptanceRate: null,
    avgResponseMinutes: null,
    failedCasesCount: 0,
  };

  try {
    if (infraPromise) await infraPromise;

    const cases = await db
      .select({ id: clinicalCase.id, status: clinicalCase.status })
      .from(clinicalCase)
      .where(eq(clinicalCase.fauchardConfigId, configId));

    if (cases.length === 0) return { success: true, kpis: empty };

    const caseIds = cases.map((c) => c.id);
    const assignments = await db
      .select({
        status: caseAssignment.status,
        assignedAt: caseAssignment.assignedAt,
        respondedAt: caseAssignment.respondedAt,
      })
      .from(caseAssignment)
      .where(inArray(caseAssignment.clinicalCaseId, caseIds));

    const total = cases.length;
    const failedCasesCount = cases.filter((c) => c.status === 'sin_asignacion_fallo').length;

    const responded = assignments.filter((a) => a.respondedAt !== null).length;
    const accepted = assignments.filter((a) => a.status === 'accepted').length;

    const responseTimes = assignments
      .filter((a) => a.respondedAt !== null)
      .map((a) => (a.respondedAt!.getTime() - a.assignedAt.getTime()) / 60000);

    const kpis: ConfigVersionKpis = {
      totalCasesPublished: total,
      technicianResponseRate: assignments.length > 0 ? responded / assignments.length : null,
      technicianAcceptanceRate: responded > 0 ? accepted / responded : null,
      avgResponseMinutes: responseTimes.length > 0 ? responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length : null,
      failedCasesCount,
    };

    return { success: true, kpis };
  } catch (error) {
    console.error('[getConfigVersionKpisAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S6-06: Obtener versión completa por id (Admin) ──────────────────────────

export async function getConfigVersionFullAction(configId: string): Promise<ActionResult<{ config: FauchardConfigRow }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') return { success: false, error: 'No autorizado' };

  try {
    const config = await loadFauchardConfigById(configId);
    return { success: true, config };
  } catch (error) {
    console.error('[getConfigVersionFullAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S6-07: Restaurar una versión anterior como nueva versión activa (Admin) ──

export async function restoreConfigVersionAction(
  sourceConfigId: string,
  reason: string,
): Promise<ActionResult<{ newVersion: number; persisted?: boolean }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado — solo el administrador del sistema puede restaurar versiones' };

  try {
    const source = await loadFauchardConfigById(sourceConfigId);

    // Extraer solo los parámetros editables (excluir metadata)
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!METADATA_KEYS.has(key)) {
        params[key] = value;
      }
    }

    const compositeReason = `Restauración de V${source.version}: ${reason.trim()}`;
    return updateFauchardParamsAction(params, compositeReason);
  } catch (error) {
    console.error('[restoreConfigVersionAction] Error:', error);
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
        scoreAtAssignment: caseAssignment.scoreAtAssignment,
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
      scores: number[];
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
        scores: [],
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
      if (row.scoreAtAssignment) ts.scores.push(Number(row.scoreAtAssignment));
    }

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
        avgScore:
          ts.scores.length > 0
            ? ts.scores.reduce((a, b) => a + b, 0) / ts.scores.length
            : null,
        daysWithoutAssignment: ts.lastInvitedAt
          ? Math.floor((now.getTime() - new Date(ts.lastInvitedAt).getTime()) / 86400000)
          : 999,
      };
    });

    const sortedByScore = [...assignmentsByTechnician].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
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
        caseNumber: clinicalCase.caseNumber,
        status: clinicalCase.status,
        internalStatus: clinicalCase.internalStatus,
        updatedAt: clinicalCase.updatedAt,
      })
      .from(clinicalCase)
      .where(
        and(
          or(
            inArray(clinicalCase.status, [
              INTERNAL_CASE_STATUSES.SIN_ASIGNACION_FALLO,
              INTERNAL_CASE_STATUSES.SIN_COTIZACIONES_FALLO,
            ]),
            and(
              eq(clinicalCase.status, CASE_STATUSES.EN_EVALUACION),
              eq(clinicalCase.internalStatus, 'pendiente_pool'),
            ),
          ),
          gte(clinicalCase.updatedAt, startDate),
        ),
      )
      .orderBy(desc(clinicalCase.updatedAt));

    const failedCases = failedCasesData.map((c) => ({
      caseId: c.caseId,
      caseNumber: c.caseNumber,
      status: c.status,
      internalStatus: c.internalStatus,
      reason:
        c.internalStatus === 'pendiente_pool'
          ? 'En cola de espera: sin técnicos elegibles al momento de publicar'
          : c.status === INTERNAL_CASE_STATUSES.SIN_ASIGNACION_FALLO
            ? 'Sin técnicos elegibles para asignar'
            : 'No se encontraron técnicos elegibles tras agotar la cola de espera',
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
  replacesMissingTeeth?: boolean | null;
  fauchardConfigId?: string;
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
    replacesMissingTeeth: params.replacesMissingTeeth,
    fauchardConfigId: params.fauchardConfigId,
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
