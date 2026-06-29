'use server';

import { db } from '@/lib/db';
import {
  priceRule,
  priceRuleRequest,
  priceRuleChangeEvent,
  clinicalCase,
  restorationType,
  dentalMaterial,
  vitaShade,
  urgencyLevel,
  user,
} from '@/lib/db/schema';
import { eq, and, asc, desc, count, isNotNull } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import {
  resolveListPriceFromRules,
  computeSalePrice,
  priceRuleSignature,
  type PriceDimensionIds,
  type ResolvedListPrice,
} from '@/lib/pricing/resolveListPrice';
import { validatePriceRuleDimensions } from '@/lib/pricing/priceRuleDimensions';
import {
  buildCreatedFieldEntries,
  diffPriceRuleFields,
  rowToAuditSnapshot,
  validateChangeReason,
  type PriceRuleAuditAction,
  type PriceRuleChangeEntry,
} from '@/lib/pricing/priceRuleAudit';
import { resolveCatalogCodesToIds } from '@/lib/db/catalogResolver';
import { nextPriceRuleCode } from '@/lib/pricing/priceRuleCode';

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

export type PriceRuleDisplay = {
  id: string;
  code: string;
  restorationTypeId: string | null;
  materialId: string | null;
  shadeId: string | null;
  urgencyId: string | null;
  restorationLabel: string | null;
  materialLabel: string | null;
  shadeLabel: string | null;
  urgencyLabel: string | null;
  cost: number;
  feePercent: number;
  salePrice: number;
  sortOrder: number;
  isActive: boolean;
  linkedCaseCount: number;
};

export type PendingPriceRequestDisplay = {
  id: string;
  restorationTypeId: string;
  materialId: string;
  shadeId: string;
  urgencyId: string;
  restorationLabel: string;
  materialLabel: string;
  shadeLabel: string;
  urgencyLabel: string;
  caseId: string;
  caseNumber: string | null;
  createdAt: Date;
};

export type PriceRuleInput = {
  restorationTypeId?: string | null;
  materialId?: string | null;
  shadeId?: string | null;
  urgencyId?: string | null;
  cost: number;
  feePercent: number;
  sortOrder?: number;
};

export type PriceRuleChangeLogEntry = {
  id: string;
  ruleId: string | null;
  action: PriceRuleAuditAction;
  fieldKey: string;
  oldValue: string | null;
  newValue: string | null;
  oldValueLabel: string | null;
  newValueLabel: string | null;
  changeReason: string;
  context: Record<string, unknown>;
  createdAt: Date;
  changedByName: string | null;
};

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { ok: false, error: 'No autenticado' };
  // isSystemAdmin cubre al admin real impersonando a otro usuario (identity.role pasa a ser
  // el rol del simulado) — mismo criterio que contactGuard.ts/observability.ts/noResponseEvents.ts.
  if (identity.role !== 'admin' && !identity.isSystemAdmin) return { ok: false, error: 'Solo admin' };
  return { ok: true };
}

async function getAdminActor(): Promise<
  { ok: true; changedBy: string } | { ok: false; error: string }
> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { ok: false, error: 'No autenticado' };
  // isSystemAdmin cubre al admin real impersonando a otro usuario (identity.role pasa a ser
  // el rol del simulado) — mismo criterio que contactGuard.ts/observability.ts/noResponseEvents.ts.
  if (identity.role !== 'admin' && !identity.isSystemAdmin) return { ok: false, error: 'Solo admin' };
  return { ok: true, changedBy: identity.adminId ?? identity.id };
}

function parseRuleRow(row: typeof priceRule.$inferSelect, linkedCaseCount = 0): PriceRuleDisplay {
  const cost = parseFloat(String(row.cost));
  const feePercent = parseFloat(String(row.feePercent));
  const salePrice = parseFloat(String(row.salePrice));
  return {
    id: row.id,
    code: row.code,
    restorationTypeId: row.restorationTypeId,
    materialId: row.materialId,
    shadeId: row.shadeId,
    urgencyId: row.urgencyId,
    restorationLabel: null,
    materialLabel: null,
    shadeLabel: null,
    urgencyLabel: null,
    cost,
    feePercent,
    salePrice,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    linkedCaseCount,
  };
}

