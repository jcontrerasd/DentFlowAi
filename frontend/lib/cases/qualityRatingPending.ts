import { CASE_STATUSES } from '@/lib/constants/dental';

export type QualityRatingPendingInput = {
  /** Estado del caso (`clinical_case.status`). */
  status: string;
  /** Revisor de Calidad asignado al caso (`clinical_case.quality_reviewer_id`). */
  qualityReviewerId: string | null | undefined;
  /** Identidad del usuario que mira (debe ser el revisor para que aplique). */
  viewerId: string | null | undefined;
  /** ¿Existe ya un `review` dimension='quality' de este revisor para el caso? */
  hasQualityReview: boolean;
};

/**
 * Señal derivada "por calificar" del revisor de Calidad: un caso `completado` cuyo
 * revisor asignado todavía no envió su calificación (`review` dimension='quality').
 *
 * La ausencia de la fila `review` ES el pendiente — al calificar, la fila aparece
 * (`submitQualityRatingAction` hace `onConflictDoUpdate`) y la señal se apaga sola.
 * No depende de columnas nuevas ni de estado del caso: es ortogonal al ciclo de vida.
 *
 * El gating de `QUALITY_GATE_ENABLED` queda en los callers (server-side); con el flag
 * off no hay `quality_reviewer_id` asignado, así que la condición no se cumple igualmente.
 */
export function isQualityRatingPending(input: QualityRatingPendingInput): boolean {
  return (
    input.status === CASE_STATUSES.COMPLETADO &&
    !!input.qualityReviewerId &&
    !!input.viewerId &&
    input.qualityReviewerId === input.viewerId &&
    !input.hasQualityReview
  );
}
