'use server';

import { db } from '@/lib/db';
import {
  clinicalCase,
  clinicalCaseEvent,
  caseAssignment,
  clinicalCaseHubRead,
} from '@/lib/db/schema';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { perfLog, perfStart } from '@/lib/perfLog';
import { filterCaseEventsForUchViewer } from '@/lib/caseEventsUchFilter';
import { totalUchHubUnread, type UchUnreadEvent } from '@/lib/uchUnread';
import { canActAsTecnico } from '@/lib/auth-helpers';
import {
  archiveVisibilityForUser,
  getArchivedCaseIdsForUser,
} from '@/lib/db/caseUserArchiveHelpers';
import { userCanAccessClinicalCase } from '@/lib/db/caseListVisibility';
import {
  responsibilityAttentionBump,
  isHubInboxSuppressedForCompletedCase,
} from '@/lib/caseResponsibilityAttention';

const HUB_UNREAD_EVENTS_CAP = 14_000;
const HUB_UNREAD_BATCH_MAX_CASES = 80;
const HUB_UNREAD_TOTAL_CASE_SCAN = 120;

type Identity = NonNullable<Awaited<ReturnType<typeof getServerIdentity>>>;
type EventRow = typeof clinicalCaseEvent.$inferSelect;

async function userHasCaseHubAccess(
  identity: Identity,
  caseId: string,
  caseRow: {
    organizationId: string | null;
    assignedTechnicianId: string | null;
    doctorId: string | null;
    status: string;
  },
): Promise<boolean> {
  const { orgId, isSystemAdmin } = identity as { orgId?: string | null; isSystemAdmin?: boolean };
  return userCanAccessClinicalCase(
    {
      id: identity.id as string,
      role: identity.role as string,
      orgId: orgId ?? null,
      isSystemAdmin,
    },
    caseId,
    caseRow,
  );
}

export async function getCaseHubReadStateAction(caseId: string): Promise<{
  lastReadTechHubAt: string | null;
  lastReadNegHubAt: string | null;
} | null> {
  const t0 = perfStart();
  const identity = await getServerIdentity();
  if (!identity?.id) return null;

  const [row] = await db
    .select({
      organizationId: clinicalCase.organizationId,
      assignedTechnicianId: clinicalCase.assignedTechnicianId,
      doctorId: clinicalCase.doctorId,
      status: clinicalCase.status,
    })
    .from(clinicalCase)
    .where(eq(clinicalCase.id, caseId))
    .limit(1);

  if (!row) return null;
  const ok = await userHasCaseHubAccess(identity, caseId, row);
  if (!ok) return null;

  const [read] = await db
    .select({
      lastReadTechHubAt: clinicalCaseHubRead.lastReadTechHubAt,
      lastReadNegHubAt: clinicalCaseHubRead.lastReadNegHubAt,
    })
    .from(clinicalCaseHubRead)
    .where(
      and(eq(clinicalCaseHubRead.userId, identity.id as string), eq(clinicalCaseHubRead.clinicalCaseId, caseId)),
    )
    .limit(1);

  if (!read) {
    perfLog('getCaseHubReadState.total', Date.now() - t0, { caseId, found: false });
    return { lastReadTechHubAt: null, lastReadNegHubAt: null };
  }
  perfLog('getCaseHubReadState.total', Date.now() - t0, { caseId, found: true });
  return {
    lastReadTechHubAt: read.lastReadTechHubAt ? read.lastReadTechHubAt.toISOString() : null,
    lastReadNegHubAt: read.lastReadNegHubAt ? read.lastReadNegHubAt.toISOString() : null,
  };
}

export async function markCaseHubReadAction(caseId: string): Promise<{ ok: boolean; error?: string }> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { ok: false, error: 'No autorizado' };

  const [row] = await db
    .select({
      organizationId: clinicalCase.organizationId,
      assignedTechnicianId: clinicalCase.assignedTechnicianId,
      doctorId: clinicalCase.doctorId,
      status: clinicalCase.status,
    })
    .from(clinicalCase)
    .where(eq(clinicalCase.id, caseId))
    .limit(1);

  if (!row) return { ok: false, error: 'Caso no encontrado' };
  const ok = await userHasCaseHubAccess(identity, caseId, row);
  if (!ok) return { ok: false, error: 'Sin acceso' };

  const now = new Date();
  const uid = identity.id as string;

  await db
    .insert(clinicalCaseHubRead)
    .values({
      userId: uid,
      clinicalCaseId: caseId,
      lastReadTechHubAt: now,
      lastReadNegHubAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [clinicalCaseHubRead.userId, clinicalCaseHubRead.clinicalCaseId],
      set: {
        lastReadTechHubAt: now,
        lastReadNegHubAt: now,
        updatedAt: now,
      },
    });

  return { ok: true };
}