async function loadLinkedCaseCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      ruleId: clinicalCase.listPriceRuleId,
      cnt: count(clinicalCase.id),
    })
    .from(clinicalCase)
    .where(isNotNull(clinicalCase.listPriceRuleId))
    .groupBy(clinicalCase.listPriceRuleId);

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.ruleId) map.set(row.ruleId, Number(row.cnt));
  }
  return map;
}

async function allocatePriceRuleCode(tx?: Tx): Promise<string> {
  const q = tx ?? db;
  const rows = await q.select({ code: priceRule.code }).from(priceRule);
  return nextPriceRuleCode(rows.map((r) => r.code));
}

async function attachLabels(rules: PriceRuleDisplay[]): Promise<PriceRuleDisplay[]> {
  const [rests, mats, shades, urgs] = await Promise.all([
    db.select({ id: restorationType.id, label: restorationType.label }).from(restorationType),
    db.select({ id: dentalMaterial.id, label: dentalMaterial.label }).from(dentalMaterial),
    db.select({ id: vitaShade.id, label: vitaShade.label }).from(vitaShade),
    db.select({ id: urgencyLevel.id, label: urgencyLevel.label }).from(urgencyLevel),
  ]);
  const restMap = new Map(rests.map((r) => [r.id, r.label]));
  const matMap = new Map(mats.map((m) => [m.id, m.label]));
  const shadeMap = new Map(shades.map((s) => [s.id, s.label]));
  const urgMap = new Map(urgs.map((u) => [u.id, u.label]));

  return rules.map((r) => ({
    ...r,
    restorationLabel: r.restorationTypeId ? (restMap.get(r.restorationTypeId) ?? null) : null,
    materialLabel: r.materialId ? (matMap.get(r.materialId) ?? null) : null,
    shadeLabel: r.shadeId ? (shadeMap.get(r.shadeId) ?? null) : null,
    urgencyLabel: r.urgencyId ? (urgMap.get(r.urgencyId) ?? null) : null,
  }));
}

async function findDuplicateActiveRule(
  dims: {
    restorationTypeId?: string | null;
    materialId?: string | null;
    shadeId?: string | null;
    urgencyId?: string | null;
  },
  excludeId?: string,
): Promise<boolean> {
  const sig = priceRuleSignature(dims);
  const rows = await db
    .select()
    .from(priceRule)
    .where(eq(priceRule.isActive, true));

  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    if (priceRuleSignature(row) === sig) return true;
  }
  return false;
}

function validatePriceInput(input: PriceRuleInput): string | null {
  if (!Number.isFinite(input.cost) || input.cost <= 0) {
    return 'El costo debe ser mayor a 0';
  }
  if (!Number.isFinite(input.feePercent) || input.feePercent < 0 || input.feePercent > 0.5) {
    return 'El fee debe estar entre 0% y 50%';
  }
  return null;
}

