'use server';

import { db } from '@/lib/db';
import { clinicalCase, clinicalCaseEvent, caseAssignment, caseQualityAssignment, qualityDerivationReason, user } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getServerIdentity } from './impersonation';
import { getConfigForCase, type FauchardConfigRow } from './fauchard';
import type { ActionResult } from '@/lib/types/actions';

export interface CaseTraceEvent {
  id: string;
  type: string;
  action: string;
  content: string | null;
  payload: unknown;
  stateChange: unknown;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
}

export interface CaseTraceAssignment {
  id: string;
  technicianId: string | null;
  technicianName: string | null;
  technicianEmail: string | null;
  status: string;
  assignedAt: Date | null;
  respondedAt: Date | null;
  expiresAt: Date | null;
  scoreAtAssignment: string | null;
  isReassignment: boolean;
  rejectionComment: string | null;
  rejectedAt: Date | null;
  compensation: number | null;
}

/**
 * Fila cruda de `case_quality_assignment` — fuente de verdad de la cadena de revisores de Calidad,
 * a diferencia del event log (donde el mismo `CASO_DERIVADO_CALIDAD` significó "transferencia
 * inmediata" en versiones antiguas del código y "solicitud pendiente de aceptar/rechazar" después).
 */
export interface CaseTraceQualityAssignment {
  id: string;
  calidadUserId: string;
  reviewerName: string | null;
  status: string;
  assignedAt: Date;
  firstViewedAt: Date | null;
  derivedToId: string | null;
  derivedToName: string | null;
  derivationReasonLabel: string | null;
  derivationComment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseTraceData {
  case: {
    id: string;
    caseNumber: string | null;
    status: string;
    internalStatus: string | null;
    doctorName: string | null;
    doctorEmail: string | null;
    createdAt: Date;
    listPriceCost: string | null;
    listPriceFeePercent: string | null;
    listPriceSale: string | null;
  };
  events: CaseTraceEvent[];
  assignments: CaseTraceAssignment[];
  qualityAssignments: CaseTraceQualityAssignment[];
  fauchardConfig: FauchardConfigRow | null;
  /** Nombres de usuarios referenciados por id dentro de `event.payload` (ej. calidadUserId, fromCalidadId, toCalidadId) — resueltos aparte porque el `content` histórico ya guardado no los incluye. */
  payloadUserNames: Record<string, string>;
}

/** Claves de `payload` que referencian un userId de Calidad — usadas para resolver nombres en la traza. */
const QUALITY_PAYLOAD_USER_KEYS = ['calidadUserId', 'fromCalidadId', 'toCalidadId'] as const;

/** Traza completa de un caso (admin-only): eventos sin enmascarar, historial de asignaciones y config Fauchard anclada. */
export async function getCaseTraceAction(caseCode: string): Promise<ActionResult<{ trace: CaseTraceData }>> {
  const identity = await getServerIdentity();
  if (!identity?.isSystemAdmin && identity?.role !== 'admin') {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const normalized = caseCode.trim();
    const whereClause = normalized.toUpperCase().startsWith('DF-')
      ? eq(clinicalCase.caseNumber, normalized.toUpperCase())
      : eq(clinicalCase.id, normalized);

    const [caseRow] = await db
      .select({
        id: clinicalCase.id,
        caseNumber: clinicalCase.caseNumber,
        status: clinicalCase.status,
        internalStatus: clinicalCase.internalStatus,
        createdAt: clinicalCase.createdAt,
        doctorName: user.fullName,
        doctorEmail: user.email,
        listPriceCost: clinicalCase.listPriceCost,
        listPriceFeePercent: clinicalCase.listPriceFeePercent,
        listPriceSale: clinicalCase.listPriceSale,
      })
      .from(clinicalCase)
      .leftJoin(user, eq(clinicalCase.doctorId, user.id))
      .where(whereClause)
      .limit(1);

    if (!caseRow) {
      return { success: false, error: 'Caso no encontrado' };
    }

    const derivedToUser = alias(user, 'derived_to_user');

    const [eventRows, assignmentRows, qualityAssignmentRows, fauchardConfig] = await Promise.all([
      db
        .select({
          id: clinicalCaseEvent.id,
          type: clinicalCaseEvent.type,
          action: clinicalCaseEvent.action,
          content: clinicalCaseEvent.content,
          payload: clinicalCaseEvent.payload,
          stateChange: clinicalCaseEvent.stateChange,
          createdAt: clinicalCaseEvent.createdAt,
          actorId: user.id,
          actorName: user.fullName,
          actorEmail: user.email,
          actorRole: user.role,
        })
        .from(clinicalCaseEvent)
        .leftJoin(user, eq(clinicalCaseEvent.userId, user.id))
        .where(eq(clinicalCaseEvent.clinicalCaseId, caseRow.id))
        .orderBy(clinicalCaseEvent.createdAt),
      db
        .select({
          id: caseAssignment.id,
          technicianId: user.id,
          technicianName: user.fullName,
          technicianEmail: user.email,
          status: caseAssignment.status,
          assignedAt: caseAssignment.assignedAt,
          respondedAt: caseAssignment.respondedAt,
          expiresAt: caseAssignment.expiresAt,
          scoreAtAssignment: caseAssignment.scoreAtAssignment,
          isReassignment: caseAssignment.isReassignment,
          rejectionComment: caseAssignment.rejectionComment,
          rejectedAt: caseAssignment.rejectedAt,
          compensation: caseAssignment.compensation,
        })
        .from(caseAssignment)
        .leftJoin(user, eq(caseAssignment.technicianId, user.id))
        .where(eq(caseAssignment.clinicalCaseId, caseRow.id))
        .orderBy(caseAssignment.assignedAt),
      db
        .select({
          id: caseQualityAssignment.id,
          calidadUserId: caseQualityAssignment.calidadUserId,
          reviewerName: user.fullName,
          status: caseQualityAssignment.status,
          assignedAt: caseQualityAssignment.assignedAt,
          firstViewedAt: caseQualityAssignment.firstViewedAt,
          derivedToId: caseQualityAssignment.derivedToId,
          derivedToName: derivedToUser.fullName,
          derivationReasonLabel: qualityDerivationReason.label,
          derivationComment: caseQualityAssignment.derivationComment,
          createdAt: caseQualityAssignment.createdAt,
          updatedAt: caseQualityAssignment.updatedAt,
        })
        .from(caseQualityAssignment)
        .leftJoin(user, eq(caseQualityAssignment.calidadUserId, user.id))
        .leftJoin(derivedToUser, eq(caseQualityAssignment.derivedToId, derivedToUser.id))
        .leftJoin(qualityDerivationReason, eq(caseQualityAssignment.derivationReasonId, qualityDerivationReason.id))
        .where(eq(caseQualityAssignment.clinicalCaseId, caseRow.id))
        .orderBy(caseQualityAssignment.assignedAt, caseQualityAssignment.createdAt),
      getConfigForCase(caseRow.id).catch(() => null),
    ]);

    const payloadUserIds = new Set<string>();
    for (const row of eventRows) {
      const payload = row.payload as Record<string, unknown> | null;
      if (!payload) continue;
      for (const key of QUALITY_PAYLOAD_USER_KEYS) {
        const value = payload[key];
        if (typeof value === 'string') payloadUserIds.add(value);
      }
    }

    const payloadUserNames: Record<string, string> = {};
    if (payloadUserIds.size > 0) {
      const rows = await db
        .select({ id: user.id, fullName: user.fullName })
        .from(user)
        .where(inArray(user.id, Array.from(payloadUserIds)));
      for (const r of rows) {
        payloadUserNames[r.id] = r.fullName ?? 'Revisor sin nombre';
      }
    }

    return {
      success: true,
      trace: {
        case: caseRow,
        events: eventRows,
        assignments: assignmentRows,
        qualityAssignments: qualityAssignmentRows,
        fauchardConfig,
        payloadUserNames,
      },
    };
  } catch (error) {
    console.error('[getCaseTraceAction] Error:', error);
    return { success: false, error: 'Error al obtener la traza del caso' };
  }
}
