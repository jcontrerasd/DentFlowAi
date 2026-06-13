'use server';

/**
 * Disponibilidad declarada del técnico (v5.0) — modelo de 3 niveles con regla
 * de elegibilidad AND triple. Ver Doc Servicio Orquestado/flujo_tiempos.md §1.
 *
 * Todo el sistema vive detrás de `AVAILABILITY_MODEL_ENABLED`; estas actions son
 * la fuente de verdad del estado, pero Fauchard solo las consulta cuando el flag
 * está on (ver fauchard.ts).
 */

import { db } from '@/lib/db';
import { technicianAvailability, technicianSkill, user, caseInvitation } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { WORK_CATEGORIES, type WorkCategory } from '@/lib/constants/dental';
import { isAvailabilityUiTecnicoEnabled } from '@/lib/constants/availabilityFlags';
import { computeLevelForTechnicianAction, type TechnicianLevel } from './noResponseEvents';
import type { ActionResult } from '@/lib/types/actions';

export type Capacity = 'cad';

export type AvailabilityRow = typeof technicianAvailability.$inferSelect;

/** Columnas de categoría por (categoría, capacidad) para lectura. */
const CATEGORY_COL = {
  coronas: { cad: technicianAvailability.catCoronasCad },
  inlays: { cad: technicianAvailability.catInlaysCad },
  puentes: { cad: technicianAvailability.catPuentesCad },
  protesis: { cad: technicianAvailability.catProtesisCad },
  guias: { cad: technicianAvailability.catGuiasCad },
} as const satisfies Record<WorkCategory, Record<Capacity, unknown>>;

/** Clave del modelo (set key drizzle) por (categoría, capacidad) para escritura. */
const CATEGORY_SET_KEY: Record<WorkCategory, Record<Capacity, keyof AvailabilityRow>> = {
  coronas: { cad: 'catCoronasCad' },
  inlays: { cad: 'catInlaysCad' },
  puentes: { cad: 'catPuentesCad' },
  protesis: { cad: 'catProtesisCad' },
  guias: { cad: 'catGuiasCad' },
};

function capacityColumn(_capacidad: Capacity) {
  return technicianAvailability.levelCad;
}

function categorySetKey(categoria: WorkCategory, capacidad: Capacity): keyof AvailabilityRow {
  return CATEGORY_SET_KEY[categoria][capacidad];
}

/**
 * Crea la fila de disponibilidad de un técnico con la política de migración:
 * global ON; CAD/CAM inferidos desde technician_skill (design/fab > 0); categorías ON.
 */
async function createDefaultAvailability(userId: string): Promise<AvailabilityRow | null> {
  const skills = await db
    .select({ designLevel: technicianSkill.designLevel, fabricationLevel: technicianSkill.fabricationLevel })
    .from(technicianSkill)
    .where(eq(technicianSkill.userId, userId));
  const hasCad = skills.some((s) => (s.designLevel ?? 0) > 0);

  const [row] = await db
    .insert(technicianAvailability)
    .values({ userId, levelGlobal: true, levelCad: hasCad, levelCam: false })
    .onConflictDoNothing({ target: technicianAvailability.userId })
    .returning();

  if (row) return row;
  // Si otro proceso la creó en paralelo, leerla.
  const [existing] = await db.select().from(technicianAvailability).where(eq(technicianAvailability.userId, userId)).limit(1);
  return existing ?? null;
}

/**
 * Retorna la disponibilidad del técnico. Si no existe y el usuario es técnico, la
 * crea con la política de migración.
 */
