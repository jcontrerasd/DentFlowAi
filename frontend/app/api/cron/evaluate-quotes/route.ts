import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
import { caseInvitation } from '@/lib/db/schema';
import { eq, and, lt, sql } from 'drizzle-orm';
import { checkAndExpireInvitationsAction } from '@/lib/db/actions/fauchard';
import { CASE_STATUSES } from '@/lib/constants/dental';

/**
 * Cron endpoint para expirar invitaciones vencidas y disparar evaluación de cotizaciones.
 * Configurar en Vercel como Cron Job: cada 5 minutos (expresión cron estándar de 5 min).
 *
 * Proteger con CRON_SECRET en las variables de entorno.
 * GET /api/cron/evaluate-quotes
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    const expiredInvitations = await db
      .select({ clinicalCaseId: caseInvitation.clinicalCaseId })
      .from(caseInvitation)
      .where(
        and(eq(caseInvitation.status, 'pending'), lt(caseInvitation.expiresAt, now)),
      );

    const readyEvalRows = (await db.execute(sql`
      SELECT c.id AS clinical_case_id
      FROM clinical_case c
      WHERE c.status = ${CASE_STATUSES.EN_EVALUACION}
        AND EXISTS (SELECT 1 FROM case_invitation ci WHERE ci.clinical_case_id = c.id)
        AND NOT EXISTS (
          SELECT 1 FROM case_invitation ci
          WHERE ci.clinical_case_id = c.id AND ci.status = 'pending'
        )
    `)) as { clinical_case_id: string }[];

    const readyIds = readyEvalRows.map((r) => r.clinical_case_id);

    const caseIds = [
      ...new Set([
        ...expiredInvitations.map((i) => i.clinicalCaseId),
        ...readyIds,
      ]),
    ];

    const results: {
      caseId: string;
      expired: number;
      evaluated: boolean;
      alreadyEvaluated?: boolean;
    }[] = [];

    for (const caseId of caseIds) {
      const result = await checkAndExpireInvitationsAction(caseId);
      results.push({
        caseId,
        expired: result.expired,
        evaluated: result.evaluated,
        alreadyEvaluated: result.evaluateResult?.alreadyEvaluated,
      });
    }

    return NextResponse.json({
      ok: true,
      processedCases: caseIds.length,
      results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[cron/evaluate-quotes] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
