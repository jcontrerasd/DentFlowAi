'use server';

import { randomUUID } from 'crypto';
import { notifyUser } from "../../services/notifications";
import GCPStorageService from '@/lib/services/gcp-storage';
import { db } from "@/lib/db";
import { clinicalCase, user, file, annotation, bid, review, commercialRound, clinicalCaseDelivery, clinicalCaseEvent, organization, technicianSkill, caseInvitation, caseUserArchive } from "@/lib/db/schema";
import { eq, desc, and, or, ne, not, sql, inArray, avg, exists, gt } from "drizzle-orm";
import {
  archiveVisibilityForUser,
  assertUserMayArchiveCase,
  getArchivedCaseIdsForUser,
  isCaseArchivedByUser,
} from '@/lib/db/caseUserArchiveHelpers';
import { isTerminalCaseStatus } from '@/lib/constants/dental';
import { collectCaseStoragePaths } from '@/lib/cases/caseStoragePaths';
import { archiveCaseFilesBestEffort } from '@/lib/db/archiveCaseFiles';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';
import { getSignedUrl, getUploadUrl } from "@/lib/gcs";
import { canActAsTecnico, canActAsDentista } from "@/lib/auth-helpers";
import { getServerIdentity } from "./impersonation";
import { resolveCatalogCodesToIds } from "@/lib/db/catalogResolver";
import { dentalMaterial, restorationType as restorationTypeTable, vitaShade, urgencyLevel } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/types/actions";
import { CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { UCH_CASE_EVENTS_DEFAULT_PAGE_SIZE } from '@/lib/constants/uchCaseEvents';
import {
  UCH_FAUCHARD_PUBLIC_USER,
  UCH_PAYLOAD_PRESENTATION_FAUCHARD,
  sanitizeUchPayloadForViewer,
  shouldPresentUchEventAsFauchard,
} from '@/lib/uchPresentation';
import { filterCaseEventsForUchViewer } from '@/lib/caseEventsUchFilter';
import type { CaseListQueryFilters } from '@/lib/cases/caseListFilters';
import {
  buildActiveCaseVisibilityWhere,
  userCanAccessClinicalCase,
} from '@/lib/db/caseListVisibility';
import {
  buildCaseListFilterWhere,
  buildCaseListOrderBy,
  buildTechFacetCondition,
} from '@/lib/db/caseListQueryBuilder';
import { pickInvitationStatusForKpi } from '@/lib/cases/technicianInvitationForKpi';
import { getCaseQuoteDeadlineAtBatch, getCaseQuoteDeadlineAt } from '@/lib/db/caseDeadlines';


/**
 * Registra un evento en la tabla clinical_case_event.
 * Esta función es el motor central del Hub Clínico Unificado (UCH).
 */
export async function logCaseEvent({
  caseId,
  userId,
  type,
  action,
  content,
  payload = {},
  stateChange = {},
  skipActivityUpdate = false,
}: {
  caseId: string,
  userId: string,
  type: 'negociacion' | 'tecnico' | 'sistema',
  action: string,
  content?: string,
  payload?: any,
  stateChange?: { from?: string, to?: string },
  skipActivityUpdate?: boolean,
}, tx?: any) {
  const dbClient = tx || db;
  try {
    await dbClient.insert(clinicalCaseEvent).values({
      clinicalCaseId: caseId,
      userId,
      type,
      action,
      content: content || '',
      payload,
      stateChange,
      createdAt: new Date()
    });

    if (!skipActivityUpdate) {
      await dbClient.update(clinicalCase).set({
        lastActivityAt: new Date()
      }).where(eq(clinicalCase.id, caseId));
    }

  } catch (error) {
    console.error("[logCaseEvent] Error:", error);
    // No lanzamos el error para no bloquear la acción principal si falla el logging
  }
}

/**
 * Obtiene eventos de un caso clínico, orden cronológico ascendente (más antiguo primero).
 * Paginación hacia atrás: `beforeId` = id de un evento ya cargado; devuelve filas estrictamente anteriores a su `createdAt`.
 * Se usa para el Unified Case Hub (UCH).
 */
export async function getCaseEventsAction(
  caseId: string,
  filter?: 'negociacion' | 'tecnico' | 'sistema',
  options?: { limit?: number; beforeId?: string },
): Promise<{ events: any[]; hasMoreOlder: boolean }> {
  const identity = await getServerIdentity();
  if (!identity) throw new Error("No autorizado");

  const pageLimit = Math.min(options?.limit ?? UCH_CASE_EVENTS_DEFAULT_PAGE_SIZE, 200);

  try {
    const [targetCase] = await db
      .select({
        organizationId: clinicalCase.organizationId,
        assignedTechnicianId: clinicalCase.assignedTechnicianId,
        doctorId: clinicalCase.doctorId,
        status: clinicalCase.status,
      })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    if (!targetCase) {
      throw new Error('Caso no encontrado');
    }

    const canReadEvents = await userCanAccessClinicalCase(
      {
        id: identity.id as string,
        role: identity.role as string,
        orgId: identity.orgId ?? null,
        isSystemAdmin: identity.isSystemAdmin,
      },
      caseId,
      targetCase,
    );
    if (!canReadEvents) {
      throw new Error('No autorizado');
    }

    // Cursor: si hay beforeId, tomamos el createdAt de ese evento para paginar hacia atrás
    let beforeCursor: Date | undefined;
    if (options?.beforeId) {
      const [pivot] = await db.select({ createdAt: clinicalCaseEvent.createdAt }).from(clinicalCaseEvent).where(eq(clinicalCaseEvent.id, options.beforeId)).limit(1);
      beforeCursor = pivot?.createdAt;
    }

    const whereConditions: any[] = [eq(clinicalCaseEvent.clinicalCaseId, caseId)];
    if (filter) whereConditions.push(eq(clinicalCaseEvent.type, filter));
    if (beforeCursor) whereConditions.push(sql`${clinicalCaseEvent.createdAt} < ${beforeCursor}`);

    // Pedimos DESC para tomar los más recientes, luego invertimos al retornar
    const events = await db.query.clinicalCaseEvent.findMany({
      where: and(...whereConditions),
      orderBy: [sql`created_at DESC`],
      limit: pageLimit,
      with: {
        user: {
          columns: {
            id: true,
            fullName: true,
            role: true,
            image: true
          }
        }
      }
    });

    // Restablecer orden cronológico ascendente (más antiguo primero)
    const dbRowCount = events.length;
    const hasMoreOlder = dbRowCount >= pageLimit;
    events.reverse();

    // Obtener invitationId del técnico actual (para filtro por invitation)
    let currentInvitationId: string | null = null;
    if (identity.role === 'tecnico') {
      const [myInv] = await db.select({ id: caseInvitation.id })
        .from(caseInvitation)
        .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.technicianId, identity.id as string)))
        .limit(1);
      currentInvitationId = myInv?.id ?? null;
    }

    const filteredEvents = filterCaseEventsForUchViewer(
      events,
      { id: identity.id as string, role: identity.role as string },
      targetCase,
      currentInvitationId,
    );

    /** OFERTA_RECHAZADA / OFERTA_NO_SELECCIONADA (solo dentista): snapshot desde invitación si el JSON omitió números. */
    const rejectedOfferInvitationSnapshots = new Map<
      string,
      { quotedPrice: number | null; quotedDays: number | null; techNotes: string | null }
    >();
    if (identity.role === 'dentista') {
      const invIds = [
        ...new Set(
          filteredEvents
            .filter((e) => {
              if (e.action === CASE_EVENTS.OFERTA_RECHAZADA) return true;
              if (e.action === CASE_EVENTS.OFERTA_NO_SELECCIONADA) {
                const vt = (e.payload as Record<string, unknown> | null)?.visibleTo;
                return vt === 'dentista';
              }
              return false;
            })
            .map((e) => (e.payload as Record<string, unknown> | null)?.invitationId)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        ),
      ];
      if (invIds.length > 0) {
        const rows = await db
          .select({
            id: caseInvitation.id,
            quotedPrice: caseInvitation.quotedPrice,
            quotedDays: caseInvitation.quotedDays,
            techNotes: caseInvitation.techNotes,
          })
          .from(caseInvitation)
          .where(and(eq(caseInvitation.clinicalCaseId, caseId), inArray(caseInvitation.id, invIds)));
        for (const r of rows) {
          const qp = r.quotedPrice != null ? Number(r.quotedPrice) : NaN;
          const qd = r.quotedDays != null ? Math.trunc(Number(r.quotedDays)) : NaN;
          rejectedOfferInvitationSnapshots.set(r.id, {
            quotedPrice: Number.isFinite(qp) && qp >= 0 ? qp : null,
            quotedDays: Number.isFinite(qd) && qd > 0 ? qd : null,
            techNotes: r.techNotes?.trim() ? r.techNotes.trim() : null,
          });
        }
      }
    }

    // Firmar URLs de avatares (deduplicado por ruta)
    const uniquePaths = [...new Set(
      filteredEvents.map(e => e.user?.image).filter((p): p is string => !!p && !p.startsWith('http'))
    )];
    const signedMap = new Map<string, string | null>();
    await Promise.all(uniquePaths.map(async (p) => {
      try { signedMap.set(p, await getSignedUrl(p)); } catch { signedMap.set(p, null); }
    }));
    const caseDoctorId = targetCase?.doctorId ?? null;

    const signedEvents = filteredEvents.map((event) => {
      try {
      let mapped: (typeof filteredEvents)[number] = event;

      if (
        identity.role === 'dentista' &&
        (event.action === CASE_EVENTS.OFERTA_RECHAZADA ||
          (event.action === CASE_EVENTS.OFERTA_NO_SELECCIONADA &&
            (event.payload as Record<string, unknown> | null | undefined)?.visibleTo === 'dentista'))
      ) {
        const p = event.payload as Record<string, unknown> | null | undefined;
        const invId = p?.invitationId;
        if (p && typeof invId === 'string') {
          const snap = rejectedOfferInvitationSnapshots.get(invId);
          if (snap) {
            const pickPrice = (): number | null => {
              const raw = p.quotedPrice;
              if (raw != null && raw !== '') {
                const n = Number(raw as number | string);
                if (Number.isFinite(n) && n >= 0) return n;
              }
              return snap.quotedPrice;
            };
            const pickDays = (): number | null => {
              const raw = p.quotedDays;
              if (raw != null && raw !== '') {
                const n = Math.trunc(Number(raw as number | string));
                if (Number.isFinite(n) && n > 0) return n;
              }
              return snap.quotedDays;
            };
            const pickNotes = (): string | null => {
              const raw = p.techNotes;
              if (typeof raw === 'string' && raw.trim()) return raw.trim();
              return snap.techNotes;
            };
            mapped = {
              ...event,
              payload: {
                ...p,
                quotedPrice: pickPrice(),
                quotedDays: pickDays(),
                techNotes: pickNotes(),
              },
            };
          }
        }
      }

      const orig = mapped.user?.image;
      if (orig && signedMap.has(orig)) {
        mapped = { ...mapped, user: mapped.user ? { ...mapped.user, image: signedMap.get(orig) ?? null } : mapped.user };
      }

      const maskFauchard = shouldPresentUchEventAsFauchard(
        {
          userId: event.userId,
          action: event.action,
          user: mapped.user ?? null,
          payload: mapped.payload,
        },
        { id: identity.id as string, role: identity.role as string },
        caseDoctorId
      );

      if (maskFauchard) {
        mapped = {
          ...mapped,
          user: { ...UCH_FAUCHARD_PUBLIC_USER },
          payload: sanitizeUchPayloadForViewer(mapped.payload, identity.role as string),
        };
      } else if (identity.role !== 'admin') {
        mapped = {
          ...mapped,
          payload: sanitizeUchPayloadForViewer(mapped.payload, identity.role as string),
        };
      }

      return mapped;
      } catch (err) {
        console.error('[getCaseEventsAction] event-map failure:', event.id, event.action, err);
        return event;
      }
    });

    return { events: signedEvents, hasMoreOlder };
  } catch (error) {
    console.error("[getCaseEventsAction] Error:", error);
    console.error("[getCaseEventsAction] Stack:", (error as Error)?.stack);
    return { events: [], hasMoreOlder: false };
  }
}