export async function getAvailabilityForUserAction(userId: string): Promise<ActionResult<{ availability: AvailabilityRow | null }>> {
  try {
    const [existing] = await db.select().from(technicianAvailability).where(eq(technicianAvailability.userId, userId)).limit(1);
    if (existing) return { success: true, availability: existing };

    const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
    if (u?.role !== 'tecnico') return { success: true, availability: null };

    const created = await createDefaultAvailability(userId);
    return { success: true, availability: created };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Garantiza que un técnico tenga su fila de `technician_availability` (la crea con la
 * política de migración si falta). Idempotente y seguro de llamar repetidamente.
 *
 * Se usa en dos capas para que ningún técnico quede excluido por carecer de fila:
 * (1) seed en el ciclo de vida (al guardar skills) y (2) self-heal en Fauchard antes
 * del check de elegibilidad. Delega en `getAvailabilityForUserAction`, que solo crea la
 * fila para usuarios con rol `tecnico`.
 */
export async function ensureTechnicianAvailabilityAction(userId: string): Promise<ActionResult<{ availability: AvailabilityRow | null }>> {
  return getAvailabilityForUserAction(userId);
}

export type AvailabilityTarget =
  | { kind: 'global' }
  | { kind: 'capacity'; capacidad: Capacity }
  | { kind: 'category'; categoria: WorkCategory; capacidad: Capacity };

/**
 * Actualiza un nivel de disponibilidad. El técnico solo edita la suya; admin puede
 * editar la de cualquiera. Cambiar el padre NO propaga a los hijos (§1.5).
 */
export async function updateAvailabilityLevelAction(
  input: { userId: string; target: AvailabilityTarget; value: boolean },
): Promise<ActionResult<{ availability: AvailabilityRow }>> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };
  const isAdmin = identity.role === 'admin' || identity.isSystemAdmin;
  if (!isAdmin && identity.id !== input.userId) {
    return { success: false, error: 'No puedes editar la disponibilidad de otro técnico' };
  }

  try {
    // Asegurar que la fila existe.
    const ensure = await getAvailabilityForUserAction(input.userId);
    if (!ensure.success) return ensure;
    if (!ensure.availability) return { success: false, error: 'El usuario no es técnico' };

    const patch: Partial<Record<keyof AvailabilityRow, boolean | Date>> = { updatedAt: new Date() };
    const { target, value } = input;
    if (target.kind === 'global') patch.levelGlobal = value;
    else if (target.kind === 'capacity') patch.levelCad = value;
    else patch[categorySetKey(target.categoria, target.capacidad)] = value;

    const [row] = await db
      .update(technicianAvailability)
      .set(patch as Record<string, unknown>)
      .where(eq(technicianAvailability.userId, input.userId))
      .returning();

    // Sincronización con el campo legacy `user.is_available`: el switch global v5.0 y
    // el toggle legacy del perfil deben reflejar el mismo estado. Mantenerlos espejados
    // evita que diverjan entre las superficies (badge del header / panel / perfil) y que
    // Fauchard lea estados contradictorios según el flag activo (`AVAILABILITY_MODEL_ENABLED`
    // lee levelGlobal; con el flag off el filtro legacy lee `user.is_available`).
    if (target.kind === 'global') {
      await db
        .update(user)
        .set({ isAvailable: value, updatedAt: new Date() })
        .where(eq(user.id, input.userId));
    }

    // Al encender CUALQUIER nivel del switch (global · capacidad · categoría),
    // dispara la reactivación de casos en cola (event-driven, §5.2: "cualquier
    // nivel de switch"). El técnico puede volverse elegible para un caso en pool
    // al habilitar una capacidad o categoría, no solo el switch global.
    // `triggerPoolReevaluation` re-corre Fauchard (vuelve a chequear el AND triple),
    // así que es seguro/idempotente aunque el técnico siga sin ser elegible.
    // Best-effort: nunca bloquea el toggle.
    if (value === true) {
      try {
        const { triggerPoolReevaluationOnTechnicianOnAction } = await import('./poolQueue');
        await triggerPoolReevaluationOnTechnicianOnAction(input.userId);
      } catch (e) {
        console.warn('[updateAvailabilityLevelAction] reactivación de cola falló:', e);
      }
    }

    return { success: true, availability: row };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Estado de disponibilidad del técnico autenticado para el badge / panel.
 * `enabled` refleja el flag `AVAILABILITY_UI_TECNICO_ENABLED` + rol técnico.
 */
export async function getMyAvailabilityStatusAction(): Promise<ActionResult<{
  enabled: boolean;
  availability: AvailabilityRow | null;
  level: TechnicianLevel;
  pendingCount: number;
}>> {
  const identity = await getServerIdentity();
  const emptyLevel: TechnicianLevel = { level: 0, count: 0, nextExitDate: null };
  if (!identity?.id) return { success: false, error: 'No autenticado' };

  const enabled = isAvailabilityUiTecnicoEnabled() && identity.role === 'tecnico';
  if (!enabled) {
    return { success: true, enabled: false, availability: null, level: emptyLevel, pendingCount: 0 };
  }

  try {
    const ensure = await getAvailabilityForUserAction(identity.id);
    const availability = ensure.success ? ensure.availability : null;
    const level = await computeLevelForTechnicianAction(identity.id);
    const [pending] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(caseInvitation)
      .where(and(eq(caseInvitation.technicianId, identity.id), eq(caseInvitation.status, 'pending')));
    return { success: true, enabled: true, availability, level, pendingCount: Number(pending?.n ?? 0) };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Regla de elegibilidad AND triple — calculada en tiempo real (sin caché del estado
 * efectivo). `elegible = levelGlobal ∧ level<cap> ∧ cat<categoria><cap>`.
 */
export async function computeEligibleAction(
  userId: string,
  categoria: WorkCategory,
  capacidad: Capacity,
): Promise<boolean> {
  const [row] = await db.select().from(technicianAvailability).where(eq(technicianAvailability.userId, userId)).limit(1);
  if (!row) return false;
  const catKey = categorySetKey(categoria, capacidad);
  return Boolean(row.levelGlobal && row.levelCad && row[catKey]);
}

/**
 * Retorna los `userId` de técnicos elegibles para una (categoría, capacidad).
 * Usado por la reactivación de cola y para diagnóstico. Aplica el AND triple en SQL.
 */
export async function getAllEligibleForCategoryCapacityAction(
  categoria: WorkCategory,
  capacidad: Capacity,
): Promise<string[]> {
  if (!WORK_CATEGORIES.includes(categoria)) return [];
  const rows = await db
    .select({ userId: technicianAvailability.userId })
    .from(technicianAvailability)
    .innerJoin(user, eq(user.id, technicianAvailability.userId))
    .where(
      and(
        eq(user.isActive, true),
        eq(user.role, 'tecnico'),
        eq(technicianAvailability.levelGlobal, true),
        eq(capacityColumn(capacidad), true),
        eq(CATEGORY_COL[categoria][capacidad] as never, true),
      ),
    );
  return rows.map((r) => r.userId);
}
