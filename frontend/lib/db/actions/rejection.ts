'use server';

/**
 * Rechazo explícito de invitaciones (v5.0). Individual (§3.2), masivo al apagar el
 * switch (§3.1) y auto-rechazo por auto-OFF Nivel 3 (§3.2.bis). Ninguno cuenta como
 * no-respuesta. Dispara reemplazo automático cuando el modelo está habilitado.
 */

import { db } from '@/lib/db';
import { caseInvitation, invitationRejectionReason, bulkRejectionReason } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { logCaseEvent } from './cases';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { isAvailabilityEnabled, isRejectionIndividualEnabled } from '@/lib/constants/availabilityFlags';
import { tryReplaceAfterRejectAction } from './replacement';
import type { ActionResult } from '@/lib/types/actions';

const OTRO_INDIVIDUAL_CODE = 'rej_007';
const OTRO_BULK_CODE = 'brej_005';
const AUTO_OFF_BULK_CODE = 'brej_003';
const AUTO_OFF_COMMENT = 'Auto-rechazo por auto-OFF Nivel 3 (sanción)';

async function loadActiveReason(table: typeof invitationRejectionReason | typeof bulkRejectionReason, id: string) {
  const [row] = await db
    .select({ id: table.id, code: table.code, label: table.label, isActive: table.isActive })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Texto del evento UCH que el técnico que rechazó ve en su propio carril.
 * El evento se mantiene oculto al dentista (`visibleTo: 'tecnico'`), pero el técnico
 * debe ver QUÉ rechazó y CON QUÉ MOTIVO (antes el evento iba como 'sistema' y nadie
 * salvo admin lo veía).
 */
function buildRejectionContent(headline: string, reasonLabel?: string | null, comment?: string | null): string {
  const lines = [headline];
  if (reasonLabel?.trim()) lines.push(`Motivo: ${reasonLabel.trim()}`);
  if (comment?.trim()) lines.push(`Comentario: ${comment.trim()}`);
  return lines.join('\n');
}

/**
 * Surface server-only del flag REJECTION_INDIVIDUAL_ENABLED para el UCH (Client
 * Component). El botón "Rechazar invitación" se monta solo si `enabled` es true.
 */
export async function getRejectionUiEnabledAction(): Promise<{ enabled: boolean }> {
  return { enabled: isRejectionIndividualEnabled() };
}

/**
 * Rechazo individual de una invitación pending por el técnico invitado.
 * No cuenta como no-respuesta; dispara reemplazo si el modelo está habilitado.
 */
export async function rejectInvitationIndividualAction(
  invitationId: string,
  reasonId: string,
  comment?: string,
): Promise<ActionResult<{ replacementSent: boolean }>> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };

  try {
    const [inv] = await db.select().from(caseInvitation).where(eq(caseInvitation.id, invitationId)).limit(1);
    if (!inv) return { success: false, error: 'Invitación no encontrada' };

    const isAdmin = identity.role === 'admin' || identity.isSystemAdmin;
    if (!isAdmin && inv.technicianId !== identity.id) {
      return { success: false, error: 'Esta invitación no te pertenece' };
    }
    if (inv.status !== 'pending') {
      return { success: false, error: 'Solo se puede rechazar una invitación pendiente' };
    }

    const reason = await loadActiveReason(invitationRejectionReason, reasonId);
    if (!reason || !reason.isActive) return { success: false, error: 'Motivo de rechazo inválido' };
    if (reason.code === OTRO_INDIVIDUAL_CODE && !comment?.trim()) {
      return { success: false, error: 'El comentario es obligatorio cuando el motivo es "Otro"' };
    }

    await db
      .update(caseInvitation)
      .set({
        status: 'rejected',
        rejectionReasonId: reasonId,
        rejectionComment: comment?.trim() || null,
        rejectedAt: new Date(),
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(caseInvitation.id, invitationId));

    await logCaseEvent({
      caseId: inv.clinicalCaseId,
      userId: inv.technicianId,
      // Visible solo al técnico que rechazó (su propio carril); el dentista no ve nada
      // explícito (el reemplazo aparece como nueva invitación). Sin enmascarado Fauchard:
      // es una acción propia del técnico.
      type: 'sistema',
      action: CASE_EVENTS.OFERTA_RECHAZADA_POR_TECNICO,
      content: buildRejectionContent('Rechazaste esta invitación.', reason.label, comment),
      payload: {
        invitationId,
        visibleTo: 'tecnico',
        rejectionReasonLabel: reason.label ?? null,
        rejectionComment: comment?.trim() || null,
      },
    });

    let replacementSent = false;
    if (isAvailabilityEnabled()) {
      const rep = await tryReplaceAfterRejectAction(invitationId);
      replacementSent = rep.success && rep.replaced === true;
    }

    return { success: true, replacementSent };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/** Rechazo de N invitaciones con un motivo masivo (toggle OFF del switch). */
export async function rejectInvitationsBulkAction(
  userId: string,
  reasonId: string,
  comment: string | undefined,
  invitationIds: string[],
): Promise<ActionResult<{ rejected: number; replacementsSent: number }>> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };
  const isAdmin = identity.role === 'admin' || identity.isSystemAdmin;
  if (!isAdmin && identity.id !== userId) return { success: false, error: 'No autorizado' };

  const reason = await loadActiveReason(bulkRejectionReason, reasonId);
  if (!reason || !reason.isActive) return { success: false, error: 'Motivo de rechazo masivo inválido' };
  if (reason.code === OTRO_BULK_CODE && !comment?.trim()) {
    return { success: false, error: 'El comentario es obligatorio cuando el motivo es "Otro"' };
  }

  return rejectInvitationsInternal(userId, reasonId, comment?.trim() || null, invitationIds, {
    headline: 'Rechazaste esta invitación al pausar tu disponibilidad.',
    reasonLabel: reason.label,
    displayComment: comment?.trim() || null,
  });
}

