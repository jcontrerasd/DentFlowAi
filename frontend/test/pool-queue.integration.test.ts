/**
 * Integración BD — cola pendiente_pool (v5.0, Fase 2/6). Auditoría: cubre el hueco
 * de cobertura de check-in 50% TTL, expiración (re-encole + fallo terminal) y
 * republicación. Requiere RUN_DB_INTEGRATION_TESTS=true. Mockea notifyUser e identidad.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const DOCTOR = 'test-pool-doctor';

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn(async () => ({ success: true })),
  notifyOrganizationDentists: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: vi.fn(async () => ({ id: DOCTOR, role: 'dentista', isSystemAdmin: false })),
}));

import { db } from '@/lib/db';
import { ensureInfrastructure } from '@/lib/db/infrastructure';
import { sql } from 'drizzle-orm';
import {
  processPendingPoolCheckInAction,
  processPendingPoolExpirationAction,
  processPendingPoolReevaluationAction,
  enterPendingPoolAction,
} from '@/lib/db/actions/poolQueue';
import { republicarCaseAction } from '@/lib/db/actions/cases';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

const ORG = '00000000-0000-0000-0000-0000007007aa';
const CASE = '00000000-0000-0000-0000-0000007007bb';

async function getCase() {
  const [c]: any = await db.execute(sql`SELECT status, internal_status, pending_pool_cycle_count, pending_pool_checkin_sent_at, pending_pool_started_at FROM clinical_case WHERE id = ${CASE}`);
  return c;
}

// Coloca el caso en pendiente_pool con un inicio de ciclo arbitrario (horas atrás).
async function seedPooled(startedHoursAgo: number, cycle: number, checkinSent: boolean) {
  const started = new Date(Date.now() - startedHoursAgo * 3_600_000).toISOString();
  await db.execute(sql`UPDATE clinical_case SET status='enEvaluacion', internal_status='pendiente_pool',
    pending_pool_started_at=${started}, pending_pool_cycle_count=${cycle},
    pending_pool_checkin_sent_at=${checkinSent ? new Date().toISOString() : null} WHERE id=${CASE}`);
}

describe.runIf(runIntegration)('cola pendiente_pool (auditoría Fase 2/6)', () => {
  let prevPool: string | undefined;
  let urgencyId: string;

  beforeAll(async () => {
    prevPool = process.env.POOL_PENDIENTE_ENABLED;
    process.env.POOL_PENDIENTE_ENABLED = 'true';
    await ensureInfrastructure(db);
    await db.execute(sql`INSERT INTO organization (id,name,rut,type,is_active) VALUES (${ORG},'Pool Org','rut-pool','clinica',true) ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO "user" (id,email,role,organization_id,is_active) VALUES (${DOCTOR},${DOCTOR+'@t.local'},'dentista',${ORG},true) ON CONFLICT (id) DO NOTHING`);
    const [u]: any = await db.execute(sql`SELECT id FROM urgency_level LIMIT 1`);
    urgencyId = u.id;
    await db.execute(sql`INSERT INTO clinical_case (id,organization_id,doctor_id,internal_name,needs_fabrication,status,urgency_id)
      VALUES (${CASE},${ORG},${DOCTOR},'Pool Case',false,'enEvaluacion',${urgencyId}) ON CONFLICT (id) DO NOTHING`);
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM clinical_case_event WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`DELETE FROM case_invitation WHERE clinical_case_id=${CASE}`);
    await db.execute(sql`DELETE FROM clinical_case WHERE id=${CASE}`);
    await db.execute(sql`DELETE FROM "user" WHERE id=${DOCTOR}`);
    await db.execute(sql`DELETE FROM organization WHERE id=${ORG}`);
    if (prevPool === undefined) delete process.env.POOL_PENDIENTE_ENABLED; else process.env.POOL_PENDIENTE_ENABLED = prevPool;
  });

  it('enterPendingPoolAction incrementa el ciclo', async () => {
    await db.execute(sql`UPDATE clinical_case SET pending_pool_cycle_count=0, internal_status=NULL WHERE id=${CASE}`);
    const r1 = await enterPendingPoolAction(CASE);
    expect(r1.success).toBe(true);
    if (r1.success) expect(r1.cycle).toBe(1);
    const r2 = await enterPendingPoolAction(CASE);
    if (r2.success) expect(r2.cycle).toBe(2);
  });

  it('check-in solo al cruzar el 50% del TTL y es idempotente', async () => {
    // TTL default 24h → 50% = 12h. Antes de 12h: no check-in.
    await seedPooled(6, 1, false);
    const early = await processPendingPoolCheckInAction();
    expect(early.success).toBe(true);
    expect((await getCase()).pending_pool_checkin_sent_at).toBeNull();

    // Pasado el 50%: check-in enviado y marca seteada.
    await seedPooled(13, 1, false);
    const sent = await processPendingPoolCheckInAction();
    expect(sent.success).toBe(true);
    expect((await getCase()).pending_pool_checkin_sent_at).not.toBeNull();

    // Idempotente: segunda corrida no re-notifica (la marca ya está).
    const before = (await getCase()).pending_pool_checkin_sent_at;
    await processPendingPoolCheckInAction();
    expect((await getCase()).pending_pool_checkin_sent_at).toEqual(before);
  });

  it('expiración: re-encola si quedan ciclos, falla a sin_cotizaciones_fallo al agotarlos', async () => {
    // Ciclo 1 vencido (>24h), maxCycles=2 → re-encola (no falla).
    await seedPooled(25, 1, true);
    const requeue = await processPendingPoolExpirationAction();
    expect(requeue.success).toBe(true);
    if (requeue.success) {
      expect(requeue.requeued).toBeGreaterThanOrEqual(1);
      expect(requeue.failed).toBe(0);
    }
    const afterRequeue = await getCase();
    expect(afterRequeue.status).toBe('enEvaluacion');
    expect(afterRequeue.pending_pool_cycle_count).toBe(2);

    // Ciclo 2 vencido, maxCycles=2 → fallo terminal.
    await seedPooled(25, 2, true);
    const fail = await processPendingPoolExpirationAction();
    expect(fail.success).toBe(true);
    if (fail.success) expect(fail.failed).toBeGreaterThanOrEqual(1);
    expect((await getCase()).status).toBe('sin_cotizaciones_fallo');
  });

  it('republicarCaseAction saca el caso de sin_cotizaciones_fallo y resetea el ciclo', async () => {
    await db.execute(sql`UPDATE clinical_case SET status='sin_cotizaciones_fallo', internal_status='no_eligible_pool_timeout', pending_pool_cycle_count=2 WHERE id=${CASE}`);
    const res = await republicarCaseAction(CASE);
    expect(res.success).toBe(true);
    const after = await getCase();
    // Ya no está en el estado terminal de fallo (volvió a evaluación / cola).
    expect(after.status).not.toBe('sin_cotizaciones_fallo');
    const [evt]: any = await db.execute(sql`SELECT count(*)::int AS n FROM clinical_case_event WHERE clinical_case_id=${CASE} AND action='CASO_REPUBLICADO'`);
    expect(evt.n).toBeGreaterThanOrEqual(1);
  });

  it('processPendingPoolReevaluationAction devuelve contadores assigned/stillWaiting', async () => {
    await seedPooled(1, 1, false);
    const res = await processPendingPoolReevaluationAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(typeof res.assigned).toBe('number');
      expect(typeof res.stillWaiting).toBe('number');
      expect(res.assigned + res.stillWaiting).toBeGreaterThanOrEqual(1);
    }
  });
});
