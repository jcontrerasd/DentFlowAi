'use server';

/**
 * Escalación del countdown de revisión del dentista (v5.0/v5.2, §4.2). Invocado por
 * el cron `/api/cron/process-availability` (cada hora). Inerte con el flag off.
 *
 * Política explícita: **sin auto-acción** (no auto-aprueba ni auto-rechaza). Solo
 * notifica al dentista:
 *  - Recordatorio cuando queda ≤ 25% del plazo (una vez por entrega).
 *  - Aviso al vencer (una vez por entrega).
 * Idempotencia vía `review_reminder_sent_at` / `review_overdue_notified_at`, que
 * `submitRevisionAction` reinicia en cada nueva entrega.
 */

import { db } from '@/lib/db';
import { clinicalCase, fauchardConfig } from '@/lib/db/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { isAvailabilityEnabled } from '@/lib/constants/availabilityFlags';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { notifyUser } from '../../services/notifications';
import type { ActionResult } from '@/lib/types/actions';

export type DentistReviewEscalationResult = {
  remindersSent: number;
  overdueNotified: number;
  skipped?: boolean;
};

export async function processDentistReviewDeadlinesAction(): Promise<ActionResult<DentistReviewEscalationResult>> {
  if (!isAvailabilityEnabled()) {
    return { success: true, remindersSent: 0, overdueNotified: 0, skipped: true };
  }

  try {
    const [active] = await db
      .select({ hours: fauchardConfig.tDentistReviewHours })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .limit(1);
    const fallbackHours = active?.hours ?? 48;

    const cases = await db
      .select({
        id: clinicalCase.id,
        caseNumber: clinicalCase.caseNumber,
        doctorId: clinicalCase.doctorId,
        submittedAt: clinicalCase.lastRevisionSubmittedAt,
        anchoredHours: fauchardConfig.tDentistReviewHours,
        reminderSentAt: clinicalCase.reviewReminderSentAt,
        overdueNotifiedAt: clinicalCase.reviewOverdueNotifiedAt,
      })
      .from(clinicalCase)
      .leftJoin(fauchardConfig, eq(fauchardConfig.id, clinicalCase.fauchardConfigId))
      .where(
        and(
          eq(clinicalCase.status, CASE_STATUSES.EN_REVISION),
          isNotNull(clinicalCase.lastRevisionSubmittedAt),
        ),
      );

    const now = Date.now();
    const overdueItems: Array<{ id: string; doctorId: string; caseNumber: string | null }> = [];
    const reminderItems: Array<{ id: string; doctorId: string; caseNumber: string | null }> = [];

    for (const c of cases) {
      if (!c.submittedAt || !c.doctorId) continue;
      const hours = c.anchoredHours ?? fallbackHours;
      const windowMs = hours * 3_600_000;
      const deadlineMs = new Date(c.submittedAt).getTime() + windowMs;
      const remainingMs = deadlineMs - now;

      if (remainingMs <= 0 && !c.overdueNotifiedAt) {
        overdueItems.push({ id: c.id, doctorId: c.doctorId, caseNumber: c.caseNumber });
        continue;
      }
      if (remainingMs > 0 && remainingMs <= windowMs * 0.25 && !c.reminderSentAt) {
        reminderItems.push({ id: c.id, doctorId: c.doctorId, caseNumber: c.caseNumber });
      }
    }

    // Batch updates + notificaciones en paralelo por grupo
    const now2 = new Date();
    await Promise.all([
      overdueItems.length > 0
        ? db.update(clinicalCase).set({ reviewOverdueNotifiedAt: now2 }).where(inArray(clinicalCase.id, overdueItems.map(x => x.id)))
        : Promise.resolve(),
      reminderItems.length > 0
        ? db.update(clinicalCase).set({ reviewReminderSentAt: now2 }).where(inArray(clinicalCase.id, reminderItems.map(x => x.id)))
        : Promise.resolve(),
      ...overdueItems.map(x => notifyUser(x.doctorId, 'REVISION_PLAZO_VENCIDO', { caseId: x.id, caseNumber: x.caseNumber })),
      ...reminderItems.map(x => notifyUser(x.doctorId, 'REVISION_PLAZO_POR_VENCER', { caseId: x.id, caseNumber: x.caseNumber })),
    ]);

    return { success: true, remindersSent: reminderItems.length, overdueNotified: overdueItems.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
