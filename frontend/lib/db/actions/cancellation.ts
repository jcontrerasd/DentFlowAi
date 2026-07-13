'use server';

/**
 * Cancelación unilateral del dentista (v5.31). Reemplaza el flujo de pausa/mutuo
 * acuerdo (retirado): el dentista puede cancelar en cualquier momento del ciclo
 * activo del caso.
 *
 * - Momento A (ningún técnico aceptó aún: enEvaluacion con asignación pendiente
 *   o pendiente_pool, o fallo de asignación): gratis. Las asignaciones pending
 *   se anulan sin sancionar al técnico.
 * - Momento B (un técnico ya aceptó): se cobra el 100% del valor comprometido;
 *   el snapshot económico (listPriceSale/compensation) queda intacto como
 *   registro de lo devengado.
 */

import { db } from '@/lib/db';
import { clinicalCase, cancellationReason } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { CASE_STATUSES, INTERNAL_CASE_STATUSES } from '@/lib/constants/dental';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { POOL_INTERNAL_STATUS } from '@/lib/availabilityScore';
import { UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';
import { notifyUser } from '../../services/notifications';
import { getServerIdentity } from './impersonation';
import { logCaseEvent, closeCaseQualityAssignment } from './cases';
import { voidPendingAssignmentsForCase } from './assignment';
import { guardTextOrFail } from '@/lib/contactGuard/guardOrFail';
import type { ActionResult } from '@/lib/types/actions';

const MOMENT_A_STATUSES: string[] = [
  INTERNAL_CASE_STATUSES.SIN_ASIGNACION_FALLO,
  INTERNAL_CASE_STATUSES.SIN_COTIZACIONES_FALLO,
];

const MOMENT_B_STATUSES: string[] = [
  CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
  CASE_STATUSES.EN_EJECUCION,
  CASE_STATUSES.EN_REVISION_CALIDAD,
  CASE_STATUSES.CERTIFICADO_CALIDAD,
  CASE_STATUSES.EN_REVISION,
  CASE_STATUSES.CAMBIOS_EN_PROCESO,
];

type CancelMoment = 'A' | 'B';

function resolveCancelMoment(status: string | null, internalStatus: string | null): CancelMoment | null {
  if (status === CASE_STATUSES.EN_EVALUACION || (status && MOMENT_A_STATUSES.includes(status))) {
    return 'A';
  }
  if (internalStatus === POOL_INTERNAL_STATUS) return 'A';
  if (status && MOMENT_B_STATUSES.includes(status)) return 'B';
  return null;
}

export async function cancelCaseAction(
  caseId: string,
  input: { reasonId: string; comment?: string },
): Promise<ActionResult<{ moment: CancelMoment }>> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };

  try {
    const [cCase] = await db
      .select({
        id: clinicalCase.id,
        status: clinicalCase.status,
        internalStatus: clinicalCase.internalStatus,
        doctorId: clinicalCase.doctorId,
        assignedTechnicianId: clinicalCase.assignedTechnicianId,
        listPriceSale: clinicalCase.listPriceSale,
      })
      .from(clinicalCase)
      .where(eq(clinicalCase.id, caseId))
      .limit(1);
    if (!cCase) return { success: false, error: 'Caso no encontrado' };

    const isAdmin = identity.role === 'admin' || identity.isSystemAdmin;
    if (!isAdmin && cCase.doctorId !== identity.id) {
      return { success: false, error: 'No autorizado' };
    }

    const moment = resolveCancelMoment(cCase.status, cCase.internalStatus);
    if (!moment) {
      return { success: false, error: 'Este caso no puede cancelarse en su estado actual' };
    }

    const [reason] = await db
      .select({ id: cancellationReason.id, code: cancellationReason.code, isActive: cancellationReason.isActive, label: cancellationReason.label })
      .from(cancellationReason)
      .where(and(eq(cancellationReason.id, input.reasonId), eq(cancellationReason.isActive, true)))
      .limit(1);
    if (!reason) return { success: false, error: 'Motivo de cancelación inválido' };

    const isOtro = reason.label.trim().toLowerCase() === 'otro';
    const commentTrim = (input.comment ?? '').trim();
    if (isOtro && commentTrim.length < 3) {
      return { success: false, error: 'Indica un motivo (mín. 3 caracteres).' };
    }

    if (commentTrim) {
      const guarded = await guardTextOrFail({
        actionName: 'cancelCaseAction',
        caseId,
        identity: { id: identity.id, orgId: identity.orgId, role: identity.role },
        fields: [{ text: commentTrim, field: 'cancellationComment' }],
      });
      if (!guarded.ok) return { success: false, error: guarded.error };
    }

    const closureCause = moment === 'A' ? 'cancelacion_dentista_sin_cobro' : 'cancelacion_dentista_con_cobro';

    if (moment === 'A') {
      await voidPendingAssignmentsForCase(caseId);
    }

    await db
      .update(clinicalCase)
      .set({
        status: CASE_STATUSES.CERRADO,
        internalStatus: null,
        closureCause,
        pendingPoolStartedAt: null,
        pendingPoolCheckinSentAt: null,
        updatedAt: new Date(),
        lastActivityAt: new Date(),
      })
      .where(eq(clinicalCase.id, caseId));

    await closeCaseQualityAssignment(db, caseId);

    await logCaseEvent({
      caseId,
      userId: identity.id as string,
      type: 'sistema',
      action: CASE_EVENTS.CASO_CANCELADO,
      content: moment === 'A'
        ? 'El dentista canceló el caso.'
        : 'El dentista canceló el caso. Se cobra el valor comprometido.',
      payload: { visibleTo: 'dentista', closureCause, reasonCode: reason.code, ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
      stateChange: { from: cCase.status, to: CASE_STATUSES.CERRADO },
    });

    if (moment === 'B' && cCase.assignedTechnicianId) {
      await logCaseEvent({
        caseId,
        userId: cCase.assignedTechnicianId,
        type: 'sistema',
        action: CASE_EVENTS.CASO_CANCELADO,
        content: 'El dentista cerró el caso. Tu compensación queda registrada.',
        payload: { visibleTo: 'tecnico', closureCause, ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
      });
      await notifyUser(cCase.assignedTechnicianId, 'CASO_CANCELADO_DENTISTA_TECNICO', { caseId });
    }

    return { success: true, moment };
  } catch (error) {
    console.error('[cancelCaseAction]', error);
    return { success: false, error: 'Fallo al cancelar el caso' };
  }
}