/**
 * Genera el siguiente número de caso humano (DF-XXXX)
 */
export async function getNextCaseNumber() {
  try {
    const result: any = await db.execute(sql`SELECT nextval('case_number_seq') as val`);
    const val = result[0].val;
    return `DF-${String(val).padStart(4, '0')}`;
  } catch (error) {
    console.error("[getNextCaseNumber] Error:", error);
    // Fallback simple si la secuencia falla
    return `DF-${Date.now().toString().slice(-4)}`;
  }
}

/**
 * Server Action para obtener una URL firmada de lectura.
 * Protegido: Solo permite acceso a archivos propios de la organización.
 */
export async function getSignedUrlAction(fileName: string) {
  const identity = await getServerIdentity();
  if (!identity) throw new Error("No autorizado");
  const { orgId, id: userId, role: userRole, isSystemAdmin } = identity;
  
  // 0. Bypass total para administradores del sistema
  if (isSystemAdmin) return await getSignedUrl(fileName);

  // 1. Acceso total si es su propia carpeta de organización o usuario
  const isOwnResource = fileName.startsWith(`organizations/${orgId}/`) || fileName.startsWith(`users/${userId}/`);
  if (isOwnResource) return await getSignedUrl(fileName);

  // 2. Acceso para Técnicos a casos ajenos (S4-08: solo si tienen invitación confirmada)
  const caseMatch = fileName.match(/^organizations\/[^/]+\/cases\/([^/]+)\//);
  if (caseMatch && userRole === 'tecnico') {
    const caseIdFromPath = caseMatch[1];

    const [cCase] = await db
      .select({ status: clinicalCase.status, assignedId: clinicalCase.assignedTechnicianId })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseIdFromPath))
      .limit(1);

    if (cCase) {
      // Legacy: caso publicado en marketplace (modelo v1)
      const isLegacyPublic = cCase.status === 'publicado';

      // Modelo v2: técnico con invitación confirmada (dentista aceptó la propuesta)
      const { caseInvitation } = await import('@/lib/db/schema');
      const { eq: eqOp, and: andOp } = await import('drizzle-orm');
      const [confirmedInv] = await db
        .select({ id: caseInvitation.id })
        .from(caseInvitation)
        .where(andOp(
          eqOp(caseInvitation.clinicalCaseId, caseIdFromPath),
          eqOp(caseInvitation.technicianId, userId as string),
          eqOp(caseInvitation.status, 'confirmed')
        ))
        .limit(1);

      if (isLegacyPublic || confirmedInv) {
        return await getSignedUrl(fileName);
      }
    }
  }

  console.error("[getSignedUrlAction] Bloqueo de seguridad:", { fileName, identityOrg: orgId, role: userRole });
  throw new Error("Acceso denegado a recurso ajeno");
}

/**
 * Server Action para obtener una URL firmada de subida.
 */
export async function getUploadUrlAction(
  fileName: string,
  contentType: string,
  options?: { contentEncoding?: 'gzip' }
) {
  const identity = await getServerIdentity();
  if (!identity) throw new Error("No autorizado");

  const { orgId, id: userId, isSimulating, isSystemAdmin } = identity;

  // 0. Bypass total para administradores del sistema
  if (isSystemAdmin) return await getUploadUrl(fileName, contentType, options);

  // Validación de seguridad:
  // El archivo debe ir a su carpeta de organización O a su carpeta de usuario
  const isOrgPath = fileName.startsWith(`organizations/${orgId}/`);
  const isUserPath = fileName.startsWith(`users/${userId}/`);

  if (!isOrgPath && !isUserPath) {
    console.error("[getUploadUrlAction] Bloqueo de seguridad:", { fileName, identityOrg: orgId, identityUser: userId });
    throw new Error("Ruta de subida no autorizada");
  }

  return await getUploadUrl(fileName, contentType, options);
}

/**
 * Lista todos los casos de una organización. (Usa organizationId de la sesión de forma segura)
 */
