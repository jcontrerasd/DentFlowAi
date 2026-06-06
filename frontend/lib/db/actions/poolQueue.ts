'use server';

/**
 * Cola `pendiente_pool` (v5.0, §5). Cuando Fauchard no encuentra técnicos elegibles
 * (escenario A) o una ronda expira sin cotizaciones (escenario C), el caso entra a
 * una cola con TTL + check-in al dentista en vez de fallar de inmediato.
 *
 * El caso permanece en `enEvaluacion` con marca interna `pendiente_pool`. La
 * reactivación es event-driven al encender un técnico (no cron); el cron (Fase 6)
 * gestiona check-in y expiración.
 *
 * Importa Fauchard de forma dinámica para evitar el ciclo (fauchard.ts importa
 * `enterPendingPoolAction` de este módulo).
 */

import { db } from '@/lib/db';
import { clinicalCase, fauchardConfig, user } from '@/lib/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { CASE_STATUSES, INTERNAL_CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { notifyUser } from '../../services/notifications';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import type { ActionResult } from '@/lib/types/actions';

/** Motivo terminal cuando se agotan los ciclos sin atraer técnicos. */
const POOL_FAIL_REASON = 'no_eligible_pool_timeout';

type PoolConfig = { ttlHours: number; maxCycles: number };

async function getPoolConfigForCase(caseId: string): Promise<PoolConfig> {
  const [row] = await db
    .select({
      ttlHours: fauchardConfig.tNoEligiblePoolHours,
      maxCycles: fauchardConfig.maxPoolCycles,
    })
    .from(clinicalCase)
    .leftJoin(fauchardConfig, eq(fauchardConfig.id, clinicalCase.fauchardConfigId))
    .where(eq(clinicalCase.id, caseId))
    .limit(1);
  if (row?.ttlHours != null) return { ttlHours: row.ttlHours, maxCycles: row.maxCycles ?? 2 };
  // Fallback a la config activa.
  const [active] = await db
    .select({ ttlHours: fauchardConfig.tNoEligiblePoolHours, maxCycles: fauchardConfig.maxPoolCycles })
    .from(fauchardConfig)
    .where(eq(fauchardConfig.isActive, true))
    .limit(1);
  return { ttlHours: active?.ttlHours ?? 24, maxCycles: active?.maxCycles ?? 2 };
}

