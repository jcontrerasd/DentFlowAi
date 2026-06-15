/**
 * Plazos de entrega — modelo de asignación directa.
 * El dentista fija desiredDeliveryAt al publicar; el reloj arranca en publicación.
 */

const MS_PER_DAY = 86_400_000;

/** Días calendario desde un instante hasta la entrega deseada. */
export function deriveDeadlineDays(
  desiredDeliveryAt: Date | string | null | undefined,
  fromMs: number = Date.now(),
): number {
  if (!desiredDeliveryAt) return 5;
  const target = new Date(desiredDeliveryAt).getTime();
  const diffDays = Math.ceil((target - fromMs) / MS_PER_DAY);
  return Math.max(1, Math.min(diffDays, 365));
}

/** Días desde publicación hasta entrega deseada (para proposedDeliveryDays). */
export function computeProposedDeliveryDays(
  publishedAt: Date | string | null | undefined,
  desiredDeliveryAt: Date | string | null | undefined,
): number {
  if (!desiredDeliveryAt) return 5;
  const anchor = publishedAt ? new Date(publishedAt).getTime() : Date.now();
  return deriveDeadlineDays(desiredDeliveryAt, anchor);
}

/** workDeadline canónico: fecha/hora solicitada por el dentista. */
export function resolveWorkDeadline(opts: {
  desiredDeliveryAt: Date | string | null | undefined;
  publishedAt?: Date | string | null;
  deadlineDays?: number | null;
  fallbackDays?: number;
}): Date {
  if (opts.desiredDeliveryAt) {
    return new Date(opts.desiredDeliveryAt);
  }
  const anchor = opts.publishedAt ? new Date(opts.publishedAt).getTime() : Date.now();
  const days = opts.deadlineDays ?? opts.fallbackDays ?? 5;
  return new Date(anchor + days * MS_PER_DAY);
}

/** Puntualidad: completado a tiempo respecto a desiredDeliveryAt (o ventana desde publicación). */
export function isCompletedOnTime(
  completedAt: Date | string,
  desiredDeliveryAt: Date | string | null | undefined,
  publishedAt: Date | string | null | undefined,
  deadlineDays: number | null | undefined,
): boolean {
  const done = new Date(completedAt).getTime();
  if (desiredDeliveryAt) {
    return done <= new Date(desiredDeliveryAt).getTime();
  }
  const anchor = publishedAt ? new Date(publishedAt).getTime() : null;
  if (anchor != null && deadlineDays != null && deadlineDays > 0) {
    return done <= anchor + deadlineDays * MS_PER_DAY;
  }
  return false;
}