export async function listCasesByOrganization(
  page = 1,
  pageSize = 24,
  showArchived = false,
  forList = false,
  filters?: CaseListQueryFilters,
): Promise<{
  cases: any[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  serverNowMs?: number;
}> {
  try {
    const identity = await getServerIdentity();
    if (!identity) return { cases: [], total: 0, page, pageSize, hasMore: false, serverNowMs: Date.now() };

    const { role, id: userId } = identity;
    const listIdentity = {
      id: userId as string,
      role: role as string,
      orgId: identity.orgId ?? null,
    };

    const visibilityWhere = await buildActiveCaseVisibilityWhere(listIdentity, showArchived);
    if (!visibilityWhere) {
      return { cases: [], total: 0, page, pageSize, hasMore: false, serverNowMs: Date.now() };
    }

    const filterWhere = buildCaseListFilterWhere(filters, listIdentity);
    const whereClause = filterWhere ? and(visibilityWhere, filterWhere) : visibilityWhere;

    const offset = (page - 1) * pageSize;
    const listMode = forList === true;
    const isTech = canActAsTecnico(role as string) && role !== 'admin';
    const orderBy = buildCaseListOrderBy(filters);

    const techUserId = userId as string;

    const [countResult, results] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(clinicalCase).where(whereClause),
      isTech
        ? db.query.clinicalCase.findMany({
            where: whereClause,
            with: listMode
              ? {
                  material: true,
                  restoration: true,
                  shade: true,
                  urgencyLevel: true,
                  organization: { columns: { name: true } },
                  files: { limit: 1 },
                  invitations: {
                    where: (inv, { eq: eqOp }) => eqOp(inv.technicianId, techUserId),
                    orderBy: (inv, { desc: descOp }) => [descOp(inv.updatedAt)],
                  },
                }
              : {
                  material: true,
                  restoration: true,
                  shade: true,
                  urgencyLevel: true,
                  organization: true,
                  bids: { columns: { id: true, status: true, price: true } },
                  files: { limit: 3 },
                  invitations: {
                    where: (inv, { eq: eqOp }) => eqOp(inv.technicianId, techUserId),
                    orderBy: (inv, { desc: descOp }) => [descOp(inv.updatedAt)],
                  },
                },
            orderBy: [orderBy],
            limit: pageSize,
            offset,
          })
        : db.query.clinicalCase.findMany({
            where: whereClause,
            with: listMode
              ? {
                  material: true,
                  restoration: true,
                  shade: true,
                  urgencyLevel: true,
                  files: { limit: 1 },
                  invitations: {
                    where: (inv, { eq: eqOp, gt: gtOp, and: andOp }) =>
                      andOp(eqOp(inv.status, 'pending'), gtOp(inv.expiresAt, new Date())),
                    orderBy: (inv, { desc: descOp }) => [descOp(inv.expiresAt)],
                    limit: 1,
                  },
                }
              : {
                  material: true,
                  restoration: true,
                  shade: true,
                  urgencyLevel: true,
                  organization: true,
                  bids: { columns: { id: true, status: true, price: true } },
                  files: { limit: 3 },
                  invitations: {
                    where: (inv, { eq: eqOp, gt: gtOp, and: andOp }) =>
                      andOp(eqOp(inv.status, 'pending'), gtOp(inv.expiresAt, new Date())),
                    orderBy: (inv, { desc: descOp }) => [descOp(inv.expiresAt)],
                    limit: 1,
                  },
                },
            orderBy: [orderBy],
            limit: pageSize,
            offset,
          }),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    const evalCaseIds = results.filter((c) => c.status === 'enEvaluacion').map((c) => c.id);
    const quoteDeadlines = await getCaseQuoteDeadlineAtBatch(evalCaseIds);

    const processedResults = results.map((c: any) => {
      const row = c as typeof c & { invitations?: typeof caseInvitation.$inferSelect[] };
      const invRows = Array.isArray(row.invitations) ? row.invitations : [];
      const representativeStatus = isTech
        ? pickInvitationStatusForKpi(invRows)
        : null;
      const viewerInv =
        invRows.length > 0
          ? invRows.find((inv: any) => inv.status === representativeStatus) ?? invRows[0]
          : undefined;
      // Aplanar relaciones de catálogos a strings (label) para retro-compat con la UI.
      const matRel = (c as any).material as { code: string; label: string } | null;
      const restRel = (c as any).restoration as { code: string; label: string } | null;
      const shadeRel = (c as any).shade as { code: string; label: string } | null;
      const urgRel = (c as any).urgencyLevel as { code: string; label: string } | null;
      return {
        ...c,
        material: matRel?.label ?? null,
        materialCode: matRel?.code ?? null,
        restorationType: restRel?.label ?? null,
        restorationTypeCode: restRel?.code ?? null,
        shade: shadeRel?.label ?? null,
        shadeCode: shadeRel?.code ?? null,
        urgency: urgRel?.label ?? null,
        viewerInvitation: viewerInv ?? null,
        invitationExpiresAt:
          c.status === 'enEvaluacion' ? quoteDeadlines.get(c.id) ?? null : null,
      };
    });

    if (evalCaseIds.length > 0) {
      const { batchExpireInvitationsForCases } = await import('./fauchard');
      await batchExpireInvitationsForCases(evalCaseIds);
    }

    return {
      cases: processedResults,
      total,
      page,
      pageSize,
      hasMore: offset + processedResults.length < total,
      serverNowMs: Date.now(),
    };
  } catch (error) {
    console.error("[listCasesByOrganization] Error:", error);
    return { cases: [], total: 0, page, pageSize, hasMore: false, serverNowMs: Date.now() };
  }
}

export type CaseListFacetCounts = {
  nuevas: number;
  cotizaciones: number;
  progreso: number;
};

export async function getCaseListFacetCountsAction(
  showArchived = false,
): Promise<CaseListFacetCounts | null> {
  const identity = await getServerIdentity();
  if (!identity?.id || !canActAsTecnico(identity.role)) return null;

  const listIdentity = {
    id: identity.id as string,
    role: identity.role as string,
    orgId: identity.orgId ?? null,
  };

  const visibilityWhere = await buildActiveCaseVisibilityWhere(listIdentity, showArchived);
  if (!visibilityWhere) return { nuevas: 0, cotizaciones: 0, progreso: 0 };

  const facets: CaseListFacetCounts = { nuevas: 0, cotizaciones: 0, progreso: 0 };
  const keys = ['nuevas', 'cotizaciones', 'progreso'] as const;

  await Promise.all(
    keys.map(async (key) => {
      const facetWhere = buildTechFacetCondition(listIdentity, key);
      const whereClause = and(visibilityWhere, facetWhere);
      const row = await db
        .select({ count: sql<number>`count(*)` })
        .from(clinicalCase)
        .where(whereClause);
      facets[key] = Number(row[0]?.count ?? 0);
    }),
  );

  return facets;
}
export async function getCaseDetails(caseId: string) {
  const identity = await getServerIdentity();
  if (!identity) return { _error: "NoSession" } as any;

  const { id: userId, role: userRole, orgId, email: userEmail, isSimulating, isSystemAdmin } = identity;

  try {
    // 1. Validar formato UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!caseId || !uuidRegex.test(caseId)) {
       return { _error: "InvalidID" } as any;
    }

    // 2. Etapa 1: expirar pending vencidas; si no quedan pending, evaluar → propuestaLista (idempotente).
    const { expirePendingInvitationsForCase, tryEvaluateQuotesIfReady } = await import('./fauchard');
    await expirePendingInvitationsForCase(caseId);
    await tryEvaluateQuotesIfReady(caseId);

    // 3. Consulta Unificada con Drizzle Relations
    const cCase: any = await db.query.clinicalCase.findFirst({
      where: eq(clinicalCase.id, caseId),
      with: {
        material: true,
        restoration: true,
        shade: true,
        urgencyLevel: true,
        files: true,
        annotations: {
          with: { user: true }
        },
        bids: {
          where: (bids, { eq }) => userRole === 'tecnico' ? eq(bids.technicianId, userId as string) : undefined,
          orderBy: (bids, { desc }) => [desc(bids.createdAt)],
          with: { technician: true, round: true }
        },
        rounds: {
          orderBy: (rounds, { desc }) => [desc(rounds.roundNumber)]
        },
        deliveries: {
          with: {
            technician: true
          },
          orderBy: (deliveries, { desc }) => [desc(deliveries.version)]
        },
        technician: {
          with: { organization: true }
        },
        // events: se obtienen via getCaseEventsAction (con paginación y enmascarado Fauchard).
        // Cargarlos aquí duplicaba trabajo y crecía con el historial del caso.
      }
    });

    if (!cCase) {
      return {
        _error: "NotFound",
        _debug: { caseId, userId, userEmail, isSystemAdmin, role: userRole, msg: "El caso no existe en la base de datos" }
      } as any;
    }

    // Aliases legacy: el resto del código (UI + actions) lee cCase.material/restorationType/shade/urgency
    // como strings. Tras el refactor a FK, capturamos los objetos relacionales y aplanamos a label/code
    // para no romper consumidores. Las URL/displays usan label; los formularios envían code.
    {
      const matRel = (cCase as any).material as { code: string; label: string } | null;
      const restRel = (cCase as any).restoration as { code: string; label: string } | null;
      const shadeRel = (cCase as any).shade as { code: string; label: string } | null;
      const urgRel = (cCase as any).urgencyLevel as { code: string; label: string } | null;
      (cCase as any).material = matRel?.label ?? null;
      (cCase as any).materialCode = matRel?.code ?? null;
      (cCase as any).restorationType = restRel?.label ?? null;
      (cCase as any).restorationTypeCode = restRel?.code ?? null;
      (cCase as any).shade = shadeRel?.label ?? null;
      (cCase as any).shadeCode = shadeRel?.code ?? null;
      (cCase as any).urgency = urgRel?.label ?? null;
    }

    // 4. Visibilidad alineada con listCases (misma org no basta para dentista ajeno)
    const hasAccess = await userCanAccessClinicalCase(
      {
        id: userId as string,
        role: userRole as string,
        orgId: orgId ?? null,
        isSystemAdmin,
      },
      caseId,
      {
        organizationId: cCase.organizationId,
        doctorId: cCase.doctorId,
        status: cCase.status,
        assignedTechnicianId: cCase.assignedTechnicianId,
      },
    );

    if (!hasAccess) {
      return {
        _error: "AccessDenied",
        _debug: { caseId, userId, isSimulating, role: userRole, msg: "No tienes permisos para ver este caso" }
      } as any;
    }

    // 5. Firmar URLs de las entregas (Deliveries)
    if (cCase.deliveries && cCase.deliveries.length > 0) {
      for (const delivery of cCase.deliveries) {
        if (delivery.files && Array.isArray(delivery.files)) {
          const signedFiles = await Promise.all(
            (delivery.files as string[]).map(async (path) => {
              try {
                return await getSignedUrl(path);
              } catch (err) {
                console.error("[getCaseDetails] Error signing delivery file:", path, err);
                return path;
              }
            })
          );
          (delivery as any).files = signedFiles;
        }
      }
    }

    // 6. Avatares de eventos: ya se firman dentro de getCaseEventsAction.

    let evaluationExpiresAt: Date | null = null;
    if (cCase.status === 'enEvaluacion') {
      // getCaseQuoteDeadlineAt imported statically at top of file
      evaluationExpiresAt = await getCaseQuoteDeadlineAt(caseId);
    }

    let comparativeOffers: Array<{
      invitationId: string;
      rank: number;
      totalPriceCLP: number;
      quotedDays: number | null;
      quotedHours: number | null;
      techNotes: string | null;
      respondedAt: Date | null;
      // Desglose integral (Fase 4.4): nullable.
      designPriceCLP?: number | null;
      designDays?: number | null;
      designHours?: number | null;
      fabricationPriceCLP?: number | null;
      fabricationDays?: number | null;
      fabricationHours?: number | null;
      // Flete (v4.4): expuesto SIN fee. nullable para casos legacy y solo_diseno.
      shippingPriceCLP?: number | null;
      shippingDays?: number | null;
      shippingHours?: number | null;
    }> | undefined;

    const isOwningDentist =
      userRole === 'dentista' && cCase.doctorId === userId && cCase.organizationId === orgId;
    if ((isOwningDentist || isSystemAdmin) && cCase.status === CASE_STATUSES.PROPUESTA_LISTA) {
      const { getConfigForCase } = await import('./fauchard');
      const cfg = await getConfigForCase(caseId);
      const fee = parseFloat(String(cfg.platformFee ?? '0.15'));

      const rows = await db
        .select()
        .from(caseInvitation)
        .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted')));

      const sorted = [...rows].sort((a, b) => {
        const pd = (a.quotedPrice ?? Infinity) - (b.quotedPrice ?? Infinity);
        if (pd !== 0) return pd;
        // Ordenamiento secundario: tiempo total aproximado (días*24 + horas).
        const aTime = (a.quotedDays ?? 0) * 24 + (a.quotedHours ?? 0);
        const bTime = (b.quotedDays ?? 0) * 24 + (b.quotedHours ?? 0);
        if (aTime !== bTime) return aTime - bTime;
        return new Date(a.respondedAt ?? a.createdAt ?? 0).getTime() - new Date(b.respondedAt ?? b.createdAt ?? 0).getTime();
      });

      comparativeOffers = sorted.map((row, i) => {
        // v4.4 — Flete: fee NO aplica al flete. Lo separamos del total con-fee.
        const shipping = row.quotedShippingPrice ?? 0;
        const subtotalWithoutShipping = (row.quotedPrice ?? 0) - shipping;
        return {
          invitationId: row.id,
          rank: i + 1,
          totalPriceCLP: subtotalWithoutShipping * (1 + fee) + shipping,
          quotedDays: row.quotedDays ?? null,
          quotedHours: row.quotedHours ?? null,
          techNotes: row.techNotes ?? null,
          respondedAt: row.respondedAt ?? null,
          designPriceCLP: row.quotedDesignPrice != null ? row.quotedDesignPrice * (1 + fee) : null,
          designDays: row.quotedDesignDays ?? null,
          designHours: row.quotedDesignHours ?? null,
          fabricationPriceCLP: row.quotedFabricationPrice != null ? row.quotedFabricationPrice * (1 + fee) : null,
          fabricationDays: row.quotedFabricationDays ?? null,
          fabricationHours: row.quotedFabricationHours ?? null,
          shippingPriceCLP: row.quotedShippingPrice ?? null,
          shippingDays: row.quotedShippingDays ?? null,
          shippingHours: row.quotedShippingHours ?? null,
        };
      });
    }

    if (userRole === 'tecnico' && cCase.status === CASE_STATUSES.PROPUESTA_LISTA) {
      (cCase as any).proposedPrice = undefined;
      (cCase as any).proposedDeliveryDays = undefined;
      (cCase as any).platformFee = undefined;
    }

    // Comparativo anónimo: el dentista no debe ver datos del laboratorio hasta aceptar una oferta
    if (
      userRole === 'dentista' &&
      cCase.status === CASE_STATUSES.PROPUESTA_LISTA &&
      !cCase.assignedTechnicianId
    ) {
      (cCase as any).technician = undefined;
    }

    const archivedByCurrentUser = await isCaseArchivedByUser(caseId, userId as string);

    let myInvitationStatus: string | null = null;
    if (userRole === 'tecnico') {
      const [canonicalInv] = await db
        .select({ status: caseInvitation.status })
        .from(caseInvitation)
        .where(
          and(
            eq(caseInvitation.clinicalCaseId, caseId),
            eq(caseInvitation.technicianId, userId as string),
          ),
        )
        .orderBy(desc(caseInvitation.invitedAt))
        .limit(1);
      myInvitationStatus = canonicalInv?.status ?? null;
    }

    let copiedFromCaseNumber: string | null = null;
    if (cCase.copiedFromCaseId) {
      const [source] = await db
        .select({ caseNumber: clinicalCase.caseNumber })
        .from(clinicalCase)
        .where(eq(clinicalCase.id, cCase.copiedFromCaseId))
        .limit(1);
      copiedFromCaseNumber = source?.caseNumber ?? null;
    }

    const canDelete = await canDeleteCase(caseId);

    return {
      ...cCase,
      evaluationExpiresAt,
      comparativeOffers,
      serverNowMs: Date.now(),
      archivedByCurrentUser,
      myInvitationStatus,
      copiedFromCaseNumber,
      canDelete,
    };
  } catch (error: any) {
    console.error("[getCaseDetails] CRITICAL DATABASE ERROR:", error);
    return {
      _error: "SystemError",
      _debug: { 
        message: error.message, 
        stack: error.stack,
        caseId,
        identity: { userId, userRole, orgId, userEmail }
      }
    } as any;
  }
}

