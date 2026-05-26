'use server';
import { db } from '@/lib/db';
import { vitaShade, restorationType, dentalMaterial, urgencyLevel } from '@/lib/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';

const SLUG_RE = /^[a-z0-9_]+$/;

const TABLE_CODE_PREFIX: Record<CatalogTableKey, string> = {
  vita_shade: 'vita',
  restoration_type: 'rest',
  dental_material: 'mat',
  urgency_level: 'urg',
};

export type CatalogOption = {
  id: string;
  /** Identificador opaco system-generated (`mat_001`, `vita_001`, etc.). Estable, no editable. */
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

export type CatalogTableKey = 'vita_shade' | 'restoration_type' | 'dental_material' | 'urgency_level';

const TABLE_MAP = {
  vita_shade: vitaShade,
  restoration_type: restorationType,
  dental_material: dentalMaterial,
  urgency_level: urgencyLevel,
} as const;

function resolveTable(key: CatalogTableKey) {
  const t = TABLE_MAP[key];
  if (!t) throw new Error(`Catálogo desconocido: ${key}`);
  return t;
}

async function listActive(key: CatalogTableKey): Promise<CatalogOption[]> {
  const t = resolveTable(key);
  const rows = await db
    .select({ id: t.id, code: t.code, label: t.label, sortOrder: t.sortOrder, isActive: t.isActive })
    .from(t)
    .where(eq(t.isActive, true))
    .orderBy(asc(t.sortOrder));
  return rows;
}

export async function listVitaShadesAction() {
  return listActive('vita_shade');
}
export async function listRestorationTypesAction() {
  return listActive('restoration_type');
}
export async function listDentalMaterialsAction() {
  return listActive('dental_material');
}
export async function listUrgencyLevelsAction() {
  return listActive('urgency_level');
}

// ─── Admin CRUD ─────────────────────────────────────────────────────────────

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { ok: false, error: 'No autenticado' };
  if (identity.role !== 'admin') return { ok: false, error: 'Solo admin' };
  return { ok: true };
}

export async function listAllCatalogOptionsAction(
  key: CatalogTableKey,
): Promise<ActionResult<CatalogOption[]>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const t = resolveTable(key);
  const rows = await db
    .select({ id: t.id, code: t.code, label: t.label, sortOrder: t.sortOrder, isActive: t.isActive })
    .from(t)
    .orderBy(asc(t.sortOrder));
  return { success: true, data: rows };
}

/**
 * Crea una opción nueva en el catálogo. El admin solo provee `label`; el `code` se
 * genera automáticamente como slug opaco (`mat_NNN`) basado en el sort_order, y
 * `business_key` queda null (la app no lo referencia, solo admin lo agrega como UI).
 */
export async function createCatalogOptionAction(
  key: CatalogTableKey,
  input: { label: string; sortOrder?: number },
): Promise<ActionResult<CatalogOption>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const label = input.label?.trim();
  if (!label) return { success: false, error: 'Etiqueta requerida' };

  const t = resolveTable(key);
  const existing = await db.select({ sortOrder: t.sortOrder, code: t.code }).from(t).orderBy(asc(t.sortOrder));
  const nextOrder = input.sortOrder ?? (existing.length ? existing[existing.length - 1].sortOrder + 1 : 1);

  // Generar code opaco único (mat_NNN) usando el mayor sufijo existente + 1
  const prefix = TABLE_CODE_PREFIX[key];
  let maxN = 0;
  for (const row of existing) {
    const m = row.code.match(new RegExp(`^${prefix}_(\\d+)$`));
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  const code = `${prefix}_${String(maxN + 1).padStart(3, '0')}`;

  try {
    const [row] = await db
      .insert(t)
      .values({ code, label, sortOrder: nextOrder })
      .returning({ id: t.id, code: t.code, label: t.label, sortOrder: t.sortOrder, isActive: t.isActive });
    return { success: true, data: row };
  } catch (e: any) {
    if (String(e?.message ?? e).includes('unique')) {
      return { success: false, error: 'Conflicto al generar código único, reintenta' };
    }
    return { success: false, error: 'Error creando opción' };
  }
}

export async function updateCatalogOptionAction(
  key: CatalogTableKey,
  id: string,
  input: { label?: string; sortOrder?: number },
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const t = resolveTable(key);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.label !== undefined) patch.label = input.label.trim();
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  await db.update(t).set(patch).where(eq(t.id, id));
  return { success: true };
}

export async function setCatalogOptionActiveAction(
  key: CatalogTableKey,
  id: string,
  isActive: boolean,
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const t = resolveTable(key);
  await db.update(t).set({ isActive, updatedAt: new Date() }).where(eq(t.id, id));
  return { success: true };
}

export async function reorderCatalogOptionsAction(
  key: CatalogTableKey,
  orderedIds: string[],
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const t = resolveTable(key);
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(t).set({ sortOrder: i + 1, updatedAt: new Date() }).where(eq(t.id, orderedIds[i]));
    }
  });
  return { success: true };
}
