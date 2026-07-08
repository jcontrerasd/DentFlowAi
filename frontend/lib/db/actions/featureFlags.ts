'use server';

/**
 * v5.28 — Administración de feature flags desde el panel admin.
 *
 * Patrón espejo de fauchard.ts (getFauchardConfigAction/updateFauchardParamsAction):
 * guard `isSystemAdmin`, log append-only por cambio (feature_flag_log), no-op si el
 * valor no cambió. Tras escribir invalida el caché local de `lib/featureFlags.ts`
 * (efecto inmediato en esta instancia; ≤30 s en las demás por TTL).
 */

import { db, infraPromise } from '@/lib/db';
import { featureFlag, featureFlagLog, fauchardConfig, user } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { invalidateFlagCache } from '@/lib/featureFlags';
import type { ActionResult } from '@/lib/types/actions';

/** Única lista de keys editables — cualquier otra key se rechaza. */
const EDITABLE_FLAGS = {
  AVAILABILITY_UI_TECNICO_ENABLED: { type: 'boolean' },
  AVAILABILITY_ADMIN_PANEL_ENABLED: { type: 'boolean' },
  REJECTION_INDIVIDUAL_ENABLED: { type: 'boolean' },
  POOL_PENDIENTE_ENABLED: { type: 'boolean' },
  LEAGUE_ENGINE_ENABLED: { type: 'boolean' },
  QUALITY_GATE_ENABLED: { type: 'boolean' },
  EMAIL_VERIFICATION_TTL_MINUTES: { type: 'number', min: 5, max: 1440 },
} as const;

export type EditableFlagKey = keyof typeof EDITABLE_FLAGS;

export type FeatureFlagRow = {
  key: string;
  value: string;
  valueType: string;
  description: string | null;
  updatedAt: Date;
  updatedByName: string | null;
};

export type FeatureFlagLogRow = {
  flagKey: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
  changedByName: string | null;
};

export async function getFeatureFlagsAction(): Promise<ActionResult<{ flags: FeatureFlagRow[] }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  if (infraPromise) await infraPromise;

  try {
    const rows = await db
      .select({
        key: featureFlag.key,
        value: featureFlag.value,
        valueType: featureFlag.valueType,
        description: featureFlag.description,
        updatedAt: featureFlag.updatedAt,
        updatedByName: user.fullName,
      })
      .from(featureFlag)
      .leftJoin(user, eq(user.id, featureFlag.updatedBy))
      .orderBy(featureFlag.key);
    // Solo las keys administrables (por si la tabla acumula keys futuras aún no cableadas).
    const flags = rows.filter((r) => r.key in EDITABLE_FLAGS);
    return { success: true, flags };
  } catch (error) {
    console.error('[getFeatureFlagsAction] Error:', error);
    return { success: false, error: 'No se pudieron cargar los feature flags.' };
  }
}

export async function setFeatureFlagAction(key: string, value: string): Promise<ActionResult<{ persisted: boolean }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  const spec = EDITABLE_FLAGS[key as EditableFlagKey];
  if (!spec) return { success: false, error: `Flag desconocido: ${key}` };

  let normalized: string;
  if (spec.type === 'boolean') {
    if (value !== 'true' && value !== 'false') {
      return { success: false, error: 'Valor inválido: se espera "true" o "false".' };
    }
    normalized = value;
  } else {
    const n = Number(value);
    const { min, max } = spec as { min: number; max: number };
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
      return { success: false, error: `Valor inválido: se espera un entero entre ${min} y ${max}.` };
    }
    normalized = String(n);
  }

  if (infraPromise) await infraPromise;

  try {
    const changedBy = (identity.adminId ?? identity.id) as string;
    const persisted = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: featureFlag.id, value: featureFlag.value })
        .from(featureFlag)
        .where(eq(featureFlag.key, key))
        .limit(1);
      if (!current) throw new Error(`El flag ${key} no existe en la tabla (¿migración v5.28 aplicada?).`);
      if (current.value === normalized) return false;

      await tx
        .update(featureFlag)
        .set({ value: normalized, updatedBy: changedBy, updatedAt: new Date() })
        .where(eq(featureFlag.id, current.id));
      await tx.insert(featureFlagLog).values({
        flagKey: key,
        changedBy,
        oldValue: current.value,
        newValue: normalized,
      });
      return true;
    });

    if (persisted) invalidateFlagCache();
    return { success: true, persisted };
  } catch (error) {
    console.error('[setFeatureFlagAction] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar el flag.' };
  }
}

