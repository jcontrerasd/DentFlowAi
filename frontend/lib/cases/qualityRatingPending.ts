import { CASE_STATUSES } from '@/lib/constants/dental';

export type QualityRatingPendingInput = {
  /** Estado del caso (`clinical_case.status`). */
  status: string;
  /** @deprecated No se usa para la decisión; el filtro de visibilidad ya garantiza el scope por rol. */
  qualityReviewerId?: string | null | undefined;
  /** @deprecated No se usa para la decisión. */
  viewerId?: string | null | undefined;
  /** ¿Existe ya un `review` dimension='quality' para el caso? */
  hasQualityReview: boolean;
};

/**
 * Señal derivada "por calificar": un caso `completado` sin ninguna calificación
 * dimension='quality'. El filtro de visibilidad en `buildActiveCaseVisibilityWhere`
 * ya garantiza que solo el QA asignado (active o pending_derivation) ve el caso,
 * por lo que no es necesario verificar qualityReviewerId === viewerId aquí.
 */
export function isQualityRatingPending(input: QualityRatingPendingInput): boolean {
  return (
    input.status === CASE_STATUSES.COMPLETADO &&
    !input.hasQualityReview
  );
}