function validatePriceRuleDimensionsInput(input: PriceRuleInput): string | null {
  const result = validatePriceRuleDimensions({
    restorationTypeId: input.restorationTypeId ?? null,
    urgencyId: input.urgencyId ?? null,
    materialId: input.materialId ?? null,
    shadeId: input.shadeId ?? null,
  });
  return result.ok ? null : result.error;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertPriceRuleChangeEvents(
  tx: Tx,
  params: {
    ruleId: string;
    changedBy: string;
    action: PriceRuleAuditAction;
    entries: PriceRuleChangeEntry[];
    changeReason: string;
    context?: Record<string, unknown>;
  },
): Promise<void> {
  if (params.entries.length === 0) return;
  const trimmedReason = params.changeReason.trim();
  await tx.insert(priceRuleChangeEvent).values(
    params.entries.map((entry) => ({
      ruleId: params.ruleId,
      changedBy: params.changedBy,
      action: params.action,
      fieldKey: entry.fieldKey,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      changeReason: trimmedReason,
      context: params.context ?? {},
      createdAt: new Date(),
    })),
  );
}

async function loadCatalogLabelMaps() {
  const [rests, mats, shades, urgs] = await Promise.all([
    db.select({ id: restorationType.id, label: restorationType.label }).from(restorationType),
    db.select({ id: dentalMaterial.id, label: dentalMaterial.label }).from(dentalMaterial),
    db.select({ id: vitaShade.id, label: vitaShade.label }).from(vitaShade),
    db.select({ id: urgencyLevel.id, label: urgencyLevel.label }).from(urgencyLevel),
  ]);
  return {
    restoration_type_id: new Map(rests.map((r) => [r.id, r.label])),
    material_id: new Map(mats.map((m) => [m.id, m.label])),
    shade_id: new Map(shades.map((s) => [s.id, s.label])),
    urgency_id: new Map(urgs.map((u) => [u.id, u.label])),
  };
}

function resolveAuditValueLabel(
  fieldKey: string,
  value: string | null,
  catalogMaps: Awaited<ReturnType<typeof loadCatalogLabelMaps>>,
): string | null {
  if (value === null) return null;
  if (fieldKey === 'is_active') return value === 'true' ? 'Activa' : 'Bloqueada';
  const map = catalogMaps[fieldKey as keyof typeof catalogMaps];
  if (map) return map.get(value) ?? value;
  if (fieldKey === 'fee_percent') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : value;
  }
  return value;
}

/** Lookup regresivo por IDs de catálogo. */
export async function resolveListPriceByIds(
  dims: PriceDimensionIds,
): Promise<ResolvedListPrice | null> {
  const rows = await db.select().from(priceRule).where(eq(priceRule.isActive, true));
  return resolveListPriceFromRules(rows, dims);
}

/** Lookup para wizard: acepta codes/labels del formulario. */
export async function resolveListPriceAction(input: {
  restorationType?: string;
  material?: string;
  shade?: string;
  urgency?: string;
}): Promise<ActionResult<ResolvedListPrice | null>> {
  try {
    const resolved = await resolveCatalogCodesToIds({ ...input });
    const restorationTypeId = resolved.restorationTypeId as string | undefined;
    const materialId = resolved.materialId as string | undefined;
    const shadeId = resolved.shadeId as string | undefined;
    const urgencyId = resolved.urgencyId as string | undefined;

    if (!restorationTypeId || !materialId || !shadeId || !urgencyId) {
      return { success: true, data: null };
    }

    const result = await resolveListPriceByIds({
      restorationTypeId,
      materialId,
      shadeId,
      urgencyId,
    });
    return { success: true, data: result };
  } catch (e) {
    console.error('[resolveListPriceAction]', e);
    return { success: false, error: e instanceof Error ? e.message : 'Error resolviendo precio' };
  }
}

export async function listPriceRulesAction(): Promise<ActionResult<PriceRuleDisplay[]>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const [rows, linkMap] = await Promise.all([
    db.select().from(priceRule).orderBy(asc(priceRule.sortOrder)),
    loadLinkedCaseCounts(),
  ]);
  const parsed = rows.map((r) => parseRuleRow(r, linkMap.get(r.id) ?? 0));
  const withLabels = await attachLabels(parsed);
  return { success: true, data: withLabels };
}