/** Marca el caso como en cola y arranca (o reinicia) el ciclo de espera. */
export async function enterPendingPoolAction(caseId: string): Promise<ActionResult<{ cycle: number }>> {
  try {
    const [row] = await db
      .update(clinicalCase)
      .set({
        internalStatus: POOL_INTERNAL_STATUS,
        pendingPoolStartedAt: new Date(),
        pendingPoolCheckinSentAt: null,
        pendingPoolCycleCount: sql`${clinicalCase.pendingPoolCycleCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(clinicalCase.id, caseId))
      .returning({ cycle: clinicalCase.pendingPoolCycleCount });
    return { success: true, cycle: row?.cycle ?? 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * El dentista (o admin) cancela la publicación mientras el caso espera en la cola
 * pendiente_pool (§5, botón "Cancelar publicación"). Cierra el caso (`cerrado`) y
 * limpia las marcas de pool. Solo válido si el caso está efectivamente en cola.
 */
export async function cancelPendingPoolAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };
  try {
    const [current] = await db
      .select({ status: clinicalCase.status, internalStatus: clinicalCase.internalStatus, doctorId: clinicalCase.doctorId })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);
    if (!current) return { success: false, error: 'Caso no encontrado' };
    const isAdmin = identity.role === 'admin' || identity.isSystemAdmin;
    if (!isAdmin && current.doctorId !== identity.id) return { success: false, error: 'No autorizado' };

    const inPool = current.internalStatus === POOL_INTERNAL_STATUS;
    const failed = current.status === INTERNAL_CASE_STATUSES.SIN_COTIZACIONES_FALLO;
    if (!inPool && !failed) {
      return { success: false, error: 'El caso no está esperando técnicos' };
    }

    await db
      .update(clinicalCase)
      .set({
        status: CASE_STATUSES.CERRADO,
        internalStatus: null,
        pendingPoolStartedAt: null,
        pendingPoolCheckinSentAt: null,
        updatedAt: new Date(),
      })
      .where(eq(clinicalCase.id, caseId));

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: CASE_EVENTS.CASO_CANCELADO,
      content: 'El dentista canceló la publicación mientras se buscaban técnicos.',
      payload: { visibleTo: 'dentista', ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
      stateChange: { from: current.status, to: CASE_STATUSES.CERRADO },
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Envía el check-in al dentista a los casos que cruzaron el 50% del TTL sin aviso. */
export async function processPendingPoolCheckInAction(): Promise<ActionResult<{ notified: number }>> {
  try {
    const cases = await db
      .select({
        id: clinicalCase.id,
        caseNumber: clinicalCase.caseNumber,
        doctorId: clinicalCase.doctorId,
        startedAt: clinicalCase.pendingPoolStartedAt,
      })
      .from(clinicalCase)
      .where(
        and(
          eq(clinicalCase.internalStatus, POOL_INTERNAL_STATUS),
          eq(clinicalCase.status, CASE_STATUSES.EN_EVALUACION),
          sql`${clinicalCase.pendingPoolCheckinSentAt} IS NULL`,
          isNotNull(clinicalCase.pendingPoolStartedAt),
        ),
      );

    let notified = 0;
    const now = Date.now();
    for (const c of cases) {
      const { ttlHours } = await getPoolConfigForCase(c.id);
      const halfMs = (ttlHours * 3_600_000) / 2;
      if (!c.startedAt || now - new Date(c.startedAt).getTime() < halfMs) continue;

      await db.update(clinicalCase).set({ pendingPoolCheckinSentAt: new Date() }).where(eq(clinicalCase.id, c.id));
      if (c.doctorId) {
        await notifyUser(c.doctorId, 'CHECK_IN_DENTISTA', { caseId: c.id, caseNumber: c.caseNumber });
        notified++;
      }
    }
    return { success: true, notified };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Re-encola o falla los casos que cumplieron el TTL del ciclo actual. */
export async function processPendingPoolExpirationAction(): Promise<ActionResult<{ requeued: number; failed: number }>> {
  try {
    const cases = await db
      .select({
        id: clinicalCase.id,
        doctorId: clinicalCase.doctorId,
        startedAt: clinicalCase.pendingPoolStartedAt,
        cycle: clinicalCase.pendingPoolCycleCount,
      })
      .from(clinicalCase)
      .where(
        and(
          eq(clinicalCase.internalStatus, POOL_INTERNAL_STATUS),
          eq(clinicalCase.status, CASE_STATUSES.EN_EVALUACION),
          isNotNull(clinicalCase.pendingPoolStartedAt),
        ),
      );

    let requeued = 0;
    let failed = 0;
    const now = Date.now();
    for (const c of cases) {
      const { ttlHours, maxCycles } = await getPoolConfigForCase(c.id);
      if (!c.startedAt || now - new Date(c.startedAt).getTime() < ttlHours * 3_600_000) continue;

      if ((c.cycle ?? 1) < maxCycles) {
        await enterPendingPoolAction(c.id);
        requeued++;
      } else {
        await db
          .update(clinicalCase)
          .set({
            status: INTERNAL_CASE_STATUSES.SIN_COTIZACIONES_FALLO,
            internalStatus: POOL_FAIL_REASON,
            updatedAt: new Date(),
          })
          .where(eq(clinicalCase.id, c.id));
        if (c.doctorId) await notifyUser(c.doctorId, 'SIN_COTIZACIONES_FALLO', { caseId: c.id });
        failed++;
      }
    }
    return { success: true, requeued, failed };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Reactivación event-driven: al encender un técnico, busca casos en `pendiente_pool`
 * donde ahora es elegible y dispara una nueva ronda Fauchard completa para esos casos.
 */
export async function triggerPoolReevaluationOnTechnicianOnAction(userId: string): Promise<ActionResult<{ reactivated: number }>> {
  try {
    const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
    if (u?.role !== 'tecnico') return { success: true, reactivated: 0 };

    const cases = await db
      .select({ id: clinicalCase.id })
      .from(clinicalCase)
      .where(
        and(
          eq(clinicalCase.internalStatus, POOL_INTERNAL_STATUS),
          eq(clinicalCase.status, CASE_STATUSES.EN_EVALUACION),
        ),
      );
    if (!cases.length) return { success: true, reactivated: 0 };

    // Import dinámico para romper el ciclo con fauchard.ts.
    const fauchard = await import('./fauchard');
    let reactivated = 0;
    for (const c of cases) {
      const eligible = await fauchard.isTechnicianEligibleForCaseAction(c.id, userId);
      if (!eligible) continue;
      // Fauchard re-corre selección completa (el switch es trigger, no invita directo).
      const res = await fauchard.reevaluatePendingPoolCaseAction(c.id);
      if (res.success && res.reactivated) reactivated++;
    }
    return { success: true, reactivated };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
