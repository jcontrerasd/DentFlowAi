/**
 * Integración BD — Invariantes de purga v5.0.
 * Requiere RUN_DB_INTEGRATION_TESTS=true y DATABASE_URL (Docker local).
 *
 * NO ejecuta `purgeAllBusinessDataAdmin()` (que borraría TODO el negocio del DB
 * local). En su lugar reproduce la secuencia de borrado relevante de Fase 1 dentro
 * de una transacción que se revierte (ROLLBACK), verificando los invariantes que la
 * migración introduce:
 *   1. technician_no_response_event.case_invitation_id es ON DELETE SET NULL
 *      (borrar invitaciones nunca rompe FK aunque el evento siga vivo).
 *   2. Borrar eventos antes que invitaciones (orden de la action) no deja huérfanos.
 *   3. technician_availability + ambos catálogos de rechazo se preservan (modo never).
 *
 * El action completo se valida en la verificación manual de la fase.
 */
import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

class Rollback extends Error {
  constructor(public captured: Record<string, number>) {
    super('rollback');
  }
}

async function inRolledBackTx(
  fn: (tx: any) => Promise<Record<string, number>>,
): Promise<Record<string, number>> {
  try {
    await db.transaction(async (tx) => {
      const captured = await fn(tx);
      throw new Rollback(captured);
    });
  } catch (e) {
    if (e instanceof Rollback) return e.captured;
    throw e;
  }
  throw new Error('La transacción no se revirtió');
}

describe.runIf(runIntegration)('invariantes de purga v5.0', () => {
  it('SET NULL en case_invitation_id + orden de borrado sin huérfanos + preservación', async () => {
    const captured = await inRolledBackTx(async (tx) => {
      const orgId = '00000000-0000-0000-0000-0000000000aa';
      const techId = 'test-purge-v50-tech';
      const caseId = '00000000-0000-0000-0000-0000000000bb';
      const invId = '00000000-0000-0000-0000-0000000000cc';

      // Urgency seed (NOT NULL en clinical_case).
      const [urg]: any = await tx.execute(sql`SELECT id FROM urgency_level LIMIT 1`);

      await tx.execute(sql`
        INSERT INTO organization (id, name, rut, type, is_active) VALUES (${orgId}, 'Test Purge Org', 'test-purge-rut-50', 'clinica', true)
      `);
      await tx.execute(sql`
        INSERT INTO "user" (id, email, role, organization_id, is_active)
        VALUES (${techId}, ${techId + '@test.local'}, 'tecnico', ${orgId}, true)
      `);
      await tx.execute(sql`
        INSERT INTO clinical_case (id, organization_id, internal_name, needs_fabrication, status, urgency_id)
        VALUES (${caseId}, ${orgId}, 'Test Purge Case', false, 'borrador', ${urg.id})
      `);
      await tx.execute(sql`
        INSERT INTO case_invitation (id, clinical_case_id, technician_id, status)
        VALUES (${invId}, ${caseId}, ${techId}, 'expired')
      `);
      await tx.execute(sql`
        INSERT INTO technician_no_response_event (technician_user_id, case_invitation_id, status)
        VALUES (${techId}, ${invId}, 'active')
      `);
      await tx.execute(sql`
        INSERT INTO technician_availability (user_id) VALUES (${techId})
      `);

      // Invariante 1: borrar SOLO la invitación → el evento sobrevive con FK en NULL.
      // (no usamos savepoints; medimos el efecto de SET NULL borrando la invitación
      //  y comprobando que no hay error y el evento queda con case_invitation_id NULL)
      // Para no interferir con el invariante 2, lo medimos con una invitación aparte.
      const invId2 = '00000000-0000-0000-0000-0000000000dd';
      await tx.execute(sql`
        INSERT INTO case_invitation (id, clinical_case_id, technician_id, status)
        VALUES (${invId2}, ${caseId}, ${techId}, 'expired')
      `);
      await tx.execute(sql`
        INSERT INTO technician_no_response_event (technician_user_id, case_invitation_id, status)
        VALUES (${techId}, ${invId2}, 'active')
      `);
      await tx.execute(sql`DELETE FROM case_invitation WHERE id = ${invId2}`);
      const [setNull]: any = await tx.execute(sql`
        SELECT count(*)::int AS n FROM technician_no_response_event
        WHERE technician_user_id = ${techId} AND case_invitation_id IS NULL
      `);

      // Invariante 2: secuencia de la action — eventos primero, luego invitaciones.
      await tx.execute(sql`DELETE FROM technician_no_response_event WHERE technician_user_id = ${techId}`);
      await tx.execute(sql`DELETE FROM case_invitation WHERE clinical_case_id = ${caseId}`);
      const [orphans]: any = await tx.execute(sql`
        SELECT count(*)::int AS n FROM technician_no_response_event
        WHERE technician_user_id = ${techId}
      `);

      // Invariante 3: availability + catálogos se preservan (la purga no los toca).
      const [avail]: any = await tx.execute(sql`
        SELECT count(*)::int AS n FROM technician_availability WHERE user_id = ${techId}
      `);
      const [indReasons]: any = await tx.execute(sql`SELECT count(*)::int AS n FROM invitation_rejection_reason`);
      const [bulkReasons]: any = await tx.execute(sql`SELECT count(*)::int AS n FROM bulk_rejection_reason`);

      return {
        setNull: setNull.n,
        orphans: orphans.n,
        avail: avail.n,
        indReasons: indReasons.n,
        bulkReasons: bulkReasons.n,
      };
    });

    expect(captured.setNull).toBe(1); // evento sobrevive con FK NULL tras borrar su invitación
    expect(captured.orphans).toBe(0); // tras la secuencia, no quedan eventos
    expect(captured.avail).toBe(1); // disponibilidad preservada
    expect(captured.indReasons).toBe(7); // catálogo individual intacto
    expect(captured.bulkReasons).toBe(5); // catálogo masivo intacto
  });
});