export async function deletePriceRuleAction(
  id: string,
  changeReason: string,
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const reasonErr = validateChangeReason(changeReason);
  if (reasonErr) return { success: false, error: reasonErr };

  const [existing] = await db.select().from(priceRule).where(eq(priceRule.id, id)).limit(1);
  if (!existing) return { success: false, error: 'Regla no encontrada' };

  const linkMap = await loadLinkedCaseCounts();
  const linked = linkMap.get(id) ?? 0;
  if (linked > 0) {
    return {
      success: false,
      error: `No se puede eliminar: ${linked} caso(s) usan esta regla. Puedes bloquearla.`,
    };
  }

  const actor = await getAdminActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const snapshot = rowToAuditSnapshot(existing);

  try {
    await db.transaction(async (tx) => {
      await insertPriceRuleChangeEvents(tx, {
        ruleId: id,
        changedBy: actor.changedBy,
        action: 'deleted',
        entries: [
          {
            fieldKey: 'code',
            oldValue: existing.code,
            newValue: null,
          },
        ],
        changeReason,
        context: { snapshot, code: existing.code },
      });

      await tx.delete(priceRule).where(eq(priceRule.id, id));
    });

    return { success: true };
  } catch (e) {
    console.error('[deletePriceRuleAction]', e);
    return { success: false, error: e instanceof Error ? e.message : 'Error eliminando regla' };
  }
}

export async function listPriceRuleChangeLogAction(opts?: {
  ruleId?: string;
  limit?: number;
}): Promise<ActionResult<PriceRuleChangeLogEntry[]>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const limit = opts?.limit ?? 100;
  const catalogMaps = await loadCatalogLabelMaps();

  const baseQuery = db
    .select({
      id: priceRuleChangeEvent.id,
      ruleId: priceRuleChangeEvent.ruleId,
      action: priceRuleChangeEvent.action,
      fieldKey: priceRuleChangeEvent.fieldKey,
      oldValue: priceRuleChangeEvent.oldValue,
      newValue: priceRuleChangeEvent.newValue,
      changeReason: priceRuleChangeEvent.changeReason,
      context: priceRuleChangeEvent.context,
      createdAt: priceRuleChangeEvent.createdAt,
      changedByName: user.fullName,
    })
    .from(priceRuleChangeEvent)
    .leftJoin(user, eq(priceRuleChangeEvent.changedBy, user.id))
    .orderBy(desc(priceRuleChangeEvent.createdAt))
    .limit(limit);

  const rows = opts?.ruleId
    ? await baseQuery.where(eq(priceRuleChangeEvent.ruleId, opts.ruleId))
    : await baseQuery;

  const data: PriceRuleChangeLogEntry[] = rows.map((row) => ({
    id: row.id,
    ruleId: row.ruleId,
    action: row.action as PriceRuleAuditAction,
    fieldKey: row.fieldKey,
    oldValue: row.oldValue,
    newValue: row.newValue,
    oldValueLabel: resolveAuditValueLabel(row.fieldKey, row.oldValue, catalogMaps),
    newValueLabel: resolveAuditValueLabel(row.fieldKey, row.newValue, catalogMaps),
    changeReason: row.changeReason,
    context: (row.context ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    changedByName: row.changedByName,
  }));

  return { success: true, data };
}