/**
 * Auto-rechazo por auto-OFF Nivel 3 (§3.2.bis). Usa brej_003 + comentario interno fijo.
 * No participa del diálogo del técnico (el cambio fue automático).
 */
export async function autoRejectOnAutoOffAction(
  userId: string,
  invitationIds: string[],
): Promise<ActionResult<{ rejected: number; replacementsSent: number }>> {
  const [reason] = await db
    .select({ id: bulkRejectionReason.id, label: bulkRejectionReason.label })
    .from(bulkRejectionReason)
    .where(eq(bulkRejectionReason.code, AUTO_OFF_BULK_CODE))
    .limit(1);
  if (!reason) return { success: false, error: 'Catálogo de rechazo masivo incompleto (brej_003)' };
  // El comentario interno (AUTO_OFF_COMMENT) se persiste para auditoría pero NO se muestra
  // al técnico (displayComment omitido): el headline ya explica el motivo.
  return rejectInvitationsInternal(userId, reason.id, AUTO_OFF_COMMENT, invitationIds, {
    headline: 'Esta invitación se rechazó automáticamente porque tu disponibilidad se desactivó.',
    reasonLabel: reason.label,
  });
}

/** Núcleo compartido de rechazo masivo: actualiza invitaciones pending del técnico. */
async function rejectInvitationsInternal(
  userId: string,
  bulkReasonId: string,
  comment: string | null,
  invitationIds: string[],
  uchEvent: { headline: string; reasonLabel?: string | null; displayComment?: string | null },
): Promise<ActionResult<{ rejected: number; replacementsSent: number }>> {
  try {
    const conditions = [
      eq(caseInvitation.technicianId, userId),
      eq(caseInvitation.status, 'pending'),
    ];
    if (invitationIds.length) conditions.push(inArray(caseInvitation.id, invitationIds));

    const targets = await db.select().from(caseInvitation).where(and(...conditions));
    if (!targets.length) return { success: true, rejected: 0, replacementsSent: 0 };

    const now = new Date();
    await db
      .update(caseInvitation)
      .set({
        status: 'rejected',
        bulkRejectionReasonId: bulkReasonId,
        bulkRejectionComment: comment,
        rejectedAt: now,
        respondedAt: now,
        updatedAt: now,
      })
      .where(inArray(caseInvitation.id, targets.map((t) => t.id)));

    let replacementsSent = 0;
    const replace = isAvailabilityEnabled();
    for (const inv of targets) {
      await logCaseEvent({
        caseId: inv.clinicalCaseId,
        userId: inv.technicianId,
        // Visible solo al técnico afectado (su propio carril); oculto al dentista.
        type: 'sistema',
        action: CASE_EVENTS.OFERTA_RECHAZADA_POR_TECNICO,
        content: buildRejectionContent(uchEvent.headline, uchEvent.reasonLabel, uchEvent.displayComment),
        payload: {
          invitationId: inv.id,
          visibleTo: 'tecnico',
          rejectionReasonLabel: uchEvent.reasonLabel ?? null,
          rejectionComment: uchEvent.displayComment ?? null,
        },
      });
      if (replace) {
        const rep = await tryReplaceAfterRejectAction(inv.id);
        if (rep.success && rep.replaced) replacementsSent++;
      }
    }

    return { success: true, rejected: targets.length, replacementsSent };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