function toUnreadEvents<T extends { type: string; action: string; userId: string; createdAt: Date }>(
  rows: readonly T[],
): UchUnreadEvent[] {
  return rows.map((e) => ({
    type: e.type,
    action: e.action,
    userId: e.userId,
    createdAt: e.createdAt,
  }));
}

const PER_CASE_EVENT_CAP = Math.min(4000, HUB_UNREAD_EVENTS_CAP);

/**
 * Cuenta no-leídos de un caso a partir de eventos ya cargados en memoria (sin queries).
 * La lógica de visibilidad (`filterCaseEventsForUchViewer`) y de conteo por carril
 * (`totalUchHubUnread`) se mantiene idéntica al camino por-caso original.
 *
 * `eventsDescCapped` son los eventos del caso en orden descendente por fecha, ya
 * acotados a los {PER_CASE_EVENT_CAP} más recientes (mismo cap que el findMany previo).
 */
function countUnreadForCaseFromEvents(
  identity: Identity,
  meta: { assignedTechnicianId: string | null; doctorId: string | null; status?: string | null },
  readRow: { lastReadTechHubAt: Date | null; lastReadNegHubAt: Date | null } | undefined,
  eventsDescCapped: EventRow[],
  currentInvitationId: string | null,
): number {
  if (isHubInboxSuppressedForCompletedCase(meta.status)) return 0;

  // A cronológico ascendente (el filtro/conteo asumen ese orden).
  const events = [...eventsDescCapped].reverse();

  const filtered = filterCaseEventsForUchViewer(
    events,
    { id: identity.id as string, role: identity.role as string },
    meta,
    currentInvitationId,
  );

  const unreadEvents = toUnreadEvents(filtered);
  return totalUchHubUnread(unreadEvents, identity.id as string, {
    lastReadTech: readRow?.lastReadTechHubAt ?? null,
    lastReadNeg: readRow?.lastReadNegHubAt ?? null,
  });
}

/** Conteos por caso + total para listados y campana (máx. {HUB_UNREAD_BATCH_MAX_CASES} ids). */
export async function getHubUnreadCountsForCasesAction(
  caseIds: string[],
): Promise<{ byCaseId: Record<string, number>; total: number }> {
  const t0 = perfStart();
  const identity = await getServerIdentity();
  if (!identity?.id) return { byCaseId: {}, total: 0 };

  const unique = [...new Set(caseIds.filter((id) => typeof id === 'string' && id.length > 10))].slice(
    0,
    HUB_UNREAD_BATCH_MAX_CASES,
  );
  if (unique.length === 0) return { byCaseId: {}, total: 0 };

  const caseRows = await db
    .select({
      id: clinicalCase.id,
      organizationId: clinicalCase.organizationId,
      assignedTechnicianId: clinicalCase.assignedTechnicianId,
      doctorId: clinicalCase.doctorId,
      currentResponsibility: clinicalCase.currentResponsibility,
      status: clinicalCase.status,
    })
    .from(clinicalCase)
    .where(inArray(clinicalCase.id, unique));

  // Asignaciones del técnico para TODOS los casos en una sola query (antes: 1 por caso,
  // tanto para el chequeo de acceso como para el invitationId del carril técnico).
  const myAssignmentByCase = new Map<string, string>();
  if (identity.role === 'tecnico') {
    const rows = await db
      .select({ id: caseAssignment.id, clinicalCaseId: caseAssignment.clinicalCaseId })
      .from(caseAssignment)
      .where(
        and(
          eq(caseAssignment.technicianId, identity.id as string),
          inArray(caseAssignment.clinicalCaseId, unique),
        ),
      );
    for (const r of rows) if (!myAssignmentByCase.has(r.clinicalCaseId)) myAssignmentByCase.set(r.clinicalCaseId, r.id);
  }

  const allowed: typeof caseRows = [];
  for (const c of caseRows) {
    // Técnico (no admin): acceso resuelto en memoria con el set precargado — misma
    // regla que userCanAccessClinicalCase (asignado O con asignación al caso).
    if (canActAsTecnico(identity.role as string) && identity.role !== 'admin') {
      if (c.assignedTechnicianId === identity.id || myAssignmentByCase.has(c.id)) allowed.push(c);
      continue;
    }
    if (await userHasCaseHubAccess(identity, c.id, c)) allowed.push(c);
  }
  if (allowed.length === 0) return { byCaseId: {}, total: 0 };

  const allowedIds = allowed.map((c) => c.id);
  const readRows = await db
    .select({
      clinicalCaseId: clinicalCaseHubRead.clinicalCaseId,
      lastReadTechHubAt: clinicalCaseHubRead.lastReadTechHubAt,
      lastReadNegHubAt: clinicalCaseHubRead.lastReadNegHubAt,
    })
    .from(clinicalCaseHubRead)
    .where(
      and(
        eq(clinicalCaseHubRead.userId, identity.id as string),
        inArray(clinicalCaseHubRead.clinicalCaseId, allowedIds),
      ),
    );

  const readMap = new Map(
    readRows.map((r) => [
      r.clinicalCaseId,
      { lastReadTechHubAt: r.lastReadTechHubAt, lastReadNegHubAt: r.lastReadNegHubAt },
    ]),
  );

  const metaById = new Map(allowed.map((c) => [c.id, c]));

  // Eventos de TODOS los casos permitidos en una sola query (antes: 1 findMany por caso).
  // Se agrupan en memoria y se acotan a los {PER_CASE_EVENT_CAP} más recientes por caso,
  // preservando el mismo cap del findMany original.
  const allEvents = await db.query.clinicalCaseEvent.findMany({
    where: inArray(clinicalCaseEvent.clinicalCaseId, allowedIds),
    orderBy: [desc(clinicalCaseEvent.createdAt)],
  });
  const eventsByCase = new Map<string, EventRow[]>();
  for (const e of allEvents) {
    const bucket = eventsByCase.get(e.clinicalCaseId);
    if (bucket) {
      if (bucket.length < PER_CASE_EVENT_CAP) bucket.push(e);
    } else {
      eventsByCase.set(e.clinicalCaseId, [e]);
    }
  }

  const byCaseId: Record<string, number> = {};
  let total = 0;

  for (const cid of allowedIds) {
    const meta = metaById.get(cid)!;
    const uch = countUnreadForCaseFromEvents(
      identity,
      meta,
      readMap.get(cid),
      eventsByCase.get(cid) ?? [],
      myAssignmentByCase.get(cid) ?? null,
    );
    const bump = responsibilityAttentionBump({
      viewerRole: identity.role as string,
      viewerId: identity.id as string,
      currentResponsibility: meta.currentResponsibility,
      assignedTechnicianId: meta.assignedTechnicianId,
      caseStatus: meta.status,
    });
    const n = uch + bump;
    byCaseId[cid] = n;
    total += n;
  }

  perfLog('getHubUnreadCounts.total', Date.now() - t0, { caseCount: unique.length, total });
  return { byCaseId, total };
}

