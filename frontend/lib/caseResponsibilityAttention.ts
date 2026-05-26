import { CASE_STATUSES } from '@/lib/constants/dental';

/** Casos cerrados o sin acción pendiente: no sumar +1 “fantasma” al conteo del hub. */
export function isCaseAttentionSuppressedByStatus(caseStatus: string | null | undefined): boolean {
  const s = String(caseStatus ?? '').toLowerCase();
  return (
    s === CASE_STATUSES.COMPLETADO ||
    s === CASE_STATUSES.RECHAZADO ||
    s === CASE_STATUSES.CERRADO ||
    s === CASE_STATUSES.CANCELADO
  );
}

/** Caso finalizado con éxito: no mostrar pendientes UCH (evita “1” sin burbuja asociada). */
export function isHubInboxSuppressedForCompletedCase(caseStatus: string | null | undefined): boolean {
  return String(caseStatus ?? '').toLowerCase() === CASE_STATUSES.COMPLETADO;
}

/**
 * +1 de atención cuando el flujo del caso está a la espera de acción del visor
 * (misma regla que antes en MarketplaceCaseCard con currentResponsibility).
 */
export function responsibilityAttentionBump(params: {
  viewerRole: string;
  viewerId: string;
  currentResponsibility: string | null | undefined;
  assignedTechnicianId: string | null | undefined;
  /** Estado del caso; en terminal (p. ej. completado) no aplica bump aunque quede responsabilidad en BD. */
  caseStatus?: string | null;
}): 0 | 1 {
  const { viewerRole, viewerId, currentResponsibility, assignedTechnicianId, caseStatus } = params;
  if (isCaseAttentionSuppressedByStatus(caseStatus)) return 0;

  const resp = currentResponsibility ?? null;

  if (viewerRole === 'dentista' && resp === 'dentista') {
    return 1;
  }
  if (
    viewerRole === 'tecnico' &&
    resp === 'tecnico' &&
    assignedTechnicianId != null &&
    String(assignedTechnicianId) === String(viewerId)
  ) {
    return 1;
  }
  return 0;
}
