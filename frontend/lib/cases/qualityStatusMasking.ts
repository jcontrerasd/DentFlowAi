import { CASE_STATUSES } from '@/lib/constants/dental';

/** Rol del viewer para decidir la presentación del estado del caso. */
export type CaseViewerRole = 'dentista' | 'tecnico' | 'calidad' | 'admin';

/**
 * Enmascaramiento del estado del caso según el rol del viewer.
 *
 * El dentista NUNCA percibe la etapa de Calidad (requisito de anonimato): para él,
 * `enRevisionCalidad` y `certificadoCalidad` se muestran como `enEjecucion`.
 * Técnico/Calidad/Admin ven el estado real.
 *
 * Fuente única de la regla — espeja `extraAliases` de `CaseWorkflowStepper`.
 */
export function maskCaseStatusForViewer(status: string, viewerRole: CaseViewerRole): string {
  const seesQualityStage = viewerRole !== 'dentista';
  if (
    !seesQualityStage &&
    (status === CASE_STATUSES.EN_REVISION_CALIDAD || status === CASE_STATUSES.CERTIFICADO_CALIDAD)
  ) {
    return CASE_STATUSES.EN_EJECUCION;
  }
  return status;
}
