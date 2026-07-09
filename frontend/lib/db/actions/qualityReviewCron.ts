'use server';

/**
 * Escalación del SLA de la etapa de Calidad (v5.19). Invocado por el cron
 * `/api/cron/process-availability` (cada hora). Inerte con `QUALITY_GATE_ENABLED` off.
 *
 * Política explícita: **sin auto-acción** (no auto-certifica ni auto-rechaza). Solo
 * notifica al revisor de Calidad:
 *  - Recordatorio cuando queda ≤ 25% del plazo (una vez por entrega).
 *  - Aviso al vencer (una vez por entrega).
 * Idempotencia vía `quality_reminder_sent_at` / `quality_overdue_notified_at`, que
 * `submitReviewAction` reinicia en cada nueva entrega a Calidad.
 */

import { db } from '@/lib/db';
import { clinicalCase, fauchardConfig } from '@/lib/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import { isQualityGateEnabled } from '@/lib/constants/qualityFlags';
import { CASE_STATUSES } from '@/lib/constants/dental';
import { notifyUser } from '../../services/notifications';
import type { ActionResult } from '@/lib/types/actions';

export type QualityReviewEscalationResult = {
  remindersSent: number;
  overdueNotified: number;
  skipped?: boolean;
};

export async function processQualityReviewDeadlinesAction(): Promise<ActionResult<QualityReviewEscalationResult>> {
  if (!(await isQualityGateEnabled())) {
    return { success: true, remindersSent: 0, overdueNotified: 0, skipped: true };
  }

  try {
    const [active] = await db
      .select({ hours: fauchardConfig.tQualityReviewHours })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .limit(1);
    const fallbackHours = active?.hours ?? 24;

    const cases = await db
      .select({
        id: clinicalCase.id,
        caseNumber: clinicalCase.caseNumber,
        reviewerId: clinicalCase.qualityReviewerId,
        submittedAt: clinicalCase.lastQualitySubmittedAt,
        anchoredHours: fauchardConfig.tQualityReviewHours,
        reminderSentAt: clinicalCase.qualityReminderSentAt,
        overdueNotifiedAt: clinicalCase.qualityOverdueNotifiedAt,
      })
      .from(clinicalCase)
      .leftJoin(fauchardConfig, eq(fauchardConfig.id, clinicalCase.fauchardConfigId))
      .where(
        and(
          eq(clinicalCase.status, CASE_STATUSES.EN_REVISION_CALIDAD),
          isNotNull(clinicalCase.lastQualitySubmittedAt),
        ),
      );

    const now = Date.now();
    let remindersSent = 0;
    let overdueNotified = 0;

    for (const c of cases) {
      if (!c.submittedAt || !c.reviewerId) continue;
      const hours = c.anchoredHours ?? fallbackHours;
      const windowMs = hours * 3_600_000;
      const deadlineMs = new Date(c.submittedAt).getTime() + windowMs;
      const remainingMs = deadlineMs - now;

      if (remainingMs <= 0) {
        if (!c.overdueNotifiedAt) {
          await db
            .update(clinicalCase)
            .set({ qualityOverdueNotifiedAt: new Date() })
            .where(eq(clinicalCase.id, c.id));
          await notifyUser(c.reviewerId, 'QUALITY_PLAZO_VENCIDO', { caseId: c.id, caseNumber: c.caseNumber });
          overdueNotified++;
        }
        continue;
      }

      if (remainingMs <= windowMs * 0.25 && !c.reminderSentAt) {
        await db
          .update(clinicalCase)
          .set({ qualityReminderSentAt: new Date() })
          .where(eq(clinicalCase.id, c.id));
        await notifyUser(c.reviewerId, 'QUALITY_PLAZO_POR_VENCER', { caseId: c.id, caseNumber: c.caseNumber });
        remindersSent++;
      }
    }

    return { success: true, remindersSent, overdueNotified };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