export async function createPriceRuleAction(
  input: PriceRuleInput,
  changeReason: string,
): Promise<ActionResult<PriceRuleDisplay>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const reasonErr = validateChangeReason(changeReason);
  if (reasonErr) return { success: false, error: reasonErr };

  const err = validatePriceInput(input);
  if (err) return { success: false, error: err };

  const dimErr = validatePriceRuleDimensionsInput(input);
  if (dimErr) return { success: false, error: dimErr };

  if (await findDuplicateActiveRule(input)) {
    return { success: false, error: 'Ya existe una regla activa con la misma combinación de dimensiones' };
  }

  const actor = await getAdminActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const salePrice = computeSalePrice(input.cost, input.feePercent);

  try {
    const row = await db.transaction(async (tx) => {
      const code = await allocatePriceRuleCode(tx);
      const [inserted] = await tx
        .insert(priceRule)
        .values({
          code,
          restorationTypeId: input.restorationTypeId ?? null,
          materialId: input.materialId ?? null,
          shadeId: input.shadeId ?? null,
          urgencyId: input.urgencyId ?? null,
          cost: String(input.cost),
          feePercent: String(input.feePercent),
          salePrice: String(salePrice),
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
          updatedAt: new Date(),
        })
        .returning();

      const snapshot = rowToAuditSnapshot(inserted);
      await insertPriceRuleChangeEvents(tx, {
        ruleId: inserted.id,
        changedBy: actor.changedBy,
        action: 'created',
        entries: buildCreatedFieldEntries(snapshot),
        changeReason,
      });

      return inserted;
    });

    const [display] = await attachLabels([parseRuleRow(row, 0)]);
    return { success: true, data: display };
  } catch (e) {
    console.error('[createPriceRuleAction]', e);
    return { success: false, error: e instanceof Error ? e.message : 'Error creando regla' };
  }
}

export async function updatePriceRuleAction(
  id: string,
  input: PriceRuleInput,
  changeReason: string,
): Promise<ActionResult<PriceRuleDisplay>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const reasonErr = validateChangeReason(changeReason);
  if (reasonErr) return { success: false, error: reasonErr };

  const err = validatePriceInput(input);
  if (err) return { success: false, error: err };

  const dimErr = validatePriceRuleDimensionsInput(input);
  if (dimErr) return { success: false, error: dimErr };

  const [existing] = await db.select().from(priceRule).where(eq(priceRule.id, id)).limit(1);
  if (!existing) return { success: false, error: 'Regla no encontrada' };

  if (input.restorationTypeId !== undefined || input.materialId !== undefined ||
      input.shadeId !== undefined || input.urgencyId !== undefined) {
    const willBeActive = existing.isActive;
    if (willBeActive && await findDuplicateActiveRule(input, id)) {
      return { success: false, error: 'Ya existe una regla activa con la misma combinación de dimensiones' };
    }
  }

  const actor = await getAdminActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const salePrice = computeSalePrice(input.cost, input.feePercent);
  const beforeSnapshot = rowToAuditSnapshot(existing);
  const afterSnapshot = rowToAuditSnapshot({
    restorationTypeId: input.restorationTypeId ?? null,
    materialId: input.materialId ?? null,
    shadeId: input.shadeId ?? null,
    urgencyId: input.urgencyId ?? null,
    cost: String(input.cost),
    feePercent: String(input.feePercent),
    salePrice: String(salePrice),
    isActive: existing.isActive,
    sortOrder: input.sortOrder ?? existing.sortOrder,
  });

  const entries = diffPriceRuleFields(beforeSnapshot, afterSnapshot);
  if (entries.length === 0) {
    return { success: false, error: 'No hay cambios que registrar' };
  }

  try {
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(priceRule)
        .set({
          restorationTypeId: input.restorationTypeId ?? null,
          materialId: input.materialId ?? null,
          shadeId: input.shadeId ?? null,
          urgencyId: input.urgencyId ?? null,
          cost: String(input.cost),
          feePercent: String(input.feePercent),
          salePrice: String(salePrice),
          sortOrder: input.sortOrder ?? existing.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(priceRule.id, id))
        .returning();

      await insertPriceRuleChangeEvents(tx, {
        ruleId: id,
        changedBy: actor.changedBy,
        action: 'updated',
        entries,
        changeReason,
      });

      return updated;
    });

    const [display] = await attachLabels([parseRuleRow(row, 0)]);
    return { success: true, data: display };
  } catch (e) {
    console.error('[updatePriceRuleAction]', e);
    return { success: false, error: e instanceof Error ? e.message : 'Error actualizando regla' };
  }
}