/**
 * El dentista acepta una oferta: 
 * Se asigna el técnico y el caso pasa a estar 'enProgreso'.
 */
export async function acceptBidAction(caseId: string, bidId: string, technicianId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autenticado" };

  try {
    return await db.transaction(async (tx) => {
      // 1. Marcar la oferta ganadora como 'accepted'
      await tx.update(bid)
        .set({ status: 'accepted', updatedAt: new Date() })
        .where(eq(bid.id, bidId));

      // 2. Cerrar la ronda comercial activa si existe
      const [currentBid] = await tx.select({ roundId: bid.roundId }).from(bid).where(eq(bid.id, bidId)).limit(1);
      if (currentBid?.roundId) {
        await tx.update(commercialRound)
          .set({ status: 'closed', endDate: new Date() })
          .where(eq(commercialRound.id, currentBid.roundId));
      }

      // 3. Seleccionar y rechazar todas las ofertas pendientes restantes
      const rejectedBids = await tx.select({ id: bid.id, technicianId: bid.technicianId })
        .from(bid)
        .where(and(
          eq(bid.clinicalCaseId, caseId),
          ne(bid.id, bidId),
          eq(bid.status, 'pending')
        ));

      if (rejectedBids.length > 0) {
        await tx.update(bid)
          .set({
            status: 'rejected',
            rejectionReason: 'El caso fue asignado a otro técnico.',
            updatedAt: new Date()
          })
          .where(inArray(bid.id, rejectedBids.map(rb => rb.id)));
      }

      // 4. Registrar evento de aceptación en UCH (visible para el técnico ganador)
      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'negociacion',
        action: 'OFERTA_ACEPTADA',
        content: '¡Tu oferta fue seleccionada! El caso te ha sido asignado. Cuando estés listo, inicia el proceso de diseño desde este panel.',
        payload: { bidId, technicianId, visibleTo: 'tecnico' },
        stateChange: { from: 'publicado', to: 'aceptado' }
      }, tx);

      // 5. Registrar evento de rechazo en el hilo de cada técnico perdedor
      for (const rb of rejectedBids) {
        await logCaseEvent({
          caseId,
          userId: identity.id as string,
          type: 'negociacion',
          action: 'OFERTA_RECHAZADA',
          content: 'Gracias por tu propuesta. En esta ocasión el caso fue asignado a otro laboratorio. ¡Sigue participando en nuevos casos del marketplace!',
          payload: { bidId: rb.id, technicianId: rb.technicianId, visibleTo: 'tecnico' }
        }, tx);
      }

      // 6. Asignar técnico y actualizar estado del caso a 'aceptado'
      await tx.update(clinicalCase)
        .set({
          assignedTechnicianId: technicianId,
          status: 'aceptado',
          assignedAt: new Date(),
          lastActivityAt: new Date(),
          currentResponsibility: 'tecnico',
          updatedAt: new Date()
        })
        .where(eq(clinicalCase.id, caseId));

      return { success: true };
    });
  } catch (error) {
    console.error("[acceptBidAction] Error:", error);
    return { success: false, error: String(error) };
  }
}


/**
 * El técnico envía el trabajo final o avance para revisión del dentista.
 */
export async function submitReviewAction(caseId: string, notes: string, files: string[] = []) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autorizado" };
  const userId = identity.id;

  if (!Array.isArray(files) || files.length === 0) {
    return { success: false, error: "Debes adjuntar al menos un archivo de diseño para revisión." };
  }

  const guarded = await guardTextOrFail({
    actionName: 'submitReviewAction',
    caseId,
    identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
    fields: [{ text: notes, field: 'deliveryNotes' }],
  });
  if (!guarded.ok) {
    // El cliente debería haber pre-validado el texto antes del upload, pero si
    // llegó algo a GCS (race condition o bypass del precheck), limpiamos
    // best-effort para no acumular archivos huérfanos.
    if (files.length > 0) {
      try {
        await GCPStorageService.deleteFiles(files);
      } catch (e) {
        console.warn('[submitReviewAction] Error limpiando GCS tras guard:', e);
      }
    }
    return { success: false, error: guarded.error };
  }

  try {
    return await db.transaction(async (tx) => {
      // 1. Obtener versión actual de entregas
      const [lastDelivery]: any = await tx.execute(sql`
        SELECT version FROM clinical_case_delivery 
        WHERE clinical_case_id = ${caseId} 
        ORDER BY version DESC LIMIT 1
      `);
      const nextVersion = (lastDelivery?.version || 0) + 1;

      const userName = identity.fullName || 'Técnico';
      const newHistoryEntry = {
        action: 'REVISION_ENVIADA',
        timestamp: new Date().toISOString(),
        userName: userName,
        comment: notes,
        metadata: { deliveryVersion: nextVersion }
      };

      // 2. Crear registro de entrega
      await tx.insert(clinicalCaseDelivery as any).values({
        clinicalCaseId: caseId,
        technicianId: userId,
        version: nextVersion,
        notes: notes,
        files: files,
        status: 'pending'
      });

      const whereConditions = [eq(clinicalCase.id, caseId)];
      if (!identity.isSystemAdmin) {
        whereConditions.push(eq(clinicalCase.assignedTechnicianId, userId as string));
      }


      // 3. Actualizar caso
      const [updatedCase] = await tx.update(clinicalCase)
        .set({ 
          status: 'enRevision',
          labNotes: notes,
          currentResponsibility: 'dentista',
          lastActivityAt: new Date(),

          updatedAt: new Date()
        })
        .where(and(...whereConditions))
        .returning();

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'tecnico',
        action: CASE_EVENTS.REVISION_ENVIADA,
        content: notes || `Entrega v${nextVersion} lista para revisión.`,
        payload: { deliveryVersion: nextVersion, files, visibleTo: 'ambos' },
        stateChange: { from: 'enEjecucion', to: 'enRevision' }
      }, tx);



      if (!updatedCase) {
        throw new Error("No se pudo actualizar el caso. Verifica que eres el técnico asignado.");
      }

      await notifyUser(updatedCase.doctorId as string, 'REVISION_PENDIENTE', { caseId, version: nextVersion });

      return { success: true, version: nextVersion };
    });
  } catch (error) {
    console.error("Error submitting review:", error);
    return { success: false, error: "Fallo al enviar a revisión" };
  }
}

/**
 * Añade un comentario técnico a la iteración de entregas sin cambiar el estado del caso necesariamente,
 * a menos que se especifique.
 */
export async function addTechnicalCommentAction(caseId: string, comment: string, isRevisionRequest: boolean = false, targetTechnicianId?: string) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autorizado" };

  try {
    const userName = identity.fullName || identity.fullName || 'Usuario';
    const actionType = isRevisionRequest ? CASE_EVENTS.REVISION_SOLICITADA : CASE_EVENTS.COMENTARIO_TECNICO;

    const newHistoryEntry = {
      action: actionType,
      timestamp: new Date().toISOString(),
      userName: userName,
      comment: comment,
      metadata: { 
        userId: identity.id,
        role: identity.role
      }
    };

    const updateData: any = {
      lastActivityAt: new Date(),
      updatedAt: new Date()
    };

    // Si es una solicitud de revisión formal, cambiamos responsabilidad y estado
    if (isRevisionRequest) {
      updateData.status = 'enEjecucion';
      updateData.currentResponsibility = 'tecnico';
    }

    await db.update(clinicalCase)
      .set(updateData)
      .where(eq(clinicalCase.id, caseId));

    // Registrar en la nueva tabla (UCH)
    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'tecnico',
      action: isRevisionRequest ? CASE_EVENTS.REVISION_SOLICITADA : CASE_EVENTS.COMENTARIO_TECNICO,
      content: comment,
      payload: { role: identity.role, technicianId: targetTechnicianId, visibleTo: 'ambos' },
      stateChange: isRevisionRequest ? { from: 'enRevision', to: 'enProgreso' } : {}
    });

    return { success: true };
  } catch (error) {
    console.error("Error adding technical comment:", error);
    return { success: false, error: "Fallo al enviar comentario" };
  }
}

/**
 * Obtiene los archivos de una entrega con auditoría de seguridad.
 */
export async function getDeliveryFilesAction(deliveryId: string) {
  const identity = await getServerIdentity();
  if (!identity?.id) throw new Error("No autorizado");

  try {
    const delivery = await db.query.clinicalCaseDelivery.findFirst({
      where: eq(sql`id`, deliveryId),
      with: { clinicalCase: true }
    });

    if (!delivery) throw new Error("Entrega no encontrada");

    const isOwner = delivery.clinicalCase.doctorId === identity.id;
    const isAssignedTech = delivery.clinicalCase.assignedTechnicianId === identity.id;

    if (!isOwner && !isAssignedTech && !identity.isSystemAdmin) {
      throw new Error("Acceso denegado a archivos de entrega");
    }

    return { success: true, files: delivery.files || [] };
  } catch (error) {
    console.error("[getDeliveryFilesAction] Error:", error);
    return { success: false, error: "Error de seguridad al acceder a archivos" };
  }
}