/** Casos recientes con acceso al hub para sumar pendientes en la campana del layout. */
async function recentCaseIdsForHubBell(identity: Identity, limit: number): Promise<string[]> {
  const userId = identity.id as string;
  const role = identity.role as string;
  const orgId = (identity as { orgId?: string | null }).orgId;
  const archivedCaseIds = await getArchivedCaseIdsForUser(userId);
  const archiveFilter = archiveVisibilityForUser(userId, false, archivedCaseIds);

  if (canActAsTecnico(role) && role !== 'admin') {
    const invs = await db
      .select({ caseId: caseAssignment.clinicalCaseId })
      .from(caseAssignment)
      .where(eq(caseAssignment.technicianId, userId));
    const invCaseIds = [...new Set(invs.map((i) => i.caseId))].slice(0, 500);

    const rows = await db
      .select({ id: clinicalCase.id })
      .from(clinicalCase)
      .where(
        and(
          archiveFilter,
          invCaseIds.length > 0
            ? or(eq(clinicalCase.assignedTechnicianId, userId), inArray(clinicalCase.id, invCaseIds))
            : eq(clinicalCase.assignedTechnicianId, userId),
        ),
      )
      .orderBy(desc(clinicalCase.lastActivityAt))
      .limit(limit);

    return rows.map((r) => r.id);
  }

  if (!orgId) return [];

  if (role === 'admin') {
    const rows = await db
      .select({ id: clinicalCase.id })
      .from(clinicalCase)
      .where(and(eq(clinicalCase.organizationId, orgId), archiveFilter))
      .orderBy(desc(clinicalCase.lastActivityAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  const rows = await db
    .select({ id: clinicalCase.id })
    .from(clinicalCase)
    .where(
      and(
        eq(clinicalCase.organizationId, orgId),
        archiveFilter,
        or(eq(clinicalCase.doctorId, userId), eq(clinicalCase.status, 'publicado')),
      ),
    )
    .orderBy(desc(clinicalCase.lastActivityAt))
    .limit(limit);

  return rows.map((r) => r.id);
}

export async function getMyHubUnreadTotalAction(): Promise<{ total: number }> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { total: 0 };

  const ids = await recentCaseIdsForHubBell(identity, HUB_UNREAD_TOTAL_CASE_SCAN);
  if (ids.length === 0) return { total: 0 };

  const { total } = await getHubUnreadCountsForCasesAction(ids);
  return { total };
}
