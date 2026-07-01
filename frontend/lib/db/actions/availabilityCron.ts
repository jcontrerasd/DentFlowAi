'use server';

/**
 * Mantenimiento periódico del modelo de disponibilidad (v5.0/v5.1, §5 y §7).
 * Invocado por el cron `/api/cron/process-availability` (cada hora). Todo inerte
 * con `AVAILABILITY_MODEL_ENABLED` apagado.
 *
 * Hace tres cosas idempotentes:
 *  1. Expira no-respuestas fuera de la ventana rolling → el nivel cae solo
 *     (computeLevel solo cuenta eventos activos en ventana). Cubre también la
 *     "rehabilitación" (al salir de la ventana, el técnico vuelve a Nivel 0).
 *  2. Auto-OFF preventivo: técnicos con switch global ON e inactivos > N días.
 *     Naturalmente idempotente (al quedar OFF deja de cumplir la condición).
 *  3. Recordatorio de actividad: técnicos ON e inactivos > M días (M < N), una
 *     sola vez por racha de inactividad (`inactivity_reminder_sent_at`).
 */

import { db } from '@/lib/db';
import { technicianAvailability, user } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { isAvailabilityEnabled } from '@/lib/constants/availabilityFlags';
import { getActiveConfig } from './fauchard';
import { expireEventsOutsideWindowAction } from './noResponseEvents';
import { notifyUser } from '../../services/notifications';
import type { ActionResult } from '@/lib/types/actions';

export type AvailabilityMaintenanceResult = {
  windowExpired: number;
  autoOffPreventive: number;
  remindersSent: number;
  skipped?: boolean;
};

export async function processAvailabilityMaintenanceAction(): Promise<ActionResult<AvailabilityMaintenanceResult>> {
  if (!isAvailabilityEnabled()) {
    return { success: true, windowExpired: 0, autoOffPreventive: 0, remindersSent: 0, skipped: true };
  }

  try {
    const config = await getActiveConfig();
    const autoOffThresholdMs = Date.now() - config.inactivityAutoOffDays * 86_400_000;

    // 1) Expirar eventos fuera de ventana.
    const expired = await expireEventsOutsideWindowAction(config.noResponseWindowDays);
    const windowExpired = expired.success ? expired.expired : 0;

    // "Inactivo" = lastLoginAt es null o anterior al umbral. La referencia de
    // actividad del técnico es su último login (coalesce a updated_at de la fila
    // de disponibilidad para no castigar cuentas recién migradas sin login).
    // Se traen todos los técnicos ON e inactivos > reminderThreshold y se decide
    // auto-OFF vs recordatorio en JS (evita comparar un fragmento SQL contra un
    // Date con gte/lt, que postgres-js maneja de forma inconsistente).
    // Umbral en SQL vía NOW() - interval (params enteros): postgres-js no acepta
    // un Date JS como parámetro cuando el operando izquierdo es un fragmento SQL.
    const activityRef = sql<Date>`COALESCE(${user.lastLoginAt}, ${technicianAvailability.updatedAt})`;

    const inactive = await db
      .select({
        userId: technicianAvailability.userId,
        activityAt: activityRef,
        reminderSentAt: technicianAvailability.inactivityReminderSentAt,
      })
      .from(technicianAvailability)
      .innerJoin(user, eq(user.id, technicianAvailability.userId))
      .where(
        and(
          eq(technicianAvailability.levelGlobal, true),
          sql`COALESCE(${user.lastLoginAt}, ${technicianAvailability.updatedAt}) < NOW() - (${config.inactivityReminderDays} * INTERVAL '1 day')`,
        ),
      );

    const autoOffIds: string[] = [];
    const reminderIds: string[] = [];

    for (const row of inactive) {
      const activityMs = row.activityAt ? new Date(row.activityAt).getTime() : 0;
      if (activityMs < autoOffThresholdMs) {
        autoOffIds.push(row.userId);
        continue;
      }
      // Recordatorio una sola vez por racha: sin envío previo o anterior a la
      // última actividad (al reactivarse el técnico, la marca queda "vieja").
      const reminderMs = row.reminderSentAt ? new Date(row.reminderSentAt).getTime() : null;
      if (reminderMs === null || reminderMs < activityMs) {
        reminderIds.push(row.userId);
      }
    }

    // Batch updates + notificaciones en paralelo por grupo
    const now = new Date();
    await Promise.all([
      autoOffIds.length > 0
        ? db.update(technicianAvailability)
            .set({ levelGlobal: false, inactivityReminderSentAt: null, updatedAt: now })
            .where(inArray(technicianAvailability.userId, autoOffIds))
        : Promise.resolve(),
      reminderIds.length > 0
        ? db.update(technicianAvailability)
            .set({ inactivityReminderSentAt: now })
            .where(inArray(technicianAvailability.userId, reminderIds))
        : Promise.resolve(),
      ...autoOffIds.map(id => notifyUser(id, 'AUTO_OFF_PREVENTIVO', { days: config.inactivityAutoOffDays })),
      ...reminderIds.map(id => notifyUser(id, 'RECORDATORIO_ACTIVIDAD', { days: config.inactivityReminderDays })),
    ]);

    return { success: true, windowExpired, autoOffPreventive: autoOffIds.length, remindersSent: reminderIds.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