export async function transitionToManufacturingAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autorizado" };

  try {
    const [existing] = await db
      .select({
        status: clinicalCase.status,
        assignedTechnicianId: clinicalCase.assignedTechnicianId,
        needsFabrication: clinicalCase.needsFabrication,
        serviceType: clinicalCase.serviceType,
        doctorId: clinicalCase.doctorId,
      })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    if (!existing) return { success: false, error: "Caso no encontrado" };
    if (existing.status !== CASE_STATUSES.DISENO_APROBADO) {
      return { success: false, error: "El caso no está en diseño aprobado" };
    }
    if (existing.assignedTechnicianId !== identity.id) {
      return { success: false, error: "Solo el técnico asignado puede iniciar fabricación" };
    }
    const mayManufacture =
      existing.serviceType === 'integral' || Boolean(existing.needsFabrication);
    if (!mayManufacture) {
      return { success: false, error: "Este caso no tiene fase de fabricación en plataforma" };
    }

    const [updated] = await db
      .update(clinicalCase)
      .set({
        status: CASE_STATUSES.EN_FABRICACION,
        completedAt: null,
        currentResponsibility: 'tecnico',
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clinicalCase.id, caseId),
          eq(clinicalCase.status, CASE_STATUSES.DISENO_APROBADO),
          eq(clinicalCase.assignedTechnicianId, identity.id as string),
        ),
      )
      .returning();

    if (!updated) {
      return { success: false, error: "No se pudo actualizar el caso (estado ya cambió)" };
    }

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'tecnico',
      action: CASE_EVENTS.FABRICACION_INICIADA,
      content: 'He iniciado la fase de fabricación física.',
      payload: { visibleTo: 'ambos' },
      stateChange: { from: CASE_STATUSES.DISENO_APROBADO, to: CASE_STATUSES.EN_FABRICACION },
    });
    await notifyUser(updated.doctorId as string, 'FABRICACION_INICIADA', { caseId });

    return { success: true };
  } catch (error) {
    console.error("[transitionToManufacturingAction] Error:", error);
    return { success: false, error: "Fallo al iniciar fabricación" };
  }
}

/**
 * El dentista aprueba el trabajo y cierra el caso.
 */
export async function registerDispatchAction(caseId: string, dispatchData: { courier: string, trackingId: string, photos?: string[] }) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autorizado" };

  const trackingId = String(dispatchData.trackingId ?? '').trim();
  const courier = String(dispatchData.courier ?? '').trim() || 'Interno';
  if (!trackingId || trackingId.toUpperCase() === 'N/A') {
    return {
      success: false,
      error: 'Indica un número de seguimiento, enlace o referencia de despacho.',
    };
  }

  const guarded = await guardTextOrFail({
    actionName: 'registerDispatchAction',
    caseId,
    identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
    fields: [
      { text: trackingId, field: 'dispatchTracking' },
      { text: courier, field: 'dispatchCourier' },
    ],
  });
  if (!guarded.ok) return { success: false, error: guarded.error };

  try {
    const [updated] = await db.update(clinicalCase)
      .set({
        status: 'enviado',
        dispatchInfo: {
          ...dispatchData,
          courier,
          trackingId,
          status: 'shipped',
          shippedAt: new Date().toISOString(),
        },
        lastActivityAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(clinicalCase.id, caseId),
        eq(clinicalCase.assignedTechnicianId, identity.id as string)
      ))
      .returning();

    if (updated) {
      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'tecnico',
        action: CASE_EVENTS.CASO_DESPACHADO,
        content: `He registrado el despacho vía ${courier}. Tracking: ${trackingId}`,
        payload: { courier, trackingId, photos: dispatchData.photos, visibleTo: 'ambos' },
        stateChange: { from: 'fabricacion', to: 'despachado' }
      });
      await notifyUser(updated.doctorId as string, 'CASO_DESPACHADO', {
        caseId,
        trackingId: dispatchData.trackingId,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("[registerDispatchAction] Error:", error);
    return { success: false, error: "Fallo al registrar despacho" };
  }
}

export async function confirmReceptionAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autorizado" };

  try {
    const [updated] = await db.update(clinicalCase)
      .set({
        status: 'completado',
        dispatchInfo: sql`dispatch_info || '{"status": "delivered"}'::jsonb`,
        currentResponsibility: null,
        lastActivityAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(clinicalCase.id, caseId),
        eq(clinicalCase.doctorId, identity.id as string)
      ))
      .returning();

    if (updated && updated.assignedTechnicianId) {
      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.RECEPCION_CONFIRMADA,
        content: 'He confirmado la recepción física de la pieza.',
        payload: { visibleTo: 'dentista' },
        stateChange: { from: 'despachado', to: 'completado' }
      });
      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.RECEPCION_CONFIRMADA,
        content: 'El solicitante confirmó la recepción del trabajo.',
        payload: { visibleTo: 'tecnico' },
      });
      await notifyUser(updated.assignedTechnicianId, 'RECEPCION_CONFIRMADA', { caseId });
    }

    // Caso cerrado en estado terminal: marca archivos para lifecycle policy.
    await archiveCaseFilesBestEffort(caseId);

    return { success: true };
  } catch (error) {
    console.error("[confirmReceptionAction] Error:", error);
    return { success: false, error: "Fallo al confirmar recepción" };
  }
}

export async function submitUserRatingAction(data: { caseId: string, revieweeId: string, rating: number, comment?: string }) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autorizado" };

  try {
    await db.insert(review).values({
      clinicalCaseId: data.caseId,
      reviewerId: identity.id,
      revieweeId: data.revieweeId,
      rating: data.rating,
      comment: data.comment,
    });

    // S8-08: Recalcular niveles efectivos del técnico basado en desempeño real
    const [reviewee] = await db.select({ role: user.role }).from(user).where(eq(user.id, data.revieweeId)).limit(1);
    if (reviewee?.role === 'tecnico') {
      const [avgResult] = await db
        .select({ avg: avg(review.rating) })
        .from(review)
        .where(eq(review.revieweeId, data.revieweeId));

      const avgRating = parseFloat(String(avgResult?.avg ?? '5'));

      // Calcular penalización de nivel: -0 si >=4.0 | -1 si >=3.0 | -2 si <3.0
      const penalty = avgRating >= 4.0 ? 0 : avgRating >= 3.0 ? 1 : 2;

      const skills = await db.select().from(technicianSkill).where(eq(technicianSkill.userId, data.revieweeId));
      for (const skill of skills) {
        await db.update(technicianSkill)
          .set({
            effectiveDesignLevel: Math.max(1, (skill.designLevel ?? 1) - penalty),
            effectiveFabricationLevel: skill.fabricationLevel ? Math.max(0, skill.fabricationLevel - penalty) : 0,
          })
          .where(and(eq(technicianSkill.userId, data.revieweeId), eq(technicianSkill.workType, skill.workType)));
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error submitting rating:", error);
    return { success: false, error: "Fallo al enviar calificación" };
  }
}

export async function releaseEscrowAction(caseId: string) {
  return { success: true, transactionId: `TX-${Date.now()}` };
}

export async function approveWorkAction(
  caseId: string,
  dentistComment?: string,
): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity) return { success: false, error: "No autorizado" };
  const { orgId, isSystemAdmin } = identity;
  if (!orgId && !isSystemAdmin) return { success: false, error: "No autorizado" };

  const approvalNote = typeof dentistComment === 'string' ? dentistComment.trim() : '';

  try {
    const txResult = await db.transaction(async (tx) => {
      const userName = identity.fullName || 'Dentista';

      const newHistoryEntry = {
        action: 'TRABAJO_APROBADO',
        timestamp: new Date().toISOString(),
        userName: userName,
        comment: approvalNote
          ? `Trabajo aprobado por el dentista. Comentario: ${approvalNote}`
          : 'Trabajo aprobado satisfactoriamente por el dentista.',
      };

      // 1. Marcar la última entrega como aprobada
      await tx.execute(sql`
        UPDATE clinical_case_delivery 
        SET status = 'approved', reviewed_at = now()
        WHERE clinical_case_id = ${caseId} AND status = 'pending'
      `);

      // 2. Datos del caso para decidir el siguiente estado (fabricación sigue al diseño si el caso la incluye).
      const [caseData] = await tx
        .select({
          needsFabrication: clinicalCase.needsFabrication,
          serviceType: clinicalCase.serviceType,
        })
        .from(clinicalCase)
        .where(eq(clinicalCase.id, caseId))
        .limit(1);

      const isSoloDiseno = caseData?.serviceType
        ? caseData.serviceType === 'solo_diseno'
        : !caseData?.needsFabrication;
      const shouldGoToFabrication = !isSoloDiseno && Boolean(caseData?.needsFabrication);
      // Modelo v3: solo_diseno → completado. Casos con fabricación (integral / legacy needsFabrication) → enFabricacion.
      const nextStatus = shouldGoToFabrication
        ? 'enFabricacion'
        : isSoloDiseno
          ? 'completado'
          : 'disenoAprobado';
      const isTerminalDesign = nextStatus === 'completado' || nextStatus === 'disenoAprobado';

      const baseUchMessage =
        nextStatus === 'completado'
          ? 'He aprobado el diseño. El caso ha sido completado.'
          : nextStatus === 'disenoAprobado'
            ? 'He aprobado el diseño. El flujo de diseño ha finalizado.'
            : 'He aprobado el diseño. El caso pasa a fase de fabricación física.';
      const uchContent = approvalNote
        ? `${baseUchMessage}\n\nComentario:\n${approvalNote}`
        : baseUchMessage;

      // 3. Actualizar caso
      const [updatedCase] = await tx.update(clinicalCase)
        .set({
          status: nextStatus,
          ...(isTerminalDesign ? { completedAt: new Date() } : {}),
          lastActivityAt: new Date(),
          currentResponsibility: isTerminalDesign ? null : 'tecnico',
          updatedAt: new Date()
        })
        .where(and(
          eq(clinicalCase.id, caseId),
          isSystemAdmin ? undefined : eq(clinicalCase.organizationId, orgId as string)
        ))
        .returning();
      
      if (updatedCase && updatedCase.assignedTechnicianId) {
        await notifyUser(updatedCase.assignedTechnicianId, 'TRABAJO_APROBADO', { caseId });
      }

      // Registrar en la nueva tabla (UCH)
      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.TRABAJO_APROBADO,
        content: uchContent,
        payload: {
          nextStatus,
          visibleTo: 'ambos',
          ...(approvalNote ? { dentistApprovalComment: approvalNote } : {}),
        },
        stateChange: { from: 'enRevision', to: nextStatus }
      }, tx);

      return { success: true as const, terminal: isTerminalDesign };
    });

    // Si el caso quedó en estado terminal de diseño (completado / disenoAprobado),
    // marca los archivos para que la lifecycle policy los migre a clases más baratas.
    if (txResult.success && txResult.terminal) {
      await archiveCaseFilesBestEffort(caseId);
    }

    return { success: true };
  } catch (error) {
    console.error("Error approving work:", error);
    return { success: false, error: "Fallo al aprobar el trabajo" };
  }
}

