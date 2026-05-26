'use server';

/**
 * FAUCHARD ENGINE — El núcleo orquestador de DentFlowAi.
 * 
 * Nombrado en honor a Pierre Fauchard (1678–1761), el médico francés reconocido como 
 * "El Padre de la Odontología Moderna". Su obra revolucionaria transformó el cuidado 
 * dental de un oficio empírico a una ciencia formal.
 */

import { db } from '@/lib/db';
import {
  clinicalCase,
  caseInvitation,
  fauchardConfig,
  fauchardConfigLog,
  technicianSkill,
  user,
  review,
  clinicalCaseEvent,
  restorationType as restorationTypeTable,
} from '@/lib/db/schema';
import { eq, and, sql, inArray, lt, gt, lte, ne, isNotNull, gte, count, avg, desc } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { notifyUser } from '../../services/notifications';
import { subDays } from 'date-fns';
import { CASE_COMPLEXITY, CASE_STATUSES, INTERNAL_CASE_STATUSES, SERVICE_TYPES, WORK_TYPE_LABELS, type CaseComplexity } from '@/lib/constants/dental';
import type { ActionResult } from '@/lib/types/actions';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';

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
  nFloor: number;
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

// ─── S2-02: Calcular score de un técnico para un caso ────────────────────────

async function calculateTechnicianScore(
  technicianId: string,
  workType: string,
  serviceType: string,
  config: FauchardConfigRow,
  avgPoolLoad: number = 5
): Promise<{ score: number; components: { Q: number; P: number; E: number; C: number; B: number } }> {
  const α1 = parseFloat(config.alphaQuality);
  const α2 = parseFloat(config.alphaPunctuality);
  const α3 = parseFloat(config.alphaExperience);
  const α4 = parseFloat(config.alphaLoad);
  const α5 = parseFloat(config.alphaBonus);
  const cMax = parseFloat(config.cMax);

  const now = new Date();
  const qualityWindow = new Date(now.getTime() - config.wQualityDays * 86400000);
  const loadWindow = new Date(now.getTime() - config.wLoadDays * 86400000);

  // Q — Calidad histórica: promedio de ratings en la ventana de calidad
  const qualityRows = await db
    .select()
    .from(review)
    .where(
      and(
        eq(review.revieweeId, technicianId),
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
      quotedDays: caseInvitation.quotedDays,
    })
    .from(caseInvitation)
    .innerJoin(clinicalCase, eq(caseInvitation.clinicalCaseId, clinicalCase.id))
    .where(and(
      eq(caseInvitation.technicianId, technicianId),
      eq(caseInvitation.status, 'confirmed'),
      isNotNull(clinicalCase.completedAt),
      isNotNull(clinicalCase.assignedAt),
    ));

  const totalCompleted = completedInvs.length;
  let onTimeCases = 0;
  for (const inv of completedInvs) {
    if (inv.completedAt && inv.assignedAt && inv.quotedDays) {
      const deadline = new Date(new Date(inv.assignedAt).getTime() + inv.quotedDays * 86400000);
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
    const designLevel = skillRow.designLevel ?? 0;
    const fabLevel = skillRow.fabricationLevel ?? 0;
    if (serviceType === SERVICE_TYPES.INTEGRAL) {
      // Integral: ambos niveles cuentan; el más débil define al técnico.
      skillLevel = Math.min(designLevel, fabLevel);
    } else if (serviceType === SERVICE_TYPES.SOLO_FABRICACION) {
      // Solo fabricación: solo fabrication_level cuenta para la experiencia.
      skillLevel = fabLevel;
    } else {
      // Solo diseño (default): design_level.
      skillLevel = designLevel;
    }
  }
  const E = skillLevel / 7;

  // C — Índice de carga reciente
  const recentInvs = await db
    .select()
    .from(caseInvitation)
    .where(and(eq(caseInvitation.technicianId, technicianId), gt(caseInvitation.invitedAt, loadWindow)));
  const invitationCount = recentInvs.length;

  const C = Math.min(invitationCount / (avgPoolLoad > 0 ? avgPoolLoad : 1), cMax);

  // B — Bono de infrautilización
  const [techRow] = await db
    .select()
    .from(user)
    .where(eq(user.id, technicianId))
    .limit(1);

  const lastInvited = techRow?.lastInvitedAt;
  const daysSince = lastInvited
    ? (now.getTime() - new Date(lastInvited).getTime()) / 86400000
    : config.dBonusMaxDays; // Si nunca fue invitado, bono máximo
  const B = Math.min(daysSince / config.dBonusMaxDays, 1.0);

  const score = α1 * Q + α2 * P + α3 * E - α4 * C + α5 * B;

  return { score: Math.max(0, score), components: { Q, P, E, C, B } };
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

    // Determinar tipo de servicio.
    // - Si el wizard ya pobló `serviceType` (caso v3), lo respetamos como fuente de verdad.
    // - Si no (caso legacy creado antes del wizard nuevo), lo derivamos de needsFabrication.
    const explicitServiceType = cCase.cc.serviceType as string | null | undefined;
    const isValidServiceType = explicitServiceType
      ? (Object.values(SERVICE_TYPES) as string[]).includes(explicitServiceType)
      : false;
    const serviceType: string = isValidServiceType
      ? (explicitServiceType as string)
      : (cCase.cc.needsFabrication ? SERVICE_TYPES.INTEGRAL : SERVICE_TYPES.SOLO_DISENO);

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
}> {
  const identity = await getServerIdentity();
  if (!identity) return { success: false, error: 'No autenticado' };

  try {
    const config = await getConfigForCase(caseId);

    console.log('[DEBUG] 2. get clinicalCase');
    const [cCaseRow] = await db
      .select({
        cc: clinicalCase,
        restorationCode: restorationTypeTable.label,
      })
      .from(clinicalCase)
      .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
      .where(eq(clinicalCase.id, caseId))
      .limit(1) as any;

    if (!cCaseRow) return { success: false, error: 'Caso no encontrado' };
    const cCase = cCaseRow.cc;

    console.log('[DEBUG] 3. getWorkTypeForCase');
    const workType = getWorkTypeForCase(
      cCaseRow.restorationCode || '',
      (cCase.teeth as number[]) || []
    );
    const serviceType = cCase.serviceType || SERVICE_TYPES.SOLO_DISENO;

    console.log('[DEBUG] 4. update internalStatus');
    await db.update(clinicalCase)
      .set({ internalStatus: INTERNAL_CASE_STATUSES.SELECCIONANDO_TECNICOS })
      .where(eq(clinicalCase.id, caseId));

    const now = new Date();
    const inactivityThreshold = new Date(now.getTime() - config.dInactivityDays * 86400000);
    const cooldownThreshold = new Date(now.getTime() - config.tCooldownMinutes * 60000);
    const loadWindow = new Date(now.getTime() - config.wLoadDays * 86400000);

    console.log('[DEBUG] 5. select candidates');
    const candidates = await db
      .select()
      .from(user)
      .where(
        and(
          eq(user.role, 'tecnico'),
          eq(user.isAvailable, true),
          eq(user.isActive, true)
        )
      );

    // S8-02: Lógica de reintento con expansión de categorías
    let filtered: any[] = [];
    
    let exclusionReasons = {
      notInLeague: 0,
      suspended: 0,
      noResponse: 0,
      inactive: 0,
      cooldown: 0,
      lowSkill: 0
    };

    const attempts = [
      { category: 'current' }, // Intento 1: Misma categoría
      { category: 'expand_1' },  // Intento 2: +1 categoría inferior
      { category: 'all' }        // Intento 3: Todas las categorías
    ];

    for (const attempt of attempts) {
      filtered = [];
      exclusionReasons = { notInLeague: 0, suspended: 0, noResponse: 0, inactive: 0, cooldown: 0, lowSkill: 0 };
      
      console.log(`[DEBUG] Attempt ${attempt.category}`);
      const [caseData] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
      const caseLeague = caseData?.caseLeague || 'bronce';

      const leaguePool = candidates.filter(tech => {
        if (attempt.category === 'all') return true;
        if (attempt.category === 'expand_1') {
          const leagues = ['bronce', 'plata', 'oro', 'elite'];
          const targetIdx = leagues.indexOf(caseLeague.toLowerCase());
          const expandedLeagues = leagues.slice(Math.max(0, targetIdx - 1));
          const match = expandedLeagues.includes((tech.leagueLevel ?? 'bronce').toLowerCase());
          if (!match) exclusionReasons.notInLeague++;
          return match;
        }
        const match = (tech.leagueLevel ?? 'bronce').toLowerCase() === caseLeague.toLowerCase();
        if (!match) exclusionReasons.notInLeague++;
        return match;
      });

      for (const tech of leaguePool) {
        if (tech.suspendedUntil && new Date(tech.suspendedUntil) > now) { exclusionReasons.suspended++; continue; }
        if ((tech.consecutiveNoResponse ?? 0) >= 3) { exclusionReasons.noResponse++; continue; }
        // Inactividad: solo excluir si tenemos registro de último login y es antiguo
        if (tech.lastLoginAt && new Date(tech.lastLoginAt) < inactivityThreshold) { exclusionReasons.inactive++; continue; }

        console.log(`[DEBUG] Checking tech ${tech.id} cooldown`);
        const [recentInv] = await db
          .select()
          .from(caseInvitation)
          .where(and(
            eq(caseInvitation.technicianId, tech.id),
            gt(caseInvitation.invitedAt, cooldownThreshold),
            eq(caseInvitation.workType, workType)
          ))
          .limit(1);
        if (recentInv) { exclusionReasons.cooldown++; continue; }

        console.log(`[DEBUG] Checking tech ${tech.id} skills`);
        const minSkillLevel = MIN_SKILL_FOR_CATEGORY[caseLeague] ?? 1;
        // El filtro principal depende del serviceType:
        // - solo_diseno / integral: design_level >= min
        // - solo_fabricacion: fabrication_level >= min (design ignorado)
        const isSoloFabrication = serviceType === SERVICE_TYPES.SOLO_FABRICACION;
        const skillFilter = isSoloFabrication
          ? gte(technicianSkill.fabricationLevel, minSkillLevel)
          : gte(technicianSkill.designLevel, minSkillLevel);
        const [skill] = await db.select().from(technicianSkill)
          .where(and(
            eq(technicianSkill.userId, tech.id),
            eq(technicianSkill.workType, workType),
            skillFilter
          ))
          .limit(1);
        if (!skill) { exclusionReasons.lowSkill++; continue; }
        // Para servicios integrales: fabricación también debe cumplir el nivel mínimo
        if (serviceType === SERVICE_TYPES.INTEGRAL && (skill.fabricationLevel ?? 0) < minSkillLevel) { exclusionReasons.lowSkill++; continue; }

        filtered.push(tech);
      }

      if (filtered.length >= config.nInvited) break;
    }

    if (filtered.length === 0) {
      console.log('[DEBUG] filtered.length === 0', exclusionReasons);
      const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
      
      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: 'SELECCION_FALLIDA',
        content: `No se encontraron técnicos disponibles. Total evaluados: ${candidates.length}. Excluidos por - Liga: ${exclusionReasons.notInLeague}, Suspendidos: ${exclusionReasons.suspended}, Sin respuesta: ${exclusionReasons.noResponse}, Inactivos: ${exclusionReasons.inactive}, Cooldown: ${exclusionReasons.cooldown}, Habilidades insuficientes: ${exclusionReasons.lowSkill}.`,
        payload: { exclusionReasons, candidatesTotal: candidates.length, visibleTo: 'sistema' },
      });

      if (cCase) {
        if (cCase.doctorId) await notifyUser(cCase.doctorId, 'FALLO_SELECCION_DENTISTA', { caseId });
        const [admin] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
        if (admin) await notifyUser(admin.id, 'SIN_COTIZACIONES_FALLO', { caseId });
      }

      return { success: false, error: 'No se encontraron técnicos disponibles para tu caso en este momento.' };
    }

    // Promedio real de invitaciones del pool en la ventana de carga (para componente C)
    let avgPoolLoad = 1;
    if (filtered.length > 0) {
      const poolIds = filtered.map(t => t.id);
      const [loadResult] = await db
        .select({ total: sql<number>`count(*)` })
        .from(caseInvitation)
        .where(and(inArray(caseInvitation.technicianId, poolIds), gt(caseInvitation.invitedAt, loadWindow)));
      avgPoolLoad = Math.max(Number(loadResult?.total ?? 0) / filtered.length, 1);
    }

    // Calcular scores para el pool elegible
    const scored: { id: string; score: number }[] = [];
    for (const tech of filtered) {
      console.log(`[DEBUG] calculateTechnicianScore for ${tech.id}`);
      const { score } = await calculateTechnicianScore(tech.id, workType, serviceType, config, avgPoolLoad);
      scored.push({ id: tech.id, score });
    }

    // Selección probabilística ponderada sin reemplazo
    const nToInvite = Math.min(config.nInvited, scored.length);
    const selected: string[] = [];
    const pool = [...scored];

    for (let i = 0; i < nToInvite; i++) {
      const totalScore = pool.reduce((acc, t) => acc + t.score, 0);
      if (totalScore === 0) {
        const idx = Math.floor(Math.random() * pool.length);
        selected.push(pool[idx].id);
        pool.splice(idx, 1);
      } else {
        const rand = Math.random() * totalScore;
        let cumulative = 0;
        let chosenIdx = 0;
        for (let j = 0; j < pool.length; j++) {
          cumulative += pool[j].score;
          if (rand <= cumulative) { chosenIdx = j; break; }
        }
        selected.push(pool[chosenIdx].id);
        pool.splice(chosenIdx, 1);
      }
    }

    return { success: true, technicianIds: selected, fauchardConfigId: config.id };
  } catch (error) {
    console.error('[runFauchardAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S2-04: Crear invitaciones para técnicos seleccionados ───────────────────

export async function sendInvitationsAction(
  caseId: string,
  technicianIds: string[],
  inviteCtx?: { fauchardConfigId: string; pinCaseToConfig?: boolean },
) {
  const identity = await getServerIdentity();
  if (!identity) return { success: false, error: 'No autenticado' };

  try {
    const config = inviteCtx?.fauchardConfigId
      ? await loadFauchardConfigById(inviteCtx.fauchardConfigId)
      : await getConfigForCase(caseId);
    const expiresAt = new Date(Date.now() + config.tQuoteMinutes * 60000);

    const [cCaseRow] = await db
      .select({ cc: clinicalCase, restorationCode: restorationTypeTable.code })
      .from(clinicalCase)
      .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
      .where(eq(clinicalCase.id, caseId))
      .limit(1) as any;
    const cCase = cCaseRow?.cc;

    const workType = getWorkTypeForCase(cCaseRow?.restorationCode || '', (cCase?.teeth as number[]) || []);

    let invitedCount = 0;
    let skippedInvites = 0;

    for (const techId of technicianIds) {
      const [existing] = await db
        .select({ id: caseInvitation.id })
        .from(caseInvitation)
        .where(
          and(
            eq(caseInvitation.clinicalCaseId, caseId),
            eq(caseInvitation.technicianId, techId),
            inArray(caseInvitation.status, ['pending', 'quoted']),
          ),
        )
        .limit(1);

      if (existing) {
        skippedInvites += 1;
        continue;
      }

      const { score } = await calculateTechnicianScore(techId, workType, cCase?.serviceType || SERVICE_TYPES.SOLO_DISENO, config);

      const [createdInv] = await db.insert(caseInvitation).values({
        clinicalCaseId: caseId,
        technicianId: techId,
        status: 'pending',
        invitedAt: new Date(),
        expiresAt,
        scoreAtInvite: String(score.toFixed(4)),
        workType,
      }).returning({ id: caseInvitation.id });

      await db.update(user)
        .set({ lastInvitedAt: new Date() })
        .where(eq(user.id, techId));

      await notifyUser(techId, 'NUEVA_INVITACION' as any, {
        caseId,
        deadline: expiresAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      });
      
      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.INVITACION_ENVIADA,
        content: 'Invitación de cotización registrada.',
        payload: { technicianId: techId, expiresAt: expiresAt.toISOString(), visibleTo: 'sistema' },
      });

      if (createdInv?.id) {
        await logCaseEvent({
          caseId,
          userId: techId,
          type: 'sistema',
          action: CASE_EVENTS.INVITACION_RECIBIDA,
          content: 'Te llegó una invitación para cotizar este caso.',
          payload: {
            invitationId: createdInv.id,
            expiresAt: expiresAt.toISOString(),
            visibleTo: 'tecnico',
            ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
          },
        });
      }
      invitedCount += 1;
    }

    await db.update(clinicalCase)
      .set({
        status: 'enEvaluacion',
        internalStatus: INTERNAL_CASE_STATUSES.COTIZACIONES_ABIERTAS,
        updatedAt: new Date(),
        ...(inviteCtx?.pinCaseToConfig && inviteCtx.fauchardConfigId
          ? { fauchardConfigId: inviteCtx.fauchardConfigId }
          : {}),
      })
      .where(eq(clinicalCase.id, caseId));

    return { success: true, invitedCount, skippedInvites, expiresAt };
  } catch (error) {
    console.error('[sendInvitationsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S2-05: Técnico responde a invitación ────────────────────────────────────

/**
 * Payload de cotización.
 * - `flat`: un único precio y plazo (solo_diseno, solo_fabricacion).
 * - `split`: desglose obligatorio diseño + fabricación (solo casos `integral`).
 * El total (`quotedPrice`, `quotedDays`) se calcula como suma cuando es split.
 */
export type QuoteInput =
  | { kind: 'flat'; price: number; deliveryDays: number; notes?: string }
  | {
      kind: 'split';
      designPrice: number;
      designDays: number;
      fabricationPrice: number;
      fabricationDays: number;
      notes?: string;
    };

/**
 * Wrapper retrocompatible: si llaman a submitQuoteAction(invId, price, days, notes)
 * se mapea a `{ kind: 'flat' }`. La firma nueva con QuoteInput es preferida.
 */
export async function submitQuoteAction(
  invitationId: string,
  priceOrInput: number | QuoteInput,
  deliveryDays?: number,
  notes?: string,
) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };

  // Normalizar firma a un único QuoteInput.
  // Cuando el caller usa la firma legacy (number, number, notes) marcamos
  // `isLegacyFlat` para relajar la validación de coherencia con serviceType:
  // los flujos antiguos (tests, integraciones internas) seguirán funcionando.
  const isLegacyFlat = typeof priceOrInput !== 'object';
  const input: QuoteInput = typeof priceOrInput === 'object'
    ? priceOrInput
    : { kind: 'flat', price: priceOrInput, deliveryDays: deliveryDays ?? 0, notes };

  try {
    const [invitation] = await db
      .select()
      .from(caseInvitation)
      .where(eq(caseInvitation.id, invitationId))
      .limit(1);

    if (!invitation) return { success: false, error: 'Invitación no encontrada' };
    if (invitation.technicianId !== identity.id) return { success: false, error: 'No autorizado' };
    if (invitation.status !== 'pending') return { success: false, error: 'Esta invitación ya fue respondida o expiró' };
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      return { success: false, error: 'El tiempo para cotizar ha vencido' };
    }

    const guarded = await guardTextOrFail({
      actionName: 'submitQuoteAction',
      caseId: invitation.clinicalCaseId,
      identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
      fields: [{ text: input.notes, field: 'techNotes' }],
    });
    if (!guarded.ok) return { success: false, error: guarded.error };

    // Cargar el serviceType del caso para validar coherencia entre input y tipo.
    const [cCase] = await db
      .select({ serviceType: clinicalCase.serviceType, needsFabrication: clinicalCase.needsFabrication })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, invitation.clinicalCaseId))
      .limit(1);

    const effectiveServiceType: string = (cCase?.serviceType as string | null)
      ?? (cCase?.needsFabrication ? SERVICE_TYPES.INTEGRAL : SERVICE_TYPES.SOLO_DISENO);
    const isIntegral = effectiveServiceType === SERVICE_TYPES.INTEGRAL;

    // Validación serviceType ⇄ input.kind.
    // - Si el caller usa la firma nueva (objeto QuoteInput), exigimos coherencia estricta.
    // - Si el caller usa la firma legacy (number, number), aceptamos flat para todos los
    //   tipos por retrocompatibilidad: la UI nueva siempre pasa el QuoteInput correcto y
    //   esa es la fuente de verdad del frontend.
    if (!isLegacyFlat) {
      if (isIntegral && input.kind !== 'split') {
        return { success: false, error: 'Para casos integrales se debe enviar el desglose diseño + fabricación' };
      }
      if (!isIntegral && input.kind !== 'flat') {
        return { success: false, error: 'Este caso solo acepta un precio y plazo únicos' };
      }
    }

    // Calcular totales y campos a persistir.
    let totalPrice: number;
    let totalDays: number;
    let designPrice: number | null = null;
    let designDays: number | null = null;
    let fabricationPrice: number | null = null;
    let fabricationDays: number | null = null;
    let notesText: string | undefined;

    if (input.kind === 'flat') {
      if (input.price <= 0) return { success: false, error: 'El precio debe ser mayor a 0' };
      if (input.deliveryDays < 1 || input.deliveryDays > 365) {
        return { success: false, error: 'El plazo debe estar entre 1 y 365 días' };
      }
      totalPrice = input.price;
      totalDays = input.deliveryDays;
      notesText = input.notes;
    } else {
      if (input.designPrice <= 0 || input.fabricationPrice <= 0) {
        return { success: false, error: 'Los precios de diseño y fabricación deben ser mayores a 0' };
      }
      if (
        input.designDays < 1 || input.designDays > 365
        || input.fabricationDays < 1 || input.fabricationDays > 365
      ) {
        return { success: false, error: 'Los plazos deben estar entre 1 y 365 días' };
      }
      designPrice = input.designPrice;
      designDays = input.designDays;
      fabricationPrice = input.fabricationPrice;
      fabricationDays = input.fabricationDays;
      totalPrice = designPrice + fabricationPrice;
      totalDays = designDays + fabricationDays;
      notesText = input.notes;
    }

    await db.update(caseInvitation)
      .set({
        status: 'quoted',
        quotedPrice: totalPrice,
        quotedDays: totalDays,
        quotedDesignPrice: designPrice,
        quotedDesignDays: designDays,
        quotedFabricationPrice: fabricationPrice,
        quotedFabricationDays: fabricationDays,
        techNotes: notesText?.slice(0, 200), // máx 200 chars
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(caseInvitation.id, invitationId));

    // Resetear consecutiveNoResponse al responder
    await db.update(user)
      .set({ consecutiveNoResponse: 0 })
      .where(eq(user.id, identity.id));

    const notesTrim = notesText?.trim() ? notesText.trim().slice(0, 200) : null;
    await logCaseEvent({
      caseId: invitation.clinicalCaseId,
      userId: identity.id,
      type: 'sistema',
      action: CASE_EVENTS.OFERTA_ENVIADA,
      content:
        'He enviado la Oferta.',
      payload: {
        invitationId,
        visibleTo: 'tecnico',
        quotedPrice: totalPrice,
        quotedDays: totalDays,
        ...(designPrice !== null
          ? {
              quotedDesignPrice: designPrice,
              quotedDesignDays: designDays,
              quotedFabricationPrice: fabricationPrice,
              quotedFabricationDays: fabricationDays,
            }
          : {}),
        techNotes: notesTrim,
      },
    });

    await logCaseEvent({
      caseId: invitation.clinicalCaseId,
      userId: identity.id,
      type: 'sistema',
      action: 'COTIZACION_RECIBIDA',
      content: 'Laboratorio envió cotización.',
      payload: { invitationId, technicianId: identity.id, visibleTo: 'sistema' },
    });

    // Expirar invitaciones vencidas y evaluar si ya no quedan pendientes
    await checkAndExpireInvitationsAction(invitation.clinicalCaseId);

    return { success: true };
  } catch (error) {
    console.error('[submitQuoteAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S2-06b: Verificación lazy de expiración ─────────────────────────────────

/** Etapa 1: expira invitaciones `pending` vencidas (no evalúa cotizaciones). */
export async function expirePendingInvitationsForCase(caseId: string) {
  const now = new Date();
  const expiredPending = await db
    .select()
    .from(caseInvitation)
    .where(
      and(
        eq(caseInvitation.clinicalCaseId, caseId),
        eq(caseInvitation.status, 'pending'),
        lt(caseInvitation.expiresAt, now),
      ),
    );

  for (const inv of expiredPending) {
    await db
      .update(caseInvitation)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(caseInvitation.id, inv.id));

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

    await penalizeNoResponseAction(inv.technicianId);
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
    .select({ id: caseInvitation.id })
    .from(caseInvitation)
    .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending')));

  if (stillPending.length > 0) {
    return { evaluated: false, reason: 'pending_invitations' as const };
  }

  const [invCount] = await db
    .select({ count: count() })
    .from(caseInvitation)
    .where(eq(caseInvitation.clinicalCaseId, caseId));

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

// ─── S2-07: Evaluar cotizaciones y seleccionar ganador ───────────────────────

export async function evaluateQuotesAction(caseId: string) {
  try {
    // Idempotencia: la evaluación solo procede desde `enEvaluacion`.
    // Si el caso ya transicionó (p. ej. `propuestaLista`, asignado, cerrado),
    // no debemos volver a "construir la propuesta": eso resetea `proposalExpiresAt`,
    // limpia `assignedTechnicianId`, y duplica eventos/notificaciones en cada lectura.
    const [c0] = await db
      .select({ status: clinicalCase.status })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);
    if (!c0 || c0.status !== CASE_STATUSES.EN_EVALUACION) {
      return { success: true, alreadyEvaluated: true };
    }

    await db.update(clinicalCase)
      .set({ internalStatus: INTERNAL_CASE_STATUSES.EVALUANDO_OFERTAS })
      .where(eq(clinicalCase.id, caseId));

    const config = await getConfigForCase(caseId);

    const quotes = await db
      .select()
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted')));

    if (quotes.length === 0) {
      // S8-03: Reintento automático si no hay cotizaciones
      const allInvs = await db.select().from(caseInvitation).where(eq(caseInvitation.clinicalCaseId, caseId));

      if (allInvs.length <= config.nInvited) {
        await logCaseEvent({
          caseId,
          userId: 'sistema',
          type: 'sistema',
          action: 'REINTENTO_SELECCION',
          content: 'No se recibieron cotizaciones en el primer round. Iniciando reintento con pool ampliado.',
          payload: { visibleTo: 'sistema' },
        });

        const res = await runFauchardAction(caseId);
        if (res.success && res.technicianIds!.length > 0 && res.fauchardConfigId) {
          await sendInvitationsAction(caseId, res.technicianIds!, { fauchardConfigId: res.fauchardConfigId });
          return { success: true, retry: true };
        }
      }

      await db.update(clinicalCase)
        .set({ internalStatus: INTERNAL_CASE_STATUSES.SIN_COTIZACIONES_FALLO, status: 'cerrado' })
        .where(eq(clinicalCase.id, caseId));

      await logCaseEvent({
        caseId,
        userId: 'sistema',
        type: 'sistema',
        action: CASE_EVENTS.CASO_SIN_OFERTAS_CERRADO,
        content:
          'No se recibieron ofertas para este caso en esta ronda. El caso ha sido cerrado. Puedes crear un nuevo caso cuando lo necesites.',
        payload: { visibleTo: 'dentista', ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
      });

      const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
      if (cCase) {
        if (cCase.doctorId) await notifyUser(cCase.doctorId, 'FALLO_SELECCION_DENTISTA', { caseId });
        const [admin] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
        if (admin) await notifyUser(admin.id, 'SIN_COTIZACIONES_FALLO', { caseId });
      }

      return { success: false, error: 'Sin cotizaciones disponibles tras reintento' };
    }

    const qMinSelection = parseFloat(config.qMinSelection);
    const qualityWindow = new Date(Date.now() - config.wQualityDays * 86400000);
    const qualifiedQuotes: typeof quotes = [];
    for (const q of quotes) {
      const reviewRows = await db
        .select({ rating: review.rating })
        .from(review)
        .where(and(eq(review.revieweeId, q.technicianId), gt(review.createdAt, qualityWindow)));
      const ratings = reviewRows.map(r => r.rating);
      const Q = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length / 5 : 0.5;
      if (Q >= qMinSelection) qualifiedQuotes.push(q);
    }
    const evaluationPool = qualifiedQuotes.length > 0 ? qualifiedQuotes : quotes;

    // Ranking solo para orden de exhibición — el dentista elige después (comparativo anónimo)
    const sorted = [...evaluationPool].sort((a, b) => {
      const priceDiff = (a.quotedPrice ?? Infinity) - (b.quotedPrice ?? Infinity);
      if (priceDiff !== 0) return priceDiff;
      const daysDiff = (a.quotedDays ?? Infinity) - (b.quotedDays ?? Infinity);
      if (daysDiff !== 0) return daysDiff;
      return new Date(a.respondedAt ?? a.createdAt ?? 0).getTime() - new Date(b.respondedAt ?? b.createdAt ?? 0).getTime();
    });

    const buildRes = await buildProposalAction(caseId, sorted.map(q => q.id));
    if (buildRes.alreadyBuilt) {
      return { success: true, alreadyEvaluated: true, offerCount: sorted.length };
    }
    if (!buildRes.success) {
      return { success: false, error: buildRes.error };
    }

    return { success: true, offerCount: sorted.length };
  } catch (error) {
    console.error('[evaluateQuotesAction] Error:', error);
    return { success: false, error: String(error) };
  }
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

export async function penalizeNoResponseAction(technicianId: string) {
  try {
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
        nInvited: fauchardConfig.nInvited,
        nFloor: fauchardConfig.nFloor,
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

export async function updateFauchardParamsAction(params: Record<string, any>): Promise<ActionResult<{ newVersion: number }>> {
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

      // 1. Validaciones de pesos (α)
      const αKeys = ['alphaQuality', 'alphaPunctuality', 'alphaExperience', 'alphaLoad', 'alphaBonus'];
      let αSum = 0;
      for (const key of αKeys) {
        const val = parseFloat(params[key] ?? current[key as keyof typeof current]);
        if (isNaN(val) || val < 0 || val > 0.5) {
          throw new Error(`Peso ${key} inválido (0.0 - 0.50)`);
        }
        αSum += val;
      }

      if (Math.abs(αSum - 1.0) > 0.001) {
        throw new Error(`La suma de los pesos debe ser exactamente 1.0 (suma actual: ${αSum.toFixed(3)})`);
      }

      // 2. Otras validaciones
      if (params.nInvited !== undefined && (params.nInvited < 3 || params.nInvited > 10)) {
        throw new Error('Técnicos invitados (nInvited) debe estar entre 3 y 10');
      }
      if (params.tQuoteMinutes !== undefined && (params.tQuoteMinutes < 1 || params.tQuoteMinutes > 1440)) {
        throw new Error('Tiempo de cotización (tQuoteMinutes) debe estar entre 1 y 1440 minutos (1 min a 24 h)');
      }
      if (params.tCooldownMinutes !== undefined && (params.tCooldownMinutes < 1 || params.tCooldownMinutes > 1440)) {
        throw new Error('Cooldown invitaciones (tCooldownMinutes) debe estar entre 1 y 1440 minutos (1 min a 24 h)');
      }
      if (params.platformFee !== undefined) {
        const fee = parseFloat(params.platformFee);
        if (isNaN(fee) || fee < 0.05 || fee > 0.50) {
          throw new Error('El margen de plataforma (platformFee) debe estar entre 5% y 50%');
        }
      }

      // 3. Detectar cambios para el log
      const changes: { key: string; old: any; new: any }[] = [];
      const updatedFields: Record<string, any> = {
        updatedBy: identity.adminId ?? identity.id,
        updatedAt: new Date(),
        version: current.version + 1,
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
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  try {
    const now = new Date();
    const startDate = subDays(now, days);
    const config = await getActiveConfig();

    // 1. Invitaciones por técnico
    const invData = await db
      .select({
        technicianId: user.id,
        fullName: user.fullName,
        leagueLevel: user.leagueLevel,
        isAvailable: user.isAvailable,
        lastInvitedAt: user.lastInvitedAt,
        status: caseInvitation.status,
        price: caseInvitation.quotedPrice,
        days: caseInvitation.quotedDays,
      })
      .from(user)
      .leftJoin(caseInvitation, and(eq(user.id, caseInvitation.technicianId), gte(caseInvitation.invitedAt, startDate)))
      .where(eq(user.role, 'tecnico'));

    const techStats: Record<string, any> = {};
    for (const row of invData) {
      if (!techStats[row.technicianId]) {
        techStats[row.technicianId] = {
          technicianId: row.technicianId,
          fullName: row.fullName,
          leagueLevel: row.leagueLevel,
          isAvailable: row.isAvailable,
          invitationsCount: 0,
          quotedCount: 0,
          acceptedCount: 0,
          prices: [],
          deliveryDays: [],
          lastInvitedAt: row.lastInvitedAt,
        };
      }
      if (row.status) {
        techStats[row.technicianId].invitationsCount++;
        if (['quoted', 'accepted', 'confirmed', 'rejected'].includes(row.status)) techStats[row.technicianId].quotedCount++;
        if (['accepted', 'confirmed'].includes(row.status)) techStats[row.technicianId].acceptedCount++;
        if (row.price) techStats[row.technicianId].prices.push(row.price);
        if (row.days) techStats[row.technicianId].deliveryDays.push(row.days);
      }
    }

    const invitationsByTechnician = await Promise.all(Object.values(techStats).map(async (ts: any) => {
      // Calcular score actual para este técnico (usando un work_type genérico para el ranking)
      const { score } = await calculateTechnicianScore(ts.technicianId, 'corona_posterior', SERVICE_TYPES.SOLO_DISENO, config);
      
      return {
        ...ts,
        responseRate: ts.invitationsCount > 0 ? (ts.quotedCount / ts.invitationsCount) : 0,
        winRate: ts.quotedCount > 0 ? (ts.acceptedCount / ts.quotedCount) : 0,
        avgQuotedPrice: ts.prices.length > 0 ? (ts.prices.reduce((a: any, b: any) => a + b, 0) / ts.prices.length) : 0,
        avgDeliveryDays: ts.deliveryDays.length > 0 ? (ts.deliveryDays.reduce((a: any, b: any) => a + b, 0) / ts.deliveryDays.length) : 0,
        currentScore: score,
        daysWithoutInvitation: ts.lastInvitedAt ? Math.floor((now.getTime() - new Date(ts.lastInvitedAt).getTime()) / 86400000) : 999,
      };
    }));

    // 2. Distribución por cuartil (Equidad)
    const sortedByScore = [...invitationsByTechnician].sort((a, b) => b.currentScore - a.currentScore);
    const top25Count = Math.ceil(sortedByScore.length * 0.25);
    const topQuartile = sortedByScore.slice(0, top25Count);
    const totalInvs = invitationsByTechnician.reduce((acc, t) => acc + t.invitationsCount, 0);
    const topInvs = topQuartile.reduce((acc, t) => acc + t.invitationsCount, 0);
    const topQuartileShare = totalInvs > 0 ? (topInvs / totalInvs) : 0;

    // 3. Alertas
    const alerts: any[] = [];
    if (topQuartileShare > 0.60) {
      alerts.push({
        type: 'concentration',
        severity: 'warning',
        message: `Concentración alta: el 25% superior de los técnicos acapara el ${(topQuartileShare * 100).toFixed(0)}% de las invitaciones.`,
      });
    }

    const inactiveAvailable = invitationsByTechnician.filter(t => t.isAvailable && t.invitationsCount === 0 && t.daysWithoutInvitation > 7);
    if (inactiveAvailable.length > 0) {
      alerts.push({
        type: 'inactive_technician',
        severity: 'warning',
        message: `${inactiveAvailable.length} técnicos disponibles no han recibido invitaciones en la última semana.`,
      });
    }

    // 4. Casos fallidos y sus motivos de exclusión
    const failedCasesData = await db
      .select({
        eventId: clinicalCaseEvent.id,
        caseId: clinicalCaseEvent.clinicalCaseId,
        content: clinicalCaseEvent.content,
        payload: clinicalCaseEvent.payload,
        createdAt: clinicalCaseEvent.createdAt,
      })
      .from(clinicalCaseEvent)
      .where(
        and(
          eq(clinicalCaseEvent.action, 'SELECCION_FALLIDA'),
          gte(clinicalCaseEvent.createdAt, startDate)
        )
      )
      .orderBy(desc(clinicalCaseEvent.createdAt));
    const failedCases = failedCasesData.map(c => ({
      eventId: c.eventId,
      caseId: c.caseId,
      reason: c.content || 'Pool vacío o sin cotizaciones',
      details: c.payload,
      createdAt: c.createdAt,
    }));

    if (failedCases.length > 0) {
      alerts.push({
        type: 'empty_pool',
        severity: 'critical',
        message: `Se detectaron ${failedCases.length} casos fallidos por falta de técnicos en el período.`,
      });
    }

    // 5. Tasas globales
    const totalInv = invitationsByTechnician.reduce((a, b) => a + b.invitationsCount, 0);
    const totalQuoted = invitationsByTechnician.reduce((a, b) => a + b.quotedCount, 0);
    const totalAccepted = invitationsByTechnician.reduce((a, b) => a + b.acceptedCount, 0);

    return {
      success: true,
      metrics: {
        invitationsByTechnician,
        topQuartileShare,
        alerts,
        failedCases,
        globalResponseRate: totalInv > 0 ? totalQuoted / totalInv : 0,
        globalAcceptanceRate: totalQuoted > 0 ? totalAccepted / totalQuoted : 0,
      }
    };
  } catch (error) {
    console.error('[getFauchardMetricsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── S7-02: Simular algoritmo de selección (Admin) ───────────────────────────

export async function simulateFauchardAction(params: {
  restorationType: string;
  caseComplexity: string;
  serviceType: string;
  configOverride?: Record<string, any>;
}): Promise<ActionResult<{ simulation: any }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  try {
    const config = await getActiveConfig();
    const finalConfig = { ...config, ...(params.configOverride || {}) };
    const workType = getWorkTypeForCase(params.restorationType);

    const now = new Date();
    const inactivityThreshold = new Date(now.getTime() - finalConfig.dInactivityDays * 86400000);
    const cooldownThreshold = new Date(now.getTime() - finalConfig.tCooldownMinutes * 60000);

    // Pool de candidatos
    const candidates = await db
      .select()
      .from(user)
      .where(and(eq(user.role, 'tecnico'), eq(user.isActive, true)));

    const distribution: any[] = [];
    let eligibleCount = 0;

    for (const tech of candidates) {
      let excluded = false;
      let exclusionReason = '';

      // Filtros duros (simulados)
      if (!tech.isAvailable) { excluded = true; exclusionReason = 'No disponible'; }
      else if (tech.suspendedUntil && new Date(tech.suspendedUntil) > now) { excluded = true; exclusionReason = 'Suspendido'; }
      else if ((tech.consecutiveNoResponse ?? 0) >= 3) { excluded = true; exclusionReason = 'Sin respuesta reiterada'; }
      else if (tech.updatedAt && new Date(tech.updatedAt) < inactivityThreshold) { excluded = true; exclusionReason = 'Inactivo'; }
      
      // Skill check
      const [skill] = await db
        .select()
        .from(technicianSkill)
        .where(and(eq(technicianSkill.userId, tech.id), eq(technicianSkill.workType, workType)))
        .limit(1);
      
      if (!skill || (skill.designLevel === 0)) { excluded = true; exclusionReason = 'Sin habilidad declarada'; }

      // Cooldown check (simulado)
      if (!excluded) {
        const [recentInv] = await db
          .select()
          .from(caseInvitation)
          .innerJoin(clinicalCase, eq(caseInvitation.clinicalCaseId, clinicalCase.id))
          .where(and(eq(caseInvitation.technicianId, tech.id), gt(caseInvitation.invitedAt, cooldownThreshold), eq(clinicalCase.serviceType, params.serviceType)))
          .limit(1);
        if (recentInv) { excluded = true; exclusionReason = 'En cooldown'; }
      }

      const { score, components } = await calculateTechnicianScore(tech.id, workType, params.serviceType, finalConfig as FauchardConfigRow);
      
      if (!excluded) eligibleCount++;

      distribution.push({
        technicianId: tech.id,
        fullName: tech.fullName,
        leagueLevel: tech.leagueLevel,
        score,
        excluded,
        exclusionReason,
        components,
      });
    }

    // Calcular probabilidades para los no excluidos
    const activeDistribution = distribution.filter(d => !d.excluded);
    const totalScore = activeDistribution.reduce((acc, d) => acc + d.score, 0);

    for (const d of distribution) {
      if (d.excluded) {
        d.probability = 0;
      } else {
        d.probability = totalScore > 0 ? (d.score / totalScore) : (activeDistribution.length > 0 ? 1 / activeDistribution.length : 0);
      }
    }

    return {
      success: true,
      simulation: {
        eligiblePool: eligibleCount,
        invitedCount: finalConfig.nInvited,
        distribution: distribution.sort((a, b) => b.score - a.score),
      }
    };
  } catch (error) {
    console.error('[simulateFauchardAction] Error:', error);
    return { success: false, error: String(error) };
  }
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
