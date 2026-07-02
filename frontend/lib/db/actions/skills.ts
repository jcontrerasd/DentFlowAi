'use server';
import { canActAsTecnico } from "@/lib/auth-helpers";
import { db } from '@/lib/db';
import { technicianSkill, user, caseAssignment, technicianAvailability } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { auth } from '@/auth';
import { WORK_TYPES } from '@/lib/constants/dental';
import { ensureTechnicianAvailabilityAction, reconcileLevelCadAfterSkillsAction } from './availability';
import { LEAGUE_ORDER, type League } from '@/lib/league';

/** Deriva la liga inicial de un técnico a partir de sus skills declaradas.
 *  Umbral idéntico al badge "Categoría estimada" de SkillMatrixForm. */
function leagueFromSkills(skills: SkillInput[]): League {
  const levels = skills.map(s => s.designLevel).filter(l => l > 0);
  if (levels.length === 0) return 'bronce';
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  if (avg >= 6) return 'elite';
  if (avg >= 4.5) return 'oro';
  if (avg >= 3) return 'plata';
  return 'bronce';
}

/** Sincroniza la liga del técnico con la liga derivada de sus skills declaradas. */
async function syncLeagueFromSkills(userId: string, skills: SkillInput[]): Promise<void> {
  const league = leagueFromSkills(skills);
  await db.update(user).set({ leagueLevel: league, updatedAt: new Date() }).where(eq(user.id, userId));
}

export type SkillRow = {
  workType: string;
  designLevel: number;
  effectiveDesignLevel: number | null;
};

export type SkillInput = {
  workType: string;
  designLevel: number;
};

// S1-01 — Retorna las skills del técnico autenticado
export async function getMySkillsAction(): Promise<SkillRow[]> {
  const identity = await getServerIdentity();
  if (!identity?.id) return [];
  // Read role from DB — JWT role may be stale during onboarding
  const [dbUser] = await db.select({ role: user.role }).from(user).where(eq(user.id, identity.id)).limit(1);
  if (!dbUser || !canActAsTecnico(dbUser.role)) return [];

  const rows = await db.query.technicianSkill.findMany({
    where: eq(technicianSkill.userId, identity.id),
    orderBy: (ts, { asc }) => [asc(ts.workType)],
  });

  // Rellenar los 15 tipos de trabajo (incluyendo los que aún no declaró, con nivel 0)
  const existingMap = new Map(rows.map(r => [r.workType, r]));

  return WORK_TYPES.map(wt => {
    const existing = existingMap.get(wt);
    return {
      workType: wt,
      designLevel: existing?.designLevel ?? 0,
      effectiveDesignLevel: existing?.effectiveDesignLevel ?? null,
    };
  });
}

// S1-02 — Crea o actualiza las skills del técnico autenticado
export async function updateSkillsAction(skills: SkillInput[]) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };

  // JWT role can be stale during onboarding (role is changed via updateUserAction after sign-in).
  // Always read the current role from DB to avoid false "Solo técnicos" rejections.
  const [dbUser] = await db.select({ role: user.role }).from(user).where(eq(user.id, identity.id)).limit(1);

  if (!dbUser || !canActAsTecnico(dbUser.role)) return { success: false, error: 'Solo técnicos pueden declarar habilidades' };
  // Validaciones
  for (const s of skills) {
    if (s.designLevel < 0 || s.designLevel > 7) {
      return { success: false, error: `Nivel de diseño inválido para ${s.workType}` };
    }
  }

  const hasMeaningfulSkill = skills.some(s => s.designLevel > 0);
  if (!hasMeaningfulSkill) {
    return {
      success: false,
      error: 'Debes declarar al menos un tipo de trabajo con nivel mayor a 0 en diseño (CAD)',
    };
  }

  try {
    // Upsert usando INSERT ... ON CONFLICT DO UPDATE
    for (const skill of skills) {
      if (skill.designLevel === 0) {
        // Si diseño en 0 → eliminar la fila si existe
        await db.delete(technicianSkill).where(
          and(eq(technicianSkill.userId, identity.id), eq(technicianSkill.workType, skill.workType))
        );
      } else {
        await db.insert(technicianSkill)
          .values({
            userId: identity.id,
            workType: skill.workType,
            designLevel: skill.designLevel,
            fabricationLevel: 0,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [technicianSkill.userId, technicianSkill.workType],
            set: {
              designLevel: skill.designLevel,
              fabricationLevel: 0,
              updatedAt: new Date(),
            },
          });
      }
    }

    // Capa 1 (correcto por construcción): garantizar la fila de disponibilidad del
    // técnico apenas declara skills, para que Fauchard nunca lo excluya por falta de
    // fila. Best-effort: un fallo aquí no debe impedir guardar la matriz de habilidades.
    try {
      await ensureTechnicianAvailabilityAction(identity.id);
      await reconcileLevelCadAfterSkillsAction(identity.id);
      await syncLeagueFromSkills(identity.id, skills);
    } catch (availErr) {
      console.error('[updateSkillsAction] No se pudo asegurar disponibilidad/liga:', availErr);
    }

    return { success: true };
  } catch (error) {
    console.error('[updateSkillsAction] Error:', error);
    return { success: false, error: 'Error al guardar las habilidades' };
  }
}