/**
 * El dentista pide una revisión/ajuste al técnico.
 */
export async function requestRevisionAction(caseId: string, reason: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity) return { success: false, error: "No autorizado" };
  const { orgId, isSystemAdmin } = identity;
  if (!orgId && !isSystemAdmin) return { success: false, error: "No autorizado" };

  const guarded = await guardTextOrFail({
    actionName: 'requestRevisionAction',
    caseId,
    identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
    fields: [{ text: reason, field: 'revisionReason' }],
  });
  if (!guarded.ok) return { success: false, error: guarded.error };

  try {
    return await db.transaction(async (tx) => {
      const userName = identity.fullName || 'Dentista';

      const newHistoryEntry = {
        action: 'REVISION_SOLICITADA',
        timestamp: new Date().toISOString(),
        userName: userName,
        comment: reason
      };

      // 1. Marcar la última entrega como rechazada
      await tx.execute(sql`
        UPDATE clinical_case_delivery 
        SET status = 'rejected', reviewed_at = now(), review_comment = ${reason}
        WHERE clinical_case_id = ${caseId} AND status = 'pending'
      `);

      // 2. Actualizar caso (el motivo de revisión queda en delivery.review_comment y en el evento UCH, no en doctor_notes)
      const [updatedCase] = await tx.update(clinicalCase)
        .set({
          status: 'enEjecucion',
          currentResponsibility: 'tecnico',
          lastActivityAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(
          eq(clinicalCase.id, caseId),
          isSystemAdmin ? undefined : eq(clinicalCase.organizationId, orgId as string)
        ))
        .returning();

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.REVISION_SOLICITADA,
        content: `${reason}`,
        payload: {
          reason,
          /** Bitácora compartida: el solicitante debe ver su propia solicitud en el UCH; el técnico sigue viendo voz Fauchard vía presentationAuthor. */
          visibleTo: 'ambos',
          ...UCH_PAYLOAD_PRESENTATION_FAUCHARD,
        },
        stateChange: { from: 'enRevision', to: 'enEjecucion' }
      }, tx);
      
      if (updatedCase && updatedCase.assignedTechnicianId) {
        await notifyUser(updatedCase.assignedTechnicianId, 'CAMBIOS_SOLICITADOS', { caseId, reason });
      }

      return { success: true };
    });
  } catch (error) {
    console.error("Error requesting revision:", error);
    return { success: false, error: "Fallo al solicitar revisión" };
  }
}

/**
 * Solicita un cambio de flujo (Pausa o Cancelación) que requiere mutuo acuerdo.
 */
export async function requestFlowChangeAction(caseId: string, type: 'pausa' | 'cancelacion', reason: string) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autenticado" };

  const reasonTrim = (reason ?? '').trim();
  if (reasonTrim.length < 3) {
    return { success: false, error: 'Indica un motivo (mín. 3 caracteres).' };
  }

  const guarded = await guardTextOrFail({
    actionName: 'requestFlowChangeAction',
    caseId,
    identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
    fields: [{ text: reasonTrim, field: 'flowChangeReason' }],
  });
  if (!guarded.ok) return { success: false, error: guarded.error };

  try {
    const [cCase] = await db
      .select({
        id: clinicalCase.id,
        doctorId: clinicalCase.doctorId,
        assignedTechnicianId: clinicalCase.assignedTechnicianId,
      })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    if (!cCase) return { success: false, error: 'Caso no encontrado' };

    const isDoctor = cCase.doctorId === identity.id;
    const isAssignedTech = cCase.assignedTechnicianId === identity.id;
    if (!isDoctor && !isAssignedTech && !identity.isSystemAdmin) {
      return { success: false, error: 'Solo el dentista o el técnico asignado pueden solicitar este cambio.' };
    }

    await db
      .update(clinicalCase)
      .set({
        pendingActionRequest: type,
        pendingActionActor: identity.id as string,
        updatedAt: new Date(),
        doctorNotes: type === 'cancelacion' ? `SOLICITUD CANCELACIÓN: ${reasonTrim}` : undefined,
        labNotes: type === 'pausa' ? `SOLICITUD PAUSA: ${reasonTrim}` : undefined,
      })
      .where(eq(clinicalCase.id, caseId));

    const verbLabel = type === 'pausa' ? 'pausar el caso' : 'cancelar el caso';
    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: CASE_EVENTS.SOLICITUD_CAMBIO_FLUJO,
      content: `Solicité ${verbLabel}. Motivo: ${reasonTrim}`,
      payload: {
        visibleTo: 'ambos',
        flowChangeType: type,
        reason: reasonTrim,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("[requestFlowChangeAction] Error:", error);
    return { success: false, error: "Fallo al solicitar el cambio" };
  }
}

/**
 * Resuelve una solicitud de cambio de flujo (Aprobar o Rechazar).
 */
export async function resolveFlowRequestAction(caseId: string, approve: boolean) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autenticado" };

  try {
    const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);

    if (!cCase?.pendingActionRequest) return { success: false, error: "No hay solicitudes pendientes" };
    if (cCase.pendingActionActor === identity.id) return { success: false, error: "No puedes aprobar tu propia solicitud" };

    if (!approve) {
      const flowType = cCase.pendingActionRequest;
      const flowWord = flowType === 'pausa' ? 'pausa' : 'cancelación';
      await db
        .update(clinicalCase)
        .set({ pendingActionRequest: null, pendingActionActor: null, updatedAt: new Date() })
        .where(eq(clinicalCase.id, caseId));

      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'sistema',
        action: CASE_EVENTS.SOLICITUD_CAMBIO_FLUJO_RECHAZADA,
        content: `No acepté la solicitud de ${flowWord} del flujo.`,
        payload: { visibleTo: 'ambos', flowChangeType: flowType, approved: false },
      });

      return { success: true, action: 'rejected' };
    }

    const newStatus = cCase.pendingActionRequest === 'pausa' ? 'pausado' : 'cancelado';

    await db.update(clinicalCase)
      .set({
        status: newStatus,
        pendingActionRequest: null,
        pendingActionActor: null,
        updatedAt: new Date(),
        lastActivityAt: new Date()
      })
      .where(eq(clinicalCase.id, caseId));

    const outcomeAction =
      newStatus === 'pausado' ? CASE_EVENTS.CASO_PAUSADO : CASE_EVENTS.CASO_CANCELADO;
    const outcomeContent =
      newStatus === 'pausado'
        ? 'Acordamos pausar el caso.'
        : 'Acordamos cancelar el caso.';

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: outcomeAction,
      content: outcomeContent,
      payload: { visibleTo: 'ambos' },
      stateChange: { from: cCase.status, to: newStatus }
    });

    return { success: true, action: 'approved', status: newStatus };
  } catch (error) {
    console.error("[resolveFlowRequestAction] Error:", error);
    return { success: false, error: "Fallo al procesar la respuesta" };
  }
}

/**
 * Reanuda un trabajo pausado. Solo permitido para dentista o técnico asignado.
 */
export async function resumeWorkAction(caseId: string, comment: string, isRevisionRequest?: boolean) {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autenticado" };

  const guarded = await guardTextOrFail({
    actionName: 'resumeWorkAction',
    caseId,
    identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
    fields: [{ text: comment, field: 'resumeComment' }],
  });
  if (!guarded.ok) return { success: false, error: guarded.error };

  try {
    const userName = identity.fullName || 'Usuario';
    const newHistoryEntry = {
      action: 'REANUDADO',
      timestamp: new Date().toISOString(),
      userName: userName,
      comment: comment || 'El trabajo se ha reanudado satisfactoriamente.',
      metadata: { isRevisionRequest }
    };

    await db.update(clinicalCase)
      .set({
        status: 'enEjecucion',
        lastActivityAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(clinicalCase.id, caseId));

    // Registrar en la nueva tabla (UCH)
    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'tecnico',
      action: CASE_EVENTS.REANUDADO,
      content: comment || 'He reanudado el trabajo en este caso.',
      payload: { visibleTo: 'ambos', isRevisionRequest: !!isRevisionRequest },
    });
    return { success: true };
  } catch (error) {
    console.error("Error resuming work:", error);
    return { success: false, error: "Fallo al reanudar" };
  }
}

/**
 * Actualiza los datos de un caso garantizando la propiedad.
 */
export async function updateClinicalCaseAction(caseId: string, data: any) {
  const identity = await getServerIdentity();
  const orgId = identity?.orgId;
  if (!orgId) throw new Error("No autorizado");

  const guarded = await guardTextOrFail({
    actionName: 'updateClinicalCaseAction',
    caseId,
    identity: { id: identity!.id, orgId: identity!.orgId, role: identity!.role },
    fields: [
      { text: data?.doctorNotes, field: 'doctorNotes' },
      { text: data?.specialInstructions, field: 'specialInstructions' },
      { text: data?.notesEsthetic, field: 'notesEsthetic' },
      { text: data?.notesOclusal, field: 'notesOclusal' },
    ],
  });
  if (!guarded.ok) throw new Error(guarded.error);

  try {
    const resolved = await resolveCatalogCodesToIds(data);
    const setPayload: Record<string, unknown> = { ...resolved, updatedAt: new Date() };
    if (Object.prototype.hasOwnProperty.call(data, 'doctorNotes')) {
      // El formulario de ficha usa `doctorNotes` como texto único; se persiste en `special_instructions`.
      // Evitar duplicar el mismo valor en `doctor_notes` (resúmenes / publicar mostraban dos filas iguales).
      setPayload.specialInstructions = data.doctorNotes ?? null;
      setPayload.doctorNotes = null;
    }

    const [updated] = await db
      .update(clinicalCase)
      .set(setPayload as any)
      .where(
        and(
            eq(clinicalCase.id, caseId),
            eq(clinicalCase.organizationId, orgId)
        )
      )
      .returning();

    // Registrar evento de actualización (UCH: sistema/negociacion según el contenido)
    const isPublication = data.status === 'publicado';
    
    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: isPublication ? 'sistema' : 'negociacion',
      action: isPublication ? 'PUBLICACION' : 'CASO_ACTUALIZADO',
      content: isPublication ? 'Caso publicado en el Marketplace.' : 'Especificaciones del caso actualizadas por el dentista.',
      payload: { updatedFields: Object.keys(data), visibleTo: 'dentista' },
      stateChange: isPublication ? { from: 'borrador', to: 'publicado' } : undefined
    });

    return updated;
  } catch (error) {
    console.error("[updateClinicalCaseAction] Error:", error);
    throw error;
  }
}