export async function setPriceRuleActiveAction(
  id: string,
  isActive: boolean,
  changeReason: string,
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const reasonErr = validateChangeReason(changeReason);
  if (reasonErr) return { success: false, error: reasonErr };

  const [existing] = await db.select().from(priceRule).where(eq(priceRule.id, id)).limit(1);
  if (!existing) return { success: false, error: 'Regla no encontrada' };

  if (existing.isActive === isActive) {
    return { success: false, error: 'La regla ya está en ese estado' };
  }

  if (isActive) {
    if (await findDuplicateActiveRule(existing, id)) {
      return { success: false, error: 'Ya existe una regla activa con la misma combinación de dimensiones' };
    }
  }

  const actor = await getAdminActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const action: PriceRuleAuditAction = isActive ? 'activated' : 'deactivated';

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(priceRule)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(priceRule.id, id));

      await insertPriceRuleChangeEvents(tx, {
        ruleId: id,
        changedBy: actor.changedBy,
        action,
        entries: [
          {
            fieldKey: 'is_active',
            oldValue: existing.isActive ? 'true' : 'false',
            newValue: isActive ? 'true' : 'false',
          },
        ],
        changeReason,
      });
    });

    return { success: true };
  } catch (e) {
    console.error('[setPriceRuleActiveAction]', e);
    return { success: false, error: e instanceof Error ? e.message : 'Error cambiando estado' };
  }
}

export async function listPendingPriceRequestsAction(): Promise<ActionResult<PendingPriceRequestDisplay[]>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const rows = await db
    .select({
      id: priceRuleRequest.id,
      restorationTypeId: priceRuleRequest.restorationTypeId,
      materialId: priceRuleRequest.materialId,
      shadeId: priceRuleRequest.shadeId,
      urgencyId: priceRuleRequest.urgencyId,
      caseId: priceRuleRequest.caseId,
      createdAt: priceRuleRequest.createdAt,
      caseNumber: clinicalCase.caseNumber,
      restorationLabel: restorationType.label,
      materialLabel: dentalMaterial.label,
      shadeLabel: vitaShade.label,
      urgencyLabel: urgencyLevel.label,
    })
    .from(priceRuleRequest)
    .innerJoin(clinicalCase, eq(priceRuleRequest.caseId, clinicalCase.id))
    .innerJoin(restorationType, eq(priceRuleRequest.restorationTypeId, restorationType.id))
    .innerJoin(dentalMaterial, eq(priceRuleRequest.materialId, dentalMaterial.id))
    .innerJoin(vitaShade, eq(priceRuleRequest.shadeId, vitaShade.id))
    .innerJoin(urgencyLevel, eq(priceRuleRequest.urgencyId, urgencyLevel.id))
    .where(eq(priceRuleRequest.status, 'pending'))
    .orderBy(asc(priceRuleRequest.createdAt));

  return { success: true, data: rows as PendingPriceRequestDisplay[] };
}

