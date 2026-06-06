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
import { and, eq, isNotNull } from 'drizzle-orm';
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
    let remindersSent = 0;
    let overdueNotified = 0;

    for (const c of cases) {
      if (!c.submittedAt || !c.doctorId) continue;
      const hours = c.anchoredHours ?? fallbackHours;
      const windowMs = hours * 3_600_000;
      const deadlineMs = new Date(c.submittedAt).getTime() + windowMs;
      const remainingMs = deadlineMs - now;

      if (remainingMs <= 0) {
        // Vencido (una vez por entrega).
        if (!c.overdueNotifiedAt) {
          await db
            .update(clinicalCase)
            .set({ reviewOverdueNotifiedAt: new Date() })
            .where(eq(clinicalCase.id, c.id));
          await notifyUser(c.doctorId, 'REVISION_PLAZO_VENCIDO', { caseId: c.id, caseNumber: c.caseNumber });
          overdueNotified++;
        }
        continue;
      }

      // Recordatorio cuando queda ≤ 25% del plazo (una vez por entrega).
      if (remainingMs <= windowMs * 0.25 && !c.reminderSentAt) {
        await db
          .update(clinicalCase)
          .set({ reviewReminderSentAt: new Date() })
          .where(eq(clinicalCase.id, c.id));
        await notifyUser(c.doctorId, 'REVISION_PLAZO_POR_VENCER', { caseId: c.id, caseNumber: c.caseNumber });
        remindersSent++;
      }
    }

    return { success: true, remindersSent, overdueNotified };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
