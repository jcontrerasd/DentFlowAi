'use server';

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { user, organization, clinicalCase, bid, file, annotation, review, caseAssignment, clinicalCaseDelivery, clinicalCaseEvent, commercialRound, contactGuardAudit, auditLog, technicianNoResponseEvent } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import * as bcrypt from "bcryptjs";
import GCPStorageService from "@/lib/services/gcp-storage";

/**
 * Middleware de seguridad interno para asegurar que solo un ADMIN opere estas funciones.
 */
async function ensureAdmin() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  const email = session?.user?.email;
  
  // Bypass maestro para Jaime
  const isMaster = email === 'jaime.contreras.d@gmail.com';

  if (!session?.user || (role !== 'admin' && !isMaster)) {
    throw new Error("Acceso denegado: Se requieren privilegios de administrador.");
  }
  return session;
}

/**
 * Lista todos los usuarios del sistema con su organización.
 */
export async function listAllUsersAdmin() {
  await ensureAdmin();
  try {
    const results = await db
      .select({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        onboardingStep: user.onboardingStep,
        organizationName: organization.name,
      })
      .from(user)
      .leftJoin(organization, eq(user.organizationId, organization.id))
      .orderBy(desc(user.createdAt));
    return results;
  } catch (error) {
    console.error("[listAllUsersAdmin] Error:", error);
    return [];
  }
}

/**
 * Bloquea o desbloquea a un usuario.
 */