export async function resolvePendingPriceRequestAction(
  requestId: string,
  input: { cost: number; feePercent: number },
  changeReason: string,
): Promise<ActionResult<PriceRuleDisplay>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  const reasonErr = validateChangeReason(changeReason);
  if (reasonErr) return { success: false, error: reasonErr };

  const err = validatePriceInput({ ...input, cost: input.cost, feePercent: input.feePercent });
  if (err) return { success: false, error: err };

  const [req] = await db
    .select({
      request: priceRuleRequest,
      caseNumber: clinicalCase.caseNumber,
    })
    .from(priceRuleRequest)
    .innerJoin(clinicalCase, eq(priceRuleRequest.caseId, clinicalCase.id))
    .where(and(eq(priceRuleRequest.id, requestId), eq(priceRuleRequest.status, 'pending')))
    .limit(1);

  if (!req) return { success: false, error: 'Solicitud no encontrada o ya resuelta' };

  const ruleInput: PriceRuleInput = {
    restorationTypeId: req.request.restorationTypeId,
    materialId: req.request.materialId,
    shadeId: req.request.shadeId,
    urgencyId: req.request.urgencyId,
    cost: input.cost,
    feePercent: input.feePercent,
  };

  const dimErr = validatePriceRuleDimensionsInput(ruleInput);
  if (dimErr) return { success: false, error: dimErr };

  if (await findDuplicateActiveRule(ruleInput)) {
    return { success: false, error: 'Ya existe una regla activa con esta combinación' };
  }

  const actor = await getAdminActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const salePrice = computeSalePrice(input.cost, input.feePercent);

  try {
    const row = await db.transaction(async (tx) => {
      const code = await allocatePriceRuleCode(tx);
      const [inserted] = await tx
        .insert(priceRule)
        .values({
          code,
          restorationTypeId: req.request.restorationTypeId,
          materialId: req.request.materialId,
          shadeId: req.request.shadeId,
          urgencyId: req.request.urgencyId,
          cost: String(input.cost),
          feePercent: String(input.feePercent),
          salePrice: String(salePrice),
          isActive: true,
          updatedAt: new Date(),
        })
        .returning();

      await tx
        .update(priceRuleRequest)
        .set({ status: 'resolved', resolvedRuleId: inserted.id })
        .where(eq(priceRuleRequest.id, requestId));

      const snapshot = rowToAuditSnapshot(inserted);
      await insertPriceRuleChangeEvents(tx, {
        ruleId: inserted.id,
        changedBy: actor.changedBy,
        action: 'resolved_from_pending',
        entries: buildCreatedFieldEntries(snapshot),
        changeReason,
        context: {
          requestId,
          caseId: req.request.caseId,
          caseNumber: req.caseNumber,
        },
      });

      return inserted;
    });

    const [display] = await attachLabels([parseRuleRow(row, 0)]);
    return { success: true, data: display };
  } catch (e) {
    console.error('[resolvePendingPriceRequestAction]', e);
    return { success: false, error: e instanceof Error ? e.message : 'Error resolviendo solicitud' };
  }
}

export async function dismissPendingPriceRequestAction(
  requestId: string,
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };

  await db
    .update(priceRuleRequest)
    .set({ status: 'dismissed' })
    .where(and(eq(priceRuleRequest.id, requestId), eq(priceRuleRequest.status, 'pending')));

  return { success: true };
}

/** Encola combinación sin precio (idempotente por firma pending). */
export async function enqueuePriceRuleRequestIfNeeded(
  caseId: string,
  dims: PriceDimensionIds,
): Promise<void> {
  try {
    await db
      .insert(priceRuleRequest)
      .values({
        restorationTypeId: dims.restorationTypeId,
        materialId: dims.materialId,
        shadeId: dims.shadeId,
        urgencyId: dims.urgencyId,
        caseId,
        status: 'pending',
      })
      .onConflictDoNothing({
        target: [
          priceRuleRequest.restorationTypeId,
          priceRuleRequest.materialId,
          priceRuleRequest.shadeId,
          priceRuleRequest.urgencyId,
          priceRuleRequest.status,
        ],
      });
  } catch (e) {
    console.error('[enqueuePriceRuleRequestIfNeeded]', e);
  }
}

/** Helper para snapshot de precio al crear/actualizar caso. */
export async function resolveListPriceSnapshot(dims: PriceDimensionIds): Promise<{
  listPriceRuleId: string | null;
  listPriceCost: string | null;
  listPriceFeePercent: string | null;
  listPriceSale: string | null;
}> {
  const resolved = await resolveListPriceByIds(dims);
  if (!resolved) {
    return {
      listPriceRuleId: null,
      listPriceCost: null,
      listPriceFeePercent: null,
      listPriceSale: null,
    };
  }
  return {
    listPriceRuleId: resolved.ruleId,
    listPriceCost: String(resolved.cost),
    listPriceFeePercent: String(resolved.feePercent),
    listPriceSale: String(resolved.salePrice),
  };
}