/**
 * Crea un caso clínico forzando el ID de organización de la sesión.
 */
export async function createClinicalCaseAction(data: any) {
  const identity = await getServerIdentity();
  const orgId = identity?.orgId;
  const userId = identity?.id;
  if (!orgId || !userId) throw new Error("No autorizado");

  const guarded = await guardTextOrFail({
    actionName: 'createClinicalCaseAction',
    identity: { id: userId, orgId, role: identity!.role },
    fields: [
      { text: data?.doctorNotes, field: 'doctorNotes' },
      { text: data?.specialInstructions, field: 'specialInstructions' },
      { text: data?.notesEsthetic, field: 'notesEsthetic' },
      { text: data?.notesOclusal, field: 'notesOclusal' },
    ],
  });
  if (!guarded.ok) throw new Error(guarded.error);

  try {
    const caseNumber = await getNextCaseNumber();
    const resolved = await resolveCatalogCodesToIds(data);

    const [newCase] = await db
      .insert(clinicalCase)
      .values({
        ...resolved,
        specialInstructions: data.specialInstructions ?? data.doctorNotes ?? null,
        doctorNotes: null,
        caseNumber,
        organizationId: orgId,
        doctorId: userId,
        status: 'borrador',
        internalStatus: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        commercialVersion: 1,
        canBeDeleted: true,
      } as any)
      .returning();

    await logCaseEvent({
      caseId: newCase.id,
      userId: userId as string,
      type: 'sistema',
      action: CASE_EVENTS.CASO_CREADO,
      content: `He creado el caso ${newCase.caseNumber}. Puedes editarlo antes de publicarlo.`,
      payload: { visibleTo: 'dentista' },
      stateChange: { to: 'borrador' }
    });

    return newCase;
  } catch (error) {
    console.error("[createClinicalCaseAction] Error:", error);
    throw error;
  }
}

/**
 * Evaluador central para decidir si un caso puede ser borrado.
 * Basado en transacciones reales (BL-015).
 */
export async function canDeleteCase(caseId: string) {
  try {
    // 1. Si hay ofertas, no se puede borrar
    const [bidsCount] = await db.select({ count: sql<number>`count(*)` }).from(bid).where(eq(bid.clinicalCaseId, caseId));
    if (Number(bidsCount.count) > 0) return false;

    // 2. Si tiene técnico asignado o está archivado, no se puede borrar
    const [cCase] = await db.select({
      status: clinicalCase.status,
      assignedId: clinicalCase.assignedTechnicianId,
    }).from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);

    if (!cCase) return false;
    if (cCase.status !== CASE_STATUSES.BORRADOR) return false;
    if (cCase.assignedId) return false;

    return true;
  } catch (error) {
    console.error("[canDeleteCase] Error:", error);
    return false;
  }
}

/** Archiva el caso solo para el usuario actual (no cambia status). */
export async function archiveCaseForUserAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };

  const guard = await assertUserMayArchiveCase(
    caseId,
    identity.id as string,
    identity.role as string,
  );
  if (!guard.ok) return { success: false, error: guard.error };

  try {
    await db
      .insert(caseUserArchive)
      .values({
        userId: identity.id as string,
        clinicalCaseId: caseId,
        archivedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [caseUserArchive.userId, caseUserArchive.clinicalCaseId],
        set: { archivedAt: new Date() },
      });

    return { success: true };
  } catch (error) {
    console.error('[archiveCaseForUserAction] Error:', error);
    return { success: false, error: 'No se pudo archivar el caso' };
  }
}

/** @deprecated Alias — usar archiveCaseForUserAction */
export async function archiveClinicalCaseAction(caseId: string) {
  return archiveCaseForUserAction(caseId);
}

export async function unarchiveCaseForUserAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autorizado' };

  try {
    await db
      .delete(caseUserArchive)
      .where(
        and(
          eq(caseUserArchive.userId, identity.id as string),
          eq(caseUserArchive.clinicalCaseId, caseId),
        ),
      );
    return { success: true };
  } catch (error) {
    console.error('[unarchiveCaseForUserAction] Error:', error);
    return { success: false, error: 'No se pudo restaurar el caso' };
  }
}

/**
 * Elimina un caso clínico (borrador): objetos GCS, filas file y caso en BD.
 * Si falla GCS, no se modifica la base de datos.
 */
export async function deleteClinicalCaseAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  const orgId = identity?.orgId;
  const userId = identity?.id;
  if (!orgId || !userId) return { success: false, error: 'No autorizado' };

  try {
    const isEligible = await canDeleteCase(caseId);
    if (!isEligible) {
      return {
        success: false,
        error:
          "Este caso tiene transacciones asociadas o actividad operativa y no puede ser eliminado. Use la opción de 'Archivar'.",
      };
    }

    const [caseRow] = await db
      .select({
        doctorId: clinicalCase.doctorId,
        organizationId: clinicalCase.organizationId,
      })
      .from(clinicalCase)
      .where(and(eq(clinicalCase.id, caseId), eq(clinicalCase.organizationId, orgId)))
      .limit(1);

    if (!caseRow) return { success: false, error: 'Caso no encontrado' };

    if (caseRow.doctorId !== userId && !identity.isSystemAdmin) {
      return { success: false, error: 'No autorizado' };
    }

    const [activeCopy] = await db
      .select({ id: clinicalCase.id, caseNumber: clinicalCase.caseNumber })
      .from(clinicalCase)
      .where(
        and(
          eq(clinicalCase.copiedFromCaseId, caseId),
          eq(clinicalCase.status, CASE_STATUSES.BORRADOR),
        ),
      )
      .limit(1);

    if (activeCopy) {
      const copyLabel = activeCopy.caseNumber ?? activeCopy.id.slice(0, 8);
      return {
        success: false,
        error: `Este caso tiene una copia en borrador (${copyLabel}). Abre la copia y elimínala desde ahí, o elimina la copia primero.`,
      };
    }

    const fileRows = await db
      .select({ gcsPath: file.gcsPath, thumbnailPath: file.thumbnailPath })
      .from(file)
      .where(eq(file.clinicalCaseId, caseId));

    const storagePaths = collectCaseStoragePaths(fileRows);

    if (storagePaths.length > 0) {
      try {
        await GCPStorageService.deleteFilesStrict(storagePaths);
      } catch (gcsError) {
        console.error('[deleteClinicalCaseAction] GCS:', gcsError);
        return {
          success: false,
          error: 'No se pudieron eliminar los archivos del caso. El borrador se mantiene intacto.',
        };
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(file).where(eq(file.clinicalCaseId, caseId));
      await tx
        .delete(clinicalCase)
        .where(and(eq(clinicalCase.id, caseId), eq(clinicalCase.organizationId, orgId)));
    });

    return { success: true };
  } catch (error) {
    console.error('[deleteClinicalCaseAction] Error:', error);
    return { success: false, error: 'Error interno al intentar eliminar el caso.' };
  }
}


/**
 * Obtiene casos asignados a un técnico asegurando que solo vea los suyos.
 */
export async function listTechnicianAssignedCases() {
  const identity = await getServerIdentity();
  if (!identity?.id) return [];

  try {
    return await db.query.clinicalCase.findMany({
      where: eq(clinicalCase.assignedTechnicianId, identity.id as string),
      with: {
        organization: true,
        files: true,
      },
      orderBy: [desc(clinicalCase.createdAt)],
    });
  } catch (error) {
    console.error("[listTechnicianAssignedCases] Error:", error);
    return [];
  }
}

/**
 * Retira un caso de publicación (BL-019, BL-020, BL-021).
 */
export async function withdrawCaseAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autorizado" };

  try {
    const [current] = await db
      .select({ status: clinicalCase.status, doctorId: clinicalCase.doctorId })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    if (!current) return { success: false, error: "Caso no encontrado" };
    if (current.doctorId !== identity.id) return { success: false, error: "No autorizado" };

    if (!['publicado', 'enEvaluacion', 'propuestaLista'].includes(current.status)) {
      return { success: false, error: "Este caso no se puede retirar en su estado actual" };
    }

    const [openInvites] = await db
      .select({ count: sql<number>`count(*)` })
      .from(caseInvitation)
      .where(and(
        eq(caseInvitation.clinicalCaseId, caseId),
        inArray(caseInvitation.status, ['pending', 'quoted'])
      ));

    if (Number(openInvites.count) > 0) {
      return { success: false, error: "No se puede retirar: hay cotizaciones abiertas" };
    }

    await db.update(clinicalCase)
      .set({ status: 'borrador', internalStatus: null, updatedAt: new Date(), lastActivityAt: new Date() })
      .where(eq(clinicalCase.id, caseId));

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: 'RETIRO_PUBLICACION',
      content: 'El dentista retiró el caso a borrador.',
      payload: { visibleTo: 'dentista' },
      stateChange: { from: current.status, to: 'borrador' }
    });

    return { success: true };
  } catch (error) {
    console.error("[withdrawCaseAction] Error:", error);
    return { success: false, error: "No se pudo retirar el caso" };
  }
}

/**
 * Republica un caso, abriendo una nueva ronda comercial (BL-022, BL-023).
 */
