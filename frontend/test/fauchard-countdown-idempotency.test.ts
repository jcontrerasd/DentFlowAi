/**
 * Integración: countdown 2 (proposalExpiresAt) no debe moverse en doble evaluación.
 * Requiere RUN_DB_INTEGRATION_TESTS=true y DATABASE_URL.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@/lib/db';
import { clinicalCase, caseInvitation, user, fauchardConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  evaluateQuotesAction,
  sendInvitationsAction,
  submitQuoteAction,
  expirePendingInvitationsForCase,
} from '@/lib/db/actions/fauchard';
import { getCaseQuoteDeadlineAt } from '@/lib/db/caseDeadlines';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

describe.runIf(runIntegration)('fauchard countdown idempotency', () => {
  let caseId: string;
  let techId: string;
  let configId: string;

  beforeAll(async () => {
    const [cfg] = await db
      .select()
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .limit(1);
    if (!cfg) throw new Error('No active fauchard config');
    configId = cfg.id;

    const [tech] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'tecnico')).limit(1);
    if (!tech) throw new Error('No technician user');
    techId = tech.id;

    const [c] = await db
      .insert(clinicalCase)
      .values({
        internalName: 'Countdown Test',
        status: 'enEvaluacion',
        serviceType: 'solo_diseno',
        doctorId: (await db.select({ id: user.id }).from(user).where(eq(user.role, 'dentista')).limit(1))[0]?.id,
      } as typeof clinicalCase.$inferInsert)
      .returning({ id: clinicalCase.id });
    caseId = c.id;

    await sendInvitationsAction(caseId, [techId], {
      fauchardConfigId: configId,
      pinCaseToConfig: true,
    });

    const [inv] = await db
      .select()
      .from(caseInvitation)
      .where(eq(caseInvitation.clinicalCaseId, caseId))
      .limit(1);

    if (!inv) throw new Error('No invitation');

    await submitQuoteAction(inv.id, 10000, 3);
  }, 120_000);

  it('getCaseQuoteDeadlineAt returns stable max expires_at', async () => {
    const first = await getCaseQuoteDeadlineAt(caseId);
    await expirePendingInvitationsForCase(caseId);
    const second = await getCaseQuoteDeadlineAt(caseId);
    expect(first).not.toBeNull();
    expect(second?.getTime()).toBe(first?.getTime());
  });

  it('double evaluateQuotes does not reset proposalExpiresAt', async () => {
    const r1 = await evaluateQuotesAction(caseId);
    expect(r1.success).toBe(true);

    const [afterFirst] = await db
      .select({ proposalExpiresAt: clinicalCase.proposalExpiresAt, status: clinicalCase.status })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    expect(afterFirst?.status).toBe('propuestaLista');
    const expiresFirst = afterFirst?.proposalExpiresAt?.getTime();
    expect(expiresFirst).toBeDefined();

    const r2 = await evaluateQuotesAction(caseId);
    expect(r2.success).toBe(true);
    expect((r2 as { alreadyEvaluated?: boolean }).alreadyEvaluated).toBe(true);

    const [afterSecond] = await db
      .select({ proposalExpiresAt: clinicalCase.proposalExpiresAt })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    expect(afterSecond?.proposalExpiresAt?.getTime()).toBe(expiresFirst);
  });
});
