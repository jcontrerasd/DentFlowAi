'use server';

/**
 * Sanción rolling por no-respuesta (v5.0). Reemplaza el modelo binario
 * `user.consecutiveNoResponse >= 3` por timestamps individuales con ventana rolling.
 * Ver Doc Servicio Orquestado/flujo_tiempos.md §2.
 */

import { db } from '@/lib/db';
import { technicianNoResponseEvent, fauchardConfig, caseAssignment, clinicalCase } from '@/lib/db/schema';
import { and, eq, gt, lte, inArray, sql, asc, desc } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { notifyUser } from '../../services/notifications';
import type { ActionResult } from '@/lib/types/actions';

type SanctionConfig = {
  windowDays: number;
  rehabilitationDays: number;
  level1: number;
  level2: number;
  level3: number;
};

/** Lee los parámetros de sanción de la config activa (defaults si no hay fila). */
async function getSanctionConfig(): Promise<SanctionConfig> {
  const [cfg] = await db
    .select({
      windowDays: fauchardConfig.noResponseWindowDays,
      rehabilitationDays: fauchardConfig.noResponseRehabilitationDays,
      level1: fauchardConfig.level1Threshold,
      level2: fauchardConfig.level2Threshold,
      level3: fauchardConfig.level3Threshold,
    })
    .from(fauchardConfig)
    .where(eq(fauchardConfig.isActive, true))
    .limit(1);
  return {
    windowDays: cfg?.windowDays ?? 14,
    rehabilitationDays: cfg?.rehabilitationDays ?? 30,
    level1: cfg?.level1 ?? 1,
    level2: cfg?.level2 ?? 2,
    level3: cfg?.level3 ?? 3,
  };
}