// S1-03 — Alterna la disponibilidad del técnico autenticado
export async function toggleAvailabilityAction() {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado', isAvailable: false };
 
  if (!canActAsTecnico(identity.role)) return { success: false, error: 'Solo técnicos pueden cambiar disponibilidad', isAvailable: false };
  try {
    // Leer estado actual
    const [currentUser] = await db.select({ isAvailable: user.isAvailable, suspendedUntil: user.suspendedUntil })
      .from(user)
      .where(eq(user.id, identity.id))
      .limit(1);

    if (!currentUser) return { success: false, error: 'Usuario no encontrado', isAvailable: false };

    const newAvailability = !currentUser.isAvailable;

    // S8-05: Si está apagando disponibilidad, verificar compromisos activos
    if (!newAvailability) {
      const [activeBid] = await db.select({ id: caseAssignment.id })
        .from(caseAssignment)
        .where(and(eq(caseAssignment.technicianId, identity.id), eq(caseAssignment.status, 'confirmed')))
        .limit(1);
      
      if (activeBid) {
        return { 
          success: false, 
          error: 'No puedes desactivar tu disponibilidad mientras tu oferta esté confirmada y el cliente espere tu inicio de trabajo.',
          isAvailable: true 
        };
      }
    }

    // S8-06: Si estaba suspendido, resetear al cambiar disponibilidad
    const updateData: any = { isAvailable: newAvailability, updatedAt: new Date() };
    if (currentUser.suspendedUntil && new Date(currentUser.suspendedUntil) > new Date()) {
      updateData.suspendedUntil = null;
      updateData.consecutiveNoResponse = 0;
    }

    await db.update(user)
      .set(updateData)
      .where(eq(user.id, identity.id));

    // Espejar al switch global v5.0 (`technician_availability.level_global`) para que el
    // badge del header y el panel de disponibilidad reflejen el mismo estado que este
    // toggle legacy. Best-effort: solo actualiza si la fila existe (la crea el modelo v5.0).
    await db.update(technicianAvailability)
      .set({ levelGlobal: newAvailability, updatedAt: new Date() })
      .where(eq(technicianAvailability.userId, identity.id));

    return { success: true, isAvailable: newAvailability };
  } catch (error) {
    console.error('[toggleAvailabilityAction] Error:', error);
    return { success: false, error: 'Error al cambiar disponibilidad', isAvailable: false };
  }
}

// S1-09 — Admin: ver skills de cualquier técnico
export async function getAdminTechnicianSkillsAction(technicianId: string) {
  const session = await auth();
  const caller = session?.user as any;
  if (caller?.role !== 'admin') {
    return { success: false, error: 'No autorizado', data: null };
  }

  try {
    const [techUser] = await db.select({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      isAvailable: user.isAvailable,
      leagueLevel: user.leagueLevel,
      lastInvitedAt: user.lastInvitedAt,
      suspendedUntil: user.suspendedUntil,
      consecutiveNoResponse: user.consecutiveNoResponse,
    }).from(user).where(eq(user.id, technicianId)).limit(1);

    if (!techUser) return { success: false, error: 'Técnico no encontrado', data: null };

    const skills = await db.query.technicianSkill.findMany({
      where: eq(technicianSkill.userId, technicianId),
      orderBy: (ts, { asc }) => [asc(ts.workType)],
    });

    const existingMap = new Map(skills.map(r => [r.workType, r]));
    const fullSkillMatrix: SkillRow[] = WORK_TYPES.map(wt => {
      const existing = existingMap.get(wt);
      return {
        workType: wt,
        designLevel: existing?.designLevel ?? 0,
        fabricationLevel: existing?.fabricationLevel ?? 0,
        effectiveDesignLevel: existing?.effectiveDesignLevel ?? null,
        effectiveFabricationLevel: existing?.effectiveFabricationLevel ?? null,
      };
    });

    return { success: true, data: { user: techUser, skills: fullSkillMatrix } };
  } catch (error) {
    console.error('[getAdminTechnicianSkillsAction] Error:', error);
    return { success: false, error: 'Error al obtener habilidades', data: null };
  }
}

// S1-10 — Admin: actualizar skills de cualquier técnico
export async function updateTechnicianSkillsAdmin(technicianId: string, skills: SkillInput[]) {
  const session = await auth();
  const caller = session?.user as any;
  if (caller?.role !== 'admin') {
    return { success: false, error: 'No autorizado' };
  }
  try {
    for (const skill of skills) {
      if (skill.designLevel === 0) {
        await db.delete(technicianSkill).where(
          and(eq(technicianSkill.userId, technicianId), eq(technicianSkill.workType, skill.workType))
        );
      } else {
        await db.insert(technicianSkill)
          .values({ userId: technicianId, workType: skill.workType, designLevel: skill.designLevel, fabricationLevel: 0, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: [technicianSkill.userId, technicianSkill.workType],
            set: { designLevel: skill.designLevel, fabricationLevel: 0, updatedAt: new Date() },
          });
      }
    }
    try {
      await ensureTechnicianAvailabilityAction(technicianId);
      await reconcileLevelCadAfterSkillsAction(technicianId);
      await syncLeagueFromSkills(technicianId, skills);
    } catch {}
    return { success: true };
  } catch (error) {
    console.error('[updateTechnicianSkillsAdmin] Error:', error);
    return { success: false, error: 'Error al guardar las habilidades' };
  }
}

