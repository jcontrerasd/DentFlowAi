'use server';

import { db } from '@/lib/db';
import {
  clinicalCase,
  clinicalCaseEvent,
  caseInvitation,
  clinicalCaseHubRead,
} from '@/lib/db/schema';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
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
    return { lastReadTechHubAt: null, lastReadNegHubAt: null };
  }
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

async function unreadTotalForCase(
  identity: Identity,
  caseId: string,
  meta: { assignedTechnicianId: string | null; doctorId: string | null; status?: string | null },
  readRow: { lastReadTechHubAt: Date | null; lastReadNegHubAt: Date | null } | undefined,
): Promise<number> {
  if (isHubInboxSuppressedForCompletedCase(meta.status)) return 0;

  let currentInvitationId: string | null = null;
  if (identity.role === 'tecnico') {
    const [myInv] = await db
      .select({ id: caseInvitation.id })
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.technicianId, identity.id as string)))
      .limit(1);
    currentInvitationId = myInv?.id ?? null;
  }

  const events = await db.query.clinicalCaseEvent.findMany({
    where: eq(clinicalCaseEvent.clinicalCaseId, caseId),
    orderBy: [desc(clinicalCaseEvent.createdAt)],
    limit: Math.min(4000, HUB_UNREAD_EVENTS_CAP),
  });
  events.reverse();

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

  const allowed: typeof caseRows = [];
  for (const c of caseRows) {
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

  const byCaseId: Record<string, number> = {};
  let total = 0;

  const chunkSize = 10;
  for (let i = 0; i < allowedIds.length; i += chunkSize) {
    const chunk = allowedIds.slice(i, i + chunkSize);
    const counts = await Promise.all(
      chunk.map(async (cid) => {
        const meta = metaById.get(cid)!;
        const uch = await unreadTotalForCase(identity, cid, meta, readMap.get(cid));
        const bump = responsibilityAttentionBump({
          viewerRole: identity.role as string,
          viewerId: identity.id as string,
          currentResponsibility: meta.currentResponsibility,
          assignedTechnicianId: meta.assignedTechnicianId,
          caseStatus: meta.status,
        });
        const n = uch + bump;
        return { cid, n };
      }),
    );
    for (const { cid, n } of counts) {
      byCaseId[cid] = n;
      total += n;
    }
  }

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
      .select({ caseId: caseInvitation.clinicalCaseId })
      .from(caseInvitation)
      .where(eq(caseInvitation.technicianId, userId));
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