export async function toggleUserStatusAdmin(userId: string, active: boolean) {
  await ensureAdmin();
  try {
    const [updated] = await db
      .update(user)
      .set({ isActive: active, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning();
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Cambia la contraseña de un usuario (Hasheada).
 */
export async function changeUserPasswordAdmin(userId: string, newPassword: string) {
  await ensureAdmin();
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    await db
      .update(user)
      .set({ hashedPassword, updatedAt: new Date() })
      .where(eq(user.id, userId));
      
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Elimina un usuario por completo, incluyendo sus archivos físicos en el Cloud.
 */
export async function deleteUserAdmin(userId: string) {
  await ensureAdmin();
  try {
    // 0. Protección de acceso: un usuario ADMIN no se puede eliminar.
    //    Evita que el panel quede sin administradores (y con mayor razón si
    //    solo existe uno). El bloqueo es por rol, así que el último admin
    //    nunca es borrable.
    const [target] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!target) {
      return { success: false, error: 'Usuario no encontrado.' };
    }
    if (target.role === 'admin') {
      const [{ count: adminCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, 'admin'));
      return {
        success: false,
        error: adminCount <= 1
          ? 'No se puede eliminar el único usuario administrador del sistema.'
          : 'No se puede eliminar un usuario administrador.',
      };
    }

    // 1. Encontrar todos los archivos subidos por este usuario
    const filesToPurge = await db
      .select({ gcsPath: file.gcsPath })
      .from(file)
      .where(eq(file.uploaderId, userId));
    
    // 2. Borrar físicamente en Google Cloud
    const paths = filesToPurge.map(f => f.gcsPath).filter(Boolean) as string[];
    if (paths.length > 0) {
      await GCPStorageService.deleteFiles(paths);
    }

    // 3. Borrar en la DB (Cascade se encarga del resto)
    await db.delete(user).where(eq(user.id, userId));
    return { success: true };
  } catch (error) {
    console.error("[deleteUserAdmin] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Crea un nuevo co-administrador clonando la organización del creador.
 * Genera nombres auto-secuenciales: Admin001, Admin002...
 */
export async function createCoAdminAction(password: string) {
  const session = await ensureAdmin();
  try {
    // 1. Buscar el último AdminXXX para determinar el siguiente número
    const admins = await db
      .select({ fullName: user.fullName })
      .from(user)
      .where(eq(user.role, 'admin'));
    
    const adminNumbers = admins
      .map(a => {
        const match = a.fullName?.match(/Admin(\d+)/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter(n => n > 0);
    
    const nextNumber = adminNumbers.length > 0 ? Math.max(...adminNumbers) + 1 : 1;
    const nextName = `Admin${String(nextNumber).padStart(3, '0')}`;
    const nextEmail = `${nextName.toLowerCase()}@dentflow.ai`;

    // 2. Obtener data de la organización del creador
    const creator = await db
      .select({ organizationId: user.organizationId })
      .from(user)
      .where(eq(user.id, session.user!.id!))
      .limit(1);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Crear el nuevo Admin
    const [newAdmin] = await db.insert(user).values({
      id: crypto.randomUUID(),
      email: nextEmail,
      fullName: nextName,
      role: 'admin',
      hashedPassword,
      organizationId: creator[0]?.organizationId,
      isActive: true,
      onboardingStep: 100, // Los admins ya nacen completos
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return { success: true, data: { name: nextName, email: nextEmail } };
  } catch (error) {
    console.error("[createCoAdminAction] Error:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Crea un nuevo usuario con rol 'calidad' (revisor de Control de Calidad).
 * A diferencia de createCoAdminAction, permite especificar nombre, email y contraseña
 * porque los revisores de calidad son personas identificables del staff interno.
 */
export async function createCalidadUserAction(input: { fullName: string; email: string; password: string }) {
  await ensureAdmin();
  try {
    const { fullName, email, password } = input;
    if (!fullName?.trim() || !email?.trim() || !password) {
      return { success: false, error: 'Nombre, email y contraseña son obligatorios.' };
    }

    const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email.trim().toLowerCase())).limit(1);
    if (existing.length > 0) {
      return { success: false, error: 'Ya existe un usuario con ese email.' };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Lookup-or-create la org interna "DentFlowAi"
    const [existingOrg] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.name, 'DentFlowAi'))
      .limit(1);

    let dentflowOrgId = existingOrg?.id;
    if (!dentflowOrgId) {
      const [newOrg] = await db.insert(organization).values({
        name: 'DentFlowAi',
        rut: '00.000.000-0',
        type: 'plataforma',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning({ id: organization.id });
      dentflowOrgId = newOrg.id;
    }

    await db.insert(user).values({
      id: crypto.randomUUID(),
      email: email.trim().toLowerCase(),
      fullName: fullName.trim(),
      role: 'calidad',
      hashedPassword,
      isActive: true,
      isAvailable: true,
      onboardingStep: 100,
      organizationId: dentflowOrgId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { success: true, data: { name: fullName.trim(), email: email.trim().toLowerCase() } };
  } catch (error) {
    console.error('[createCalidadUserAction] Error:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Permite al admin actual cambiar su propio rol para simular la experiencia de otros usuarios.
 */
export async function switchMyRoleAdmin(newRole: 'dentista' | 'tecnico' | 'admin' | 'calidad') {
  const session = await auth();
  if (!session?.user?.id) throw new Error("No hay sesión activa");
  
  try {
    const [updated] = await db
      .update(user)
      .set({ 
        role: newRole, 
        onboardingStep: 100, // Forzar completitud para evitar bucles de redirección
        updatedAt: new Date() 
      })
      .where(eq(user.id, session.user.id))
      .returning();
    return { success: true, data: updated };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Lee el perfil completo de un usuario para pre-cargar el modal de edición.
 */
export async function getUserForEditAdmin(userId: string) {
  await ensureAdmin();
  try {
    const [u] = await db
      .select({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        phone: user.phone,
        specialty: user.specialty,
        registrationNumber: user.registrationNumber,
        experienceYears: user.experienceYears,
        bio: user.bio,
        country: user.country,
        region: user.region,
        comuna: user.comuna,
        address: user.address,
        addressNumber: user.addressNumber,
        addressOffice: user.addressOffice,
        isActive: user.isActive,
        isAvailable: user.isAvailable,
        organizationId: user.organizationId,
        organizationName: organization.name,
        organizationRut: organization.rut,
        organizationGiro: organization.giro,
        organizationLegalAddress: organization.legalAddress,
      })
      .from(user)
      .leftJoin(organization, eq(user.organizationId, organization.id))
      .where(eq(user.id, userId))
      .limit(1);

    if (!u) return { success: false as const, error: 'Usuario no encontrado.' };
    return { success: true as const, data: u };
  } catch (error) {
    return { success: false as const, error: (error as Error).message };
  }
}

export async function updateUserOrgAdmin(
  userId: string,
  orgData: { name?: string; giro?: string; legalAddress?: string }
) {
  await ensureAdmin();
  try {
    const [u] = await db.select({ organizationId: user.organizationId }).from(user).where(eq(user.id, userId)).limit(1);
    if (!u?.organizationId) return { success: false as const, error: 'El usuario no tiene organización asignada.' };
    await db.update(organization).set({ ...orgData, updatedAt: new Date() }).where(eq(organization.id, u.organizationId));
    return { success: true as const };
  } catch (error) {
    return { success: false as const, error: (error as Error).message };
  }
}

/**
 * Actualiza el perfil completo de un usuario desde el panel admin.
 * Email y contraseña están explícitamente excluidos — tienen sus propios modales.
 */
export async function updateUserProfileAdmin(
  userId: string,
  data: {
    fullName?: string;
    phone?: string;
    specialty?: string;
    registrationNumber?: string;
    experienceYears?: number | null;
    bio?: string;
    country?: string;
    region?: string;
    comuna?: string;
    address?: string;
    addressNumber?: string;
    addressOffice?: string;
    role?: string;
    isActive?: boolean;
    isAvailable?: boolean;
  }
) {
  await ensureAdmin();
  try {
    if (!userId) return { success: false as const, error: 'userId requerido.' };
    if (data.fullName !== undefined && !data.fullName?.trim()) {
      return { success: false as const, error: 'El nombre no puede estar vacío.' };
    }

    const [updated] = await db
      .update(user)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning();

    if (!updated) return { success: false as const, error: 'Usuario no encontrado.' };
    return { success: true as const, data: updated };
  } catch (error) {
    console.error('[updateUserProfileAdmin] Error:', error);
    return { success: false as const, error: (error as Error).message };
  }
}

export type PurgeStep = {
  key: string;
  label: string;
  count?: number;
  status: 'pending' | 'running' | 'done' | 'skipped';
};

export type PurgeReport = {
  success: boolean;
  error?: string;
  steps: PurgeStep[];
  preserved: { users: number; organizations: number };
};

/**
 * PURGA TOTAL — Borra todos los datos de negocio.
 * Preserva TODOS los usuarios (cualquier rol), organizaciones, skills, auth y config del sistema.
 */
export async function purgeAllBusinessDataAdmin(): Promise<PurgeReport> {
  await ensureAdmin();

  const steps: PurgeStep[] = [];
  const log = (key: string, label: string, count?: number): PurgeStep => {
    const step: PurgeStep = { key, label, count, status: 'done' };
    steps.push(step);
    return step;
  };

  try {
    // 1. Recopilar archivos GCS antes de borrar registros
    const allFiles = await db.select({ gcsPath: file.gcsPath }).from(file);
    const paths = allFiles.map(f => f.gcsPath).filter(Boolean) as string[];

    if (paths.length > 0) {
      await GCPStorageService.deleteFiles(paths);
      log('gcs', 'Archivos GCS eliminados del bucket', paths.length);
    } else {
      steps.push({ key: 'gcs', label: 'Archivos GCS (bucket vacío)', status: 'skipped' });
    }

    // 2. Borrar en orden explícito de dependencias — cada tabla por separado para reporte individual

    // Auditoría de negocio: contact_guard_audit (FK al caso es SET NULL) y audit_log (FK SET NULL).
    // Se borran antes que clinical_case para no dejar filas huérfanas con referencia rota.
    const delContactGuardAudit = await db.delete(contactGuardAudit).returning({ id: contactGuardAudit.id });
    log('contactGuardAudit', 'Auditoría ContactGuard (intentos de bypass)', delContactGuardAudit.length);

    const delAuditLog = await db.delete(auditLog).returning({ id: auditLog.id });
    log('auditLog', 'Audit log de acciones del sistema', delAuditLog.length);

    const delAnnotation = await db.delete(annotation).returning({ id: annotation.id });
    log('annotation', 'Anotaciones', delAnnotation.length);

    // file — FK a clinicalCase es SET NULL (no cascade), requiere borrado explícito
    const delFiles = await db.delete(file).returning({ id: file.id });
    log('file', 'Archivos (registros DB)', delFiles.length);

    const delReviews = await db.delete(review).returning({ id: review.id });
    log('review', 'Reseñas', delReviews.length);

    const delBids = await db.delete(bid).returning({ id: bid.id });
    log('bid', 'Ofertas / cotizaciones', delBids.length);

    // Tablas hijas de clinicalCase — borrar explícito antes que el padre para obtener conteos
    const delEvents = await db.delete(clinicalCaseEvent).returning({ id: clinicalCaseEvent.id });
    log('clinicalCaseEvent', 'Eventos de caso (UCH)', delEvents.length);

    const delDeliveries = await db.delete(clinicalCaseDelivery).returning({ id: clinicalCaseDelivery.id });
    log('clinicalCaseDelivery', 'Entregas de trabajo', delDeliveries.length);

    // v5.0: eventos de no-respuesta (sanción rolling). Borrar antes de caseAssignment:
    // su FK case_invitation_id es SET NULL, pero la purga limpia el historial completo.
    // technician_availability NO se toca (declaración personal del técnico, modo never).
    const delNoResponseEvents = await db.delete(technicianNoResponseEvent).returning({ id: technicianNoResponseEvent.id });
    log('technicianNoResponseEvent', 'Eventos de no-respuesta (sanción rolling)', delNoResponseEvents.length);

    const delInvitations = await db.delete(caseAssignment).returning({ id: caseAssignment.id });
    log('caseAssignment', 'Invitaciones a técnicos', delInvitations.length);

    const delRounds = await db.delete(commercialRound).returning({ id: commercialRound.id });
    log('commercialRound', 'Rondas comerciales', delRounds.length);

    const delCases = await db.delete(clinicalCase).returning({ id: clinicalCase.id });
    log('clinicalCase', 'Casos clínicos', delCases.length);

    // 3. Reset de estado operacional Fauchard en técnicos (no toca perfil ni leagueLevel).
    // Estos contadores son derivados del negocio; sin reset, técnicos con consecutiveNoResponse
    // ≥ 3 quedan excluidos de futuras invitaciones aunque el historial ya esté purgado.
    const resetTechs = await db
      .update(user)
      .set({
        consecutiveNoResponse: 0,
        suspendedUntil: null,
        lastInvitedAt: null,
        leagueTransitionCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(user.role, 'tecnico'))
      .returning({ id: user.id });
    log('userFauchardReset', 'Técnicos: reset de contadores Fauchard', resetTechs.length);

    // 4. Contar lo que se preservó
    const [preservedUsers] = await db.select({ count: sql<number>`count(*)::int` }).from(user);
    const [preservedOrgs] = await db.select({ count: sql<number>`count(*)::int` }).from(organization);

    return {
      success: true,
      steps,
      preserved: {
        users: preservedUsers.count,
        organizations: preservedOrgs.count,
      },
    };
  } catch (error) {
    console.error("[purgeAllBusinessDataAdmin] Error:", error);
    return {
      success: false,
      error: (error as Error).message,
      steps,
      preserved: { users: 0, organizations: 0 },
    };
  }
}