export async function republishCaseAction(caseId: string, changeSummary?: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.orgId) return { success: false, error: "No autorizado" };

  try {
    const result = await db.transaction(async (tx) => {
      // 0. Guard: el caso debe estar en estado 'borrador'
      const [guard] = await tx
        .select({ status: clinicalCase.status })
        .from(clinicalCase)
        .where(and(eq(clinicalCase.id, caseId), eq(clinicalCase.organizationId, identity.orgId)))
        .limit(1);
      if (!guard) return { success: false, error: "Caso no encontrado" };
      if (guard.status !== 'borrador') return { success: false, error: "Solo se puede republicar un caso en borrador" };

      // 1. Obtener última ronda para incrementar el número
      const [lastRound]: any = await tx.execute(sql`
        SELECT round_number, version_at_start FROM commercial_round
        WHERE clinical_case_id = ${caseId}
        ORDER BY round_number DESC LIMIT 1
      `);

      const nextRoundNumber = (lastRound?.round_number || 0) + 1;
      
      // 2. Incrementar versión comercial del caso
      const [cCase] = await tx.select({
        currentVersion: clinicalCase.commercialVersion,
        internalName: clinicalCase.internalName,
        patientIdAnon: clinicalCase.patientIdAnon,
        teeth: clinicalCase.teeth,
        restorationType: restorationTypeTable.label,
        material: dentalMaterial.label,
        shade: vitaShade.label,
        notesEsthetic: clinicalCase.notesEsthetic,
        notesOclusal: clinicalCase.notesOclusal,
        doctorNotes: clinicalCase.doctorNotes,
        specialInstructions: clinicalCase.specialInstructions,
        urgency: urgencyLevel.label,
      })
        .from(clinicalCase)
        .leftJoin(restorationTypeTable, eq(restorationTypeTable.id, clinicalCase.restorationTypeId))
        .leftJoin(dentalMaterial, eq(dentalMaterial.id, clinicalCase.materialId))
        .leftJoin(vitaShade, eq(vitaShade.id, clinicalCase.shadeId))
        .leftJoin(urgencyLevel, eq(urgencyLevel.id, clinicalCase.urgencyId))
        .where(eq(clinicalCase.id, caseId)).limit(1);
      
      const nextVersion = (cCase?.currentVersion || 1) + 1;

      // 3. Actualizar caso

      await tx.update(clinicalCase)
        .set({ 
          status: 'enEvaluacion',
          internalStatus: 'caso_recibido',
          canBeDeleted: false,
          commercialVersion: nextVersion,
          changeSummary: changeSummary || null,
          updatedAt: new Date(),
          lastActivityAt: new Date()
        })
        .where(and(eq(clinicalCase.id, caseId), eq(clinicalCase.organizationId, identity.orgId)));

      // Registrar en la nueva tabla (UCH)
      await logCaseEvent({
        caseId,
        userId: identity.id as string,
        type: 'negociacion',
        action: 'REPUBLICACION',
        content: changeSummary || 'Caso republicado con nuevas condiciones.',
        payload: {
          roundNumber: nextRoundNumber,
          version: nextVersion,
          visibleTo: 'dentista'
        },
        stateChange: { from: 'borrador', to: 'enEvaluacion' }
      });

      // 4. Crear nueva ronda con snapshot (BL-034)
      const snapshot = {
        internalName: cCase.internalName,
        patientIdAnon: cCase.patientIdAnon,
        teeth: cCase.teeth,
        restorationType: cCase.restorationType,
        material: cCase.material,
        shade: cCase.shade,
        notesEsthetic: cCase.notesEsthetic,
        notesOclusal: cCase.notesOclusal,
        doctorNotes: cCase.doctorNotes,
        specialInstructions: cCase.specialInstructions,
        urgency: cCase.urgency
      };

      await tx.insert(commercialRound as any).values({
        clinicalCaseId: caseId,
        roundNumber: nextRoundNumber,
        status: 'active',
        startDate: new Date(),
        versionAtStart: nextVersion,
        specsSnapshot: snapshot
      });

      return { success: true };
    });
    
    // Si la transacción falló (guards o error interno), retornamos el resultado
    if (!result.success) return result as ActionResult;

    // Run Fauchard outside the transaction
    const { classifyCaseAction, runFauchardAction, sendInvitationsAction } = await import('./fauchard');
    await classifyCaseAction(caseId);
    const selectionResult = await runFauchardAction(caseId);
    if (!selectionResult.success || !selectionResult.technicianIds?.length || !selectionResult.fauchardConfigId) {
      await db.update(clinicalCase)
        .set({ status: 'borrador', internalStatus: null, canBeDeleted: true, updatedAt: new Date(), lastActivityAt: new Date() })
        .where(eq(clinicalCase.id, caseId));
      return { success: false, error: selectionResult.error || 'No se encontraron técnicos disponibles para la republicación' };
    }
    await sendInvitationsAction(caseId, selectionResult.technicianIds, {
      fauchardConfigId: selectionResult.fauchardConfigId,
      pinCaseToConfig: true,
    });

    return { success: true };
  } catch (error) {
    console.error("[republishCaseAction] Error:", error);
    return { success: false, error: "No se pudo republicar el caso" };
  }
}

/**
 * Clona un caso terminal a un borrador nuevo (Crear copia). Archivos copiados en GCS.
 */
export async function cloneCaseFromTerminalAction(
  sourceCaseId: string,
): Promise<ActionResult & { newCaseId?: string; caseNumber?: string | null }> {
  const identity = await getServerIdentity();
  const orgId = identity?.orgId;
  const userId = identity?.id;
  if (!orgId || !userId) return { success: false, error: 'No autorizado' };

  const [source] = await db
    .select()
    .from(clinicalCase)
    .where(
      and(eq(clinicalCase.id, sourceCaseId), eq(clinicalCase.organizationId, orgId)),
    )
    .limit(1);

  if (!source) return { success: false, error: 'Caso no encontrado' };
  if (source.doctorId !== userId) return { success: false, error: 'No autorizado' };
  if (!isTerminalCaseStatus(source.status)) {
    return { success: false, error: 'Solo puedes copiar casos finalizados' };
  }

  const sourceFiles = await db
    .select()
    .from(file)
    .where(eq(file.clinicalCaseId, sourceCaseId));

  const newCaseId = randomUUID();
  const caseNumber = await getNextCaseNumber();
  const copiedGcsPaths: string[] = [];

  const mapPath = (path: string) =>
    path.replace(`/cases/${sourceCaseId}/`, `/cases/${newCaseId}/`);

  try {
    const fileRows: Array<typeof file.$inferInsert> = [];

    for (const srcFile of sourceFiles) {
      if (!srcFile.gcsPath) continue;
      const destGcs = mapPath(srcFile.gcsPath);
      await GCPStorageService.copyFile(srcFile.gcsPath, destGcs);
      copiedGcsPaths.push(destGcs);

      let destThumb: string | null = null;
      if (srcFile.thumbnailPath) {
        destThumb = mapPath(srcFile.thumbnailPath);
        await GCPStorageService.copyFile(srcFile.thumbnailPath, destThumb);
        copiedGcsPaths.push(destThumb);
      }

      fileRows.push({
        clinicalCaseId: newCaseId,
        organizationId: orgId,
        category: srcFile.category,
        filename: srcFile.filename,
        gcsPath: destGcs,
        mimeType: srcFile.mimeType,
        size: srcFile.size,
        subType: srcFile.subType,
        uploaderId: userId,
        thumbnailPath: destThumb,
      });
    }

    // Un caso clonado es un caso NUEVO: limpiamos `customTime` heredado del origen
    // para que el lifecycle no empiece a contar desde la fecha del caso terminal.
    if (copiedGcsPaths.length > 0) {
      await GCPStorageService.clearArchivalMark(copiedGcsPaths);
    }

    await db.transaction(async (tx) => {
      await tx.insert(clinicalCase).values({
        id: newCaseId,
        organizationId: orgId,
        doctorId: userId,
        internalName: source.internalName,
        materialId: source.materialId,
        needsFabrication: source.needsFabrication,
        notesEsthetic: source.notesEsthetic,
        notesOclusal: source.notesOclusal,
        patientIdAnon: source.patientIdAnon,
        restorationTypeId: source.restorationTypeId,
        shadeId: source.shadeId,
        teeth: source.teeth,
        urgencyId: source.urgencyId,
        serviceType: source.serviceType,
        caseComplexity: source.caseComplexity,
        specialInstructions: source.specialInstructions,
        doctorNotes: null,
        status: CASE_STATUSES.BORRADOR,
        internalStatus: null,
        caseNumber,
        commercialVersion: 1,
        changeSummary: null,
        canBeDeleted: true,
        isArchived: false,
        copiedFromCaseId: sourceCaseId,
        currentResponsibility: 'dentista',
        dispatchInfo: { courier: '', trackingId: '', status: 'pending', photos: [] },
        caseLeague: source.caseLeague,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActivityAt: new Date(),
      });

      if (fileRows.length > 0) {
        await tx.insert(file).values(fileRows);
      }

      await logCaseEvent(
        {
          caseId: newCaseId,
          userId,
          type: 'sistema',
          action: CASE_EVENTS.CASO_COPIA,
          content: `Copia del caso ${source.caseNumber ?? sourceCaseId.slice(0, 8)}.`,
          payload: {
            sourceCaseId,
            sourceCaseNumber: source.caseNumber,
            visibleTo: 'dentista',
          },
          stateChange: { to: CASE_STATUSES.BORRADOR },
        },
        tx,
      );
    });

    return { success: true, newCaseId, caseNumber };
  } catch (error) {
    console.error('[cloneCaseFromTerminalAction] Error:', error);
    if (copiedGcsPaths.length > 0) {
      await GCPStorageService.deleteFiles(copiedGcsPaths).catch(() => undefined);
    }
    return { success: false, error: 'No se pudo crear la copia del caso' };
  }
}

export async function publishCaseAction(caseId: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: "No autorizado" };

  try {
    const [current] = await db
      .select({
        status: clinicalCase.status,
        doctorId: clinicalCase.doctorId,
        publishedAt: clinicalCase.publishedAt,
      })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);

    if (!current) return { success: false, error: "Caso no encontrado" };
    if (current.doctorId !== identity.id) return { success: false, error: "No autorizado" };
    if (current.publishedAt) {
      return { success: false, error: 'Este caso ya fue publicado' };
    }
    if (current.status !== 'borrador') return { success: false, error: "Solo se puede publicar un caso en borrador" };

    await db.update(clinicalCase)
      .set({
        status: 'enEvaluacion',
        internalStatus: 'caso_recibido',
        canBeDeleted: false,
        publishedAt: new Date(),
        updatedAt: new Date(),
        lastActivityAt: new Date(),
      })
      .where(eq(clinicalCase.id, caseId));

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: CASE_EVENTS.CASO_PUBLICADO,
      content: 'He publicado el caso. Estamos buscando el laboratorio ideal para tu caso.',
      payload: { visibleTo: 'dentista', ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
      stateChange: { from: 'borrador', to: 'enEvaluacion' }
    });

    const { classifyCaseAction, runFauchardAction, sendInvitationsAction } = await import('./fauchard');
    await classifyCaseAction(caseId);
    const selectionResult = await runFauchardAction(caseId);
    if (!selectionResult.success || !selectionResult.technicianIds?.length || !selectionResult.fauchardConfigId) {
      await db.update(clinicalCase)
        .set({ status: 'borrador', internalStatus: null, canBeDeleted: true, updatedAt: new Date(), lastActivityAt: new Date() })
        .where(eq(clinicalCase.id, caseId));
      return { success: false, error: selectionResult.error || 'No se encontraron técnicos disponibles' };
    }
    await sendInvitationsAction(caseId, selectionResult.technicianIds, {
      fauchardConfigId: selectionResult.fauchardConfigId,
      pinCaseToConfig: true,
    });

    return { success: true };
  } catch (error) {
    console.error("[publishCaseAction] Error:", error);
    return { success: false, error: "No se pudo publicar el caso" };
  }
}
