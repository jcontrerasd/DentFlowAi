'use server';
import { canActAsTecnico } from "@/lib/auth-helpers";
import { db } from '@/lib/db';
import { technicianSkill, user, caseInvitation } from '@/lib/db/schema';
import { eq, and, or, gt } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { WORK_TYPES } from '@/lib/constants/dental';

export type SkillRow = {
  workType: string;
  designLevel: number;
  fabricationLevel: number;
  effectiveDesignLevel: number | null;
  effectiveFabricationLevel: number | null;
};

export type SkillInput = {
  workType: string;
  designLevel: number;
  fabricationLevel: number;
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
      fabricationLevel: existing?.fabricationLevel ?? 0,
      effectiveDesignLevel: existing?.effectiveDesignLevel ?? null,
      effectiveFabricationLevel: existing?.effectiveFabricationLevel ?? null,
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
    if (s.fabricationLevel < 0 || s.fabricationLevel > 7) {
      return { success: false, error: `Nivel de fabricación inválido para ${s.workType}` };
    }
  }

  const hasMeaningfulSkill = skills.some(
    s => s.designLevel > 0 || s.fabricationLevel > 0,
  );
  if (!hasMeaningfulSkill) {
    return {
      success: false,
      error:
        'Debes declarar al menos un tipo de trabajo con nivel mayor a 0 en diseño (CAD) o fabricación (CAM)',
    };
  }

  try {
    // Upsert usando INSERT ... ON CONFLICT DO UPDATE
    for (const skill of skills) {
      if (skill.designLevel === 0 && skill.fabricationLevel === 0) {
        // Si ambos en 0 → eliminar la fila si existe
        await db.delete(technicianSkill).where(
          and(eq(technicianSkill.userId, identity.id), eq(technicianSkill.workType, skill.workType))
        );
      } else {
        await db.insert(technicianSkill)
          .values({
            userId: identity.id,
            workType: skill.workType,
            designLevel: skill.designLevel,
            fabricationLevel: skill.fabricationLevel,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [technicianSkill.userId, technicianSkill.workType],
            set: {
              designLevel: skill.designLevel,
              fabricationLevel: skill.fabricationLevel,
              updatedAt: new Date(),
            },
          });
      }
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
      const [activeBid] = await db.select({ id: caseInvitation.id })
        .from(caseInvitation)
        .where(and(eq(caseInvitation.technicianId, identity.id), eq(caseInvitation.status, 'confirmed')))
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

    return { success: true, isAvailable: newAvailability };
  } catch (error) {
    console.error('[toggleAvailabilityAction] Error:', error);
    return { success: false, error: 'Error al cambiar disponibilidad', isAvailable: false };
  }
}

// S1-09 — Admin: ver skills de cualquier técnico
export async function getAdminTechnicianSkillsAction(technicianId: string) {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') {
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

// Función auxiliar: verificar si un técnico tiene al menos una habilidad declarada (CAD y/o CAM)
export async function technicianHasSkills(userId: string): Promise<boolean> {
  const [positiveRow] = await db
    .select({ id: technicianSkill.id })
    .from(technicianSkill)
    .where(
      and(
        eq(technicianSkill.userId, userId),
        or(
          gt(technicianSkill.designLevel, 0),
          gt(technicianSkill.fabricationLevel, 0),
        ),
      ),
    )
    .limit(1);

  return !!positiveRow;
}