/** Parámetros de fauchard_config que cada flag deja inertes al apagarse — para el texto de impacto. */
export type FlagImpactConfig = {
  tNoEligiblePoolHours: number;
  maxPoolCycles: number;
  lMinRating: number;
  lCasesEvaluated: number;
  lMinPunctuality: number;
  lCasesCompleted: number;
  lCasesTransition: number;
  lPenaltyTransition: number;
  lDescentRating: number;
  lDescentDays: number;
  tQualityReviewHours: number;
};

export async function getFlagImpactConfigAction(): Promise<ActionResult<{ config: FlagImpactConfig }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  if (infraPromise) await infraPromise;

  try {
    const [row] = await db
      .select({
        tNoEligiblePoolHours: fauchardConfig.tNoEligiblePoolHours,
        maxPoolCycles: fauchardConfig.maxPoolCycles,
        lMinRating: fauchardConfig.lMinRating,
        lCasesEvaluated: fauchardConfig.lCasesEvaluated,
        lMinPunctuality: fauchardConfig.lMinPunctuality,
        lCasesCompleted: fauchardConfig.lCasesCompleted,
        lCasesTransition: fauchardConfig.lCasesTransition,
        lPenaltyTransition: fauchardConfig.lPenaltyTransition,
        lDescentRating: fauchardConfig.lDescentRating,
        lDescentDays: fauchardConfig.lDescentDays,
        tQualityReviewHours: fauchardConfig.tQualityReviewHours,
      })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .limit(1);
    if (!row) return { success: false, error: 'No hay configuración Fauchard activa.' };

    return {
      success: true,
      config: {
        tNoEligiblePoolHours: Number(row.tNoEligiblePoolHours),
        maxPoolCycles: Number(row.maxPoolCycles),
        lMinRating: Number(row.lMinRating),
        lCasesEvaluated: Number(row.lCasesEvaluated),
        lMinPunctuality: Number(row.lMinPunctuality),
        lCasesCompleted: Number(row.lCasesCompleted),
        lCasesTransition: Number(row.lCasesTransition),
        lPenaltyTransition: Number(row.lPenaltyTransition),
        lDescentRating: Number(row.lDescentRating),
        lDescentDays: Number(row.lDescentDays),
        tQualityReviewHours: Number(row.tQualityReviewHours),
      },
    };
  } catch (error) {
    console.error('[getFlagImpactConfigAction] Error:', error);
    return { success: false, error: 'No se pudo cargar la configuración de impacto.' };
  }
}

export async function getFeatureFlagLogAction(limit = 100): Promise<ActionResult<{ logs: FeatureFlagLogRow[] }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin) return { success: false, error: 'No autorizado' };

  if (infraPromise) await infraPromise;

  try {
    const logs = await db
      .select({
        flagKey: featureFlagLog.flagKey,
        oldValue: featureFlagLog.oldValue,
        newValue: featureFlagLog.newValue,
        changedAt: featureFlagLog.changedAt,
        changedByName: user.fullName,
      })
      .from(featureFlagLog)
      .leftJoin(user, eq(user.id, featureFlagLog.changedBy))
      .orderBy(desc(featureFlagLog.changedAt))
      .limit(limit);
    return { success: true, logs };
  } catch (error) {
    console.error('[getFeatureFlagLogAction] Error:', error);
    return { success: false, error: 'No se pudo cargar el historial.' };
  }
}