/** Registra una no-respuesta (timeout sin cotizar ni rechazar). */
export async function recordNoResponseEventAction(
  technicianId: string,
  invitationId: string | null,
): Promise<ActionResult<{ eventId: string }>> {
  try {
    const [row] = await db
      .insert(technicianNoResponseEvent)
      .values({ technicianUserId: technicianId, caseAssignmentId: invitationId ?? null, status: 'active', occurredAt: new Date() })
      .returning({ id: technicianNoResponseEvent.id });
    return { success: true, eventId: row.id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Cuenta no-respuestas activas dentro de la ventana rolling. */
export async function getActiveEventsInWindowAction(
  technicianId: string,
  windowDays?: number,
): Promise<number> {
  const days = windowDays ?? (await getSanctionConfig()).windowDays;
  const threshold = new Date(Date.now() - days * 86_400_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(technicianNoResponseEvent)
    .where(
      and(
        eq(technicianNoResponseEvent.technicianUserId, technicianId),
        eq(technicianNoResponseEvent.status, 'active'),
        gt(technicianNoResponseEvent.occurredAt, threshold),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * Marca como `expired_window` los eventos activos que salieron de la ventana.
 * Ejecutado por cron (Fase 6). Retorna cuántos expiró.
 */
export async function expireEventsOutsideWindowAction(windowDays?: number): Promise<ActionResult<{ expired: number }>> {
  try {
    const days = windowDays ?? (await getSanctionConfig()).windowDays;
    const threshold = new Date(Date.now() - days * 86_400_000);
    const expired = await db
      .update(technicianNoResponseEvent)
      .set({ status: 'expired_window' })
      .where(
        and(
          eq(technicianNoResponseEvent.status, 'active'),
          lte(technicianNoResponseEvent.occurredAt, threshold),
        ),
      )
      .returning({ id: technicianNoResponseEvent.id });
    return { success: true, expired: expired.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Perdón admin: marca eventos como `pardoned` (no se borran; salen del cómputo). */
export async function pardonEventsAction(
  technicianId: string,
  adminId: string,
  reason: string,
  eventIds: string[],
): Promise<ActionResult<{ pardoned: number }>> {
  if (!reason?.trim()) return { success: false, error: 'El motivo del perdón es obligatorio' };
  if (!eventIds.length) return { success: false, error: 'No hay eventos para perdonar' };
  try {
    const pardoned = await db
      .update(technicianNoResponseEvent)
      .set({ status: 'pardoned', pardonedByUserId: adminId, pardonedAt: new Date(), pardonReason: reason.trim() })
      .where(
        and(
          eq(technicianNoResponseEvent.technicianUserId, technicianId),
          inArray(technicianNoResponseEvent.id, eventIds),
        ),
      )
      .returning({ id: technicianNoResponseEvent.id });
    return { success: true, pardoned: pardoned.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export type TechnicianLevel = {
  level: 0 | 1 | 2 | 3;
  count: number;
  /** Fecha en que la no-respuesta más antigua en ventana sale del cómputo (null si limpio). */
  nextExitDate: Date | null;
};

/**
 * Nivel actual del técnico según la ventana rolling y los umbrales de la config.
 * N en el score: 0 (nivel 0/1), 0.5 (nivel 2), 1.0 (nivel 3).
 */
export async function computeLevelForTechnicianAction(technicianId: string): Promise<TechnicianLevel> {
  const cfg = await getSanctionConfig();
  const threshold = new Date(Date.now() - cfg.windowDays * 86_400_000);

  const activos = await db
    .select({ occurredAt: technicianNoResponseEvent.occurredAt })
    .from(technicianNoResponseEvent)
    .where(
      and(
        eq(technicianNoResponseEvent.technicianUserId, technicianId),
        eq(technicianNoResponseEvent.status, 'active'),
        gt(technicianNoResponseEvent.occurredAt, threshold),
      ),
    )
    .orderBy(asc(technicianNoResponseEvent.occurredAt));

  const count = activos.length;
  let level: 0 | 1 | 2 | 3 = 0;
  if (count >= cfg.level3) level = 3;
  else if (count >= cfg.level2) level = 2;
  else if (count >= cfg.level1) level = 1;

  const oldest = activos[0]?.occurredAt ?? null;
  const nextExitDate = oldest ? new Date(new Date(oldest).getTime() + cfg.windowDays * 86_400_000) : null;

  return { level, count, nextExitDate };
}

// ─── Admin: reset (perdón) de no-respuestas con auditoría ────────────────────

export type ActiveNoResponseEvent = {
  id: string;
  occurredAt: Date;
  caseNumber: string | null;
};

/** Lista las no-respuestas activas de un técnico (para el modal de reset admin). */
export async function getActiveNoResponseEventsForTechAction(
  technicianId: string,
): Promise<ActionResult<{ events: ActiveNoResponseEvent[] }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') return { success: false, error: 'Solo admin' };
  try {
    const rows = await db
      .select({
        id: technicianNoResponseEvent.id,
        occurredAt: technicianNoResponseEvent.occurredAt,
        caseNumber: clinicalCase.caseNumber,
      })
      .from(technicianNoResponseEvent)
      .leftJoin(caseAssignment, eq(caseAssignment.id, technicianNoResponseEvent.caseAssignmentId))
      .leftJoin(clinicalCase, eq(clinicalCase.id, caseAssignment.clinicalCaseId))
      .where(
        and(
          eq(technicianNoResponseEvent.technicianUserId, technicianId),
          eq(technicianNoResponseEvent.status, 'active'),
        ),
      )
      .orderBy(desc(technicianNoResponseEvent.occurredAt));
    return { success: true, events: rows };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Perdón admin: marca eventos como `pardoned` (auditoría) y notifica al técnico.
 * Wrapper de `pardonEventsAction` con guard de admin + recálculo de nivel + email.
 */
export async function pardonNoResponseEventsAction(
  technicianId: string,
  eventIds: string[],
  reason: string,
): Promise<ActionResult<{ pardoned: number; newLevel: number }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') return { success: false, error: 'Solo admin' };
  const adminId = (identity.adminId ?? identity.id) as string;

  const res = await pardonEventsAction(technicianId, adminId, reason, eventIds);
  if (!res.success) return res;

  const lvl = await computeLevelForTechnicianAction(technicianId);
  await notifyUser(technicianId, 'PERDON_ADMIN', { count: res.pardoned, level: lvl.level });
  return { success: true, pardoned: res.pardoned, newLevel: lvl.level };
}

export type ResponseHistoryItem = {
  id: string;
  occurredAt: Date;
  caseNumber: string | null;
  status: 'active' | 'expired_window' | 'pardoned';
  /** Etiqueta de UI: Activa | Fuera de ventana | Perdonada. */
  windowStatus: 'Activa' | 'Fuera de ventana' | 'Perdonada';
  /** Fecha en que sale de la ventana (solo si Activa). */
  exitDate: Date | null;
  pardonReason: string | null;
};

/**
 * Historial de respuesta del técnico (§2.6.3) — no-respuestas con su estado en la
 * ventana rolling. El técnico ve su propio historial; admin el de cualquiera.
 */
export async function getResponseHistoryAction(
  technicianId: string,
  days = 90,
): Promise<ActionResult<{ items: ResponseHistoryItem[] }>> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };
  const isAdmin = identity.isSystemAdmin || identity.role === 'admin';
  if (!isAdmin && identity.id !== technicianId) return { success: false, error: 'No autorizado' };

  try {
    const cfg = await getSanctionConfig();
    const since = new Date(Date.now() - days * 86_400_000);
    const windowStart = new Date(Date.now() - cfg.windowDays * 86_400_000);

    const rows = await db
      .select({
        id: technicianNoResponseEvent.id,
        occurredAt: technicianNoResponseEvent.occurredAt,
        status: technicianNoResponseEvent.status,
        pardonReason: technicianNoResponseEvent.pardonReason,
        caseNumber: clinicalCase.caseNumber,
      })
      .from(technicianNoResponseEvent)
      .leftJoin(caseAssignment, eq(caseAssignment.id, technicianNoResponseEvent.caseAssignmentId))
      .leftJoin(clinicalCase, eq(clinicalCase.id, caseAssignment.clinicalCaseId))
      .where(
        and(
          eq(technicianNoResponseEvent.technicianUserId, technicianId),
          gt(technicianNoResponseEvent.occurredAt, since),
        ),
      )
      .orderBy(desc(technicianNoResponseEvent.occurredAt));

    const items: ResponseHistoryItem[] = rows.map((r) => {
      const occurred = new Date(r.occurredAt);
      const inWindow = occurred > windowStart;
      let windowStatus: ResponseHistoryItem['windowStatus'];
      let exitDate: Date | null = null;
      if (r.status === 'pardoned') {
        windowStatus = 'Perdonada';
      } else if (r.status === 'active' && inWindow) {
        windowStatus = 'Activa';
        exitDate = new Date(occurred.getTime() + cfg.windowDays * 86_400_000);
      } else {
        windowStatus = 'Fuera de ventana';
      }
      return {
        id: r.id,
        occurredAt: occurred,
        caseNumber: r.caseNumber,
        status: r.status as ResponseHistoryItem['status'],
        windowStatus,
        exitDate,
        pardonReason: r.pardonReason,
      };
    });

    return { success: true, items };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
