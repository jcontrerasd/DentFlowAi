'use server';

/**
 * Dashboard de observabilidad del modelo de disponibilidad (v5.0, Fase 3, §11.3).
 * 13 métricas = termómetro (outputs que se leen, no se ajustan). Refresh manual.
 *
 * Las métricas 3/4/12 dependen de historial de eventos que el sistema aún no
 * registra de forma fiable (auto-OFF preventivo, reactivación, respuesta a check-in)
 * → se devuelven con `available: false` en vez de fabricar un número.
 */

import { db } from '@/lib/db';
import { fauchardConfig } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import type { ActionResult } from '@/lib/types/actions';

export type MetricKind = 'pct' | 'num' | 'hours' | 'minutes';
export type ObservabilityMetric = {
  id: number;
  label: string;
  hint: string;
  kind: MetricKind;
  value: number | null;
  available: boolean;
};
export type ObservabilityFunnel = { published: number; proposal: number; accepted: number; completed: number };
export type ObservabilityData = {
  generatedAt: string;
  windowDays: number;
  metrics: ObservabilityMetric[];
  funnel: ObservabilityFunnel;
};

const pct = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null);

export async function getObservabilityMetricsAction(days = 30): Promise<ActionResult<{ data: ObservabilityData }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') return { success: false, error: 'Solo admin' };

  try {
    // postgres-js no acepta Date como parámetro en db.execute(sql) crudo → ISO string.
    const windowStart = new Date(Date.now() - days * 86_400_000).toISOString();
    const [cfg] = await db
      .select({ level2: fauchardConfig.level2Threshold, windowDays: fauchardConfig.noResponseWindowDays })
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .limit(1);
    const level2 = cfg?.level2 ?? 2;
    const sanctionWindow = new Date(Date.now() - (cfg?.windowDays ?? 14) * 86_400_000).toISOString();

    const one = async (q: ReturnType<typeof sql>): Promise<any> => {
      const rows = await db.execute(q);
      return Array.from(rows)[0] ?? {};
    };

    // 1 · % técnicos en Nivel 2 o 3
    const m1 = await one(sql`
      WITH counts AS (
        SELECT technician_user_id, count(*) AS c
        FROM technician_no_response_event
        WHERE status = 'active' AND occurred_at > ${sanctionWindow}
        GROUP BY technician_user_id
      )
      SELECT (SELECT count(*)::int FROM "user" WHERE role = 'tecnico') AS total,
             (SELECT count(*)::int FROM counts WHERE c >= ${level2}) AS at_level
    `);
    // 2 · % invitaciones en no-respuesta
    const m2 = await one(sql`
      SELECT count(*) FILTER (WHERE status = 'expired')::int AS expired, count(*)::int AS total
      FROM case_invitation WHERE invited_at > ${windowStart}
    `);
    // 3 · auto-OFF preventivos → no trackeado (snapshot aproximado de switches OFF)
    // 5 · % casos en pendiente_pool
    const m5 = await one(sql`
      SELECT count(*) FILTER (WHERE internal_status = 'pendiente_pool')::int AS pooled,
             count(*) FILTER (WHERE status = 'enEvaluacion')::int AS active
      FROM clinical_case
    `);
    // 6 · % reemplazos exitosos
    const m6 = await one(sql`
      SELECT count(*) FILTER (WHERE status IN ('quoted','accepted','confirmed'))::int AS ok, count(*)::int AS total
      FROM case_invitation WHERE is_replacement = true AND invited_at > ${windowStart}
    `);
    // 7 · tiempo medio respuesta del dentista (h)
    const m7 = await one(sql`
      SELECT avg(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600.0) AS h
      FROM clinical_case_delivery WHERE reviewed_at IS NOT NULL AND created_at > ${windowStart}
    `);
    // 8 · score promedio al invitar
    const m8 = await one(sql`
      SELECT avg(score_at_invite) AS avg FROM case_invitation
      WHERE score_at_invite IS NOT NULL AND invited_at > ${windowStart}
    `);
    // 9 · % rechazo explícito vs expiradas
    const m9 = await one(sql`
      SELECT count(*) FILTER (WHERE status = 'rejected' AND (rejection_reason_id IS NOT NULL OR bulk_rejection_reason_id IS NOT NULL))::int AS explicit,
             count(*) FILTER (WHERE status = 'expired')::int AS expired
      FROM case_invitation WHERE invited_at > ${windowStart}
    `);
    // 10 · tiempo medio del técnico para cotizar (min)
    const m10 = await one(sql`
      SELECT avg(EXTRACT(EPOCH FROM (responded_at - invited_at)) / 60.0) AS m
      FROM case_invitation WHERE status = 'quoted' AND responded_at IS NOT NULL AND invited_at > ${windowStart}
    `);
    // 11 · cotizaciones promedio por caso publicado
    const m11 = await one(sql`
      SELECT avg(qc) AS avg FROM (
        SELECT ci.clinical_case_id, count(*) FILTER (WHERE ci.status IN ('quoted','accepted','confirmed'))::int AS qc
        FROM case_invitation ci JOIN clinical_case c ON c.id = ci.clinical_case_id
        WHERE c.published_at > ${windowStart}
        GROUP BY ci.clinical_case_id
      ) t
    `);
    // 13 · funnel (flujo v2 solo_diseno)
    const m13 = await one(sql`
      SELECT count(*) FILTER (WHERE published_at IS NOT NULL)::int AS published,
             count(*) FILTER (WHERE assigned_technician_id IS NOT NULL)::int AS proposal,
             count(*) FILTER (WHERE status IN ('enRevision', 'completado') OR completed_at IS NOT NULL)::int AS accepted,
             count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed
      FROM clinical_case WHERE published_at > ${windowStart}
    `);

    const metrics: ObservabilityMetric[] = [
      { id: 1, label: 'Técnicos en Nivel 2 o 3', hint: 'Si > 30%, suavizar αN o subir umbrales', kind: 'pct', value: pct(Number(m1.at_level ?? 0), Number(m1.total ?? 0)), available: true },
      { id: 2, label: 'Asignaciones sin respuesta', hint: 'Si crece: plazo de respuesta corto o sanción mal calibrada', kind: 'pct', value: pct(Number(m2.expired ?? 0), Number(m2.total ?? 0)), available: true },
      { id: 3, label: 'Auto-OFF preventivos', hint: 'Requiere historial de auto-OFF (Fase 6)', kind: 'pct', value: null, available: false },
      { id: 4, label: 'Reactivación < 7d post auto-OFF', hint: 'Requiere historial de auto-OFF (Fase 6)', kind: 'pct', value: null, available: false },
      { id: 5, label: 'Casos en espera de pool', hint: 'Si > 20%: problema de oferta, no de parámetros', kind: 'pct', value: pct(Number(m5.pooled ?? 0), Number(m5.active ?? 0)), available: true },
      { id: 6, label: 'Reemplazos exitosos', hint: 'Si < 20%, ajustar replacementCutoffMinutes', kind: 'pct', value: pct(Number(m6.ok ?? 0), Number(m6.total ?? 0)), available: true },
      { id: 7, label: 'Respuesta media del dentista', hint: 'Si la mayoría < 24h, bajar tDentistReviewHours', kind: 'hours', value: m7.h != null ? Number(m7.h) : null, available: true },
      { id: 8, label: 'Score promedio al asignar', hint: 'Si todo en franja angosta, re-tunear α', kind: 'num', value: m8.avg != null ? Number(m8.avg) : null, available: true },
      { id: 9, label: 'Rechazo explícito vs no-respuesta', hint: 'Si es bajo, el botón "Rechazar" no es visible/claro', kind: 'pct', value: pct(Number(m9.explicit ?? 0), Number(m9.explicit ?? 0) + Number(m9.expired ?? 0)), available: true },
      { id: 10, label: 'Tiempo medio del técnico al responder', hint: 'Muy bajo = sobre-compromiso; muy alto = saturación', kind: 'minutes', value: m10.m != null ? Number(m10.m) : null, available: true },
      { id: 11, label: 'Asignaciones por caso', hint: 'Si la mayoría recibe 1, falta oferta o nInvited bajo', kind: 'num', value: m11.avg != null ? Number(m11.avg) : null, available: true },
      { id: 12, label: 'Check-ins respondidos', hint: 'Requiere tracking de respuesta al check-in (Fase 6)', kind: 'pct', value: null, available: false },
    ];

    const funnel: ObservabilityFunnel = {
      published: Number(m13.published ?? 0),
      proposal: Number(m13.proposal ?? 0),
      accepted: Number(m13.accepted ?? 0),
      completed: Number(m13.completed ?? 0),
    };

    return { success: true, data: { generatedAt: new Date().toISOString(), windowDays: days, metrics, funnel } };
  } catch (error) {
    console.error('[getObservabilityMetricsAction] Error:', error);
    return { success: false, error: String(error) };
  }
}
