/**
 * Constantes compartidas para datos clínicos dentales.
 * Usen estos valores en lugar de definirlos localmente en cada componente.
 */

// Listas administrables migradas a DB (vita_shade, restoration_type, dental_material, urgency_level).
// Carga vía server actions en frontend/lib/db/actions/catalogs.ts.
// Los tipos string genéricos quedan abajo por compatibilidad de tipos.

/** Estados del flujo vigente */
export const CASE_STATUSES = {
  BORRADOR: 'borrador',
  EN_EVALUACION: 'enEvaluacion',
  PROPUESTA_LISTA: 'propuestaLista',
  ACEPTADA_PENDIENTE_INICIO: 'aceptadaPendienteInicio',
  EN_EJECUCION: 'enEjecucion',
  /** Entrega del técnico en revisión de Calidad (gated por QUALITY_GATE_ENABLED) */
  EN_REVISION_CALIDAD: 'enRevisionCalidad',
  /** Entrega certificada por Calidad, lista para que el técnico la envíe al dentista */
  CERTIFICADO_CALIDAD: 'certificadoCalidad',
  EN_REVISION: 'enRevision',
  CAMBIOS_EN_PROCESO: 'cambiosEnProceso',
  COMPLETADO: 'completado',
  CERRADO: 'cerrado',
  PAUSADO: 'pausado',
  CANCELADO: 'cancelado',
  RECHAZADO: 'rechazado',
} as const;

/** Estados internos granulares — solo visible para admin y sistema */
export const INTERNAL_CASE_STATUSES = {
  CASO_RECIBIDO: 'caso_recibido',
  CLASIFICANDO: 'clasificando',
  SELECCIONANDO_TECNICOS: 'seleccionandoTecnicos',
  ASIGNACION_PENDIENTE: 'asignacionPendiente',
  EVALUANDO_OFERTAS: 'evaluandoOfertas',
  PROPUESTA_GENERADA: 'propuestaGenerada',
  PROPUESTA_PRESENTADA: 'propuestaPresentada',
  ACEPTADA_CONFIGURANDO: 'aceptadaConfigurando',
  EN_EJECUCION_DISENO: 'enEjecucionDiseno',
  /** Entrega en revisión de Calidad antes de llegar al dentista */
  EN_REVISION_CALIDAD: 'enRevisionCalidad',
  /** Calidad certificó; el técnico decide cuándo enviar al dentista */
  CERTIFICADO_CALIDAD: 'certificadoCalidad',
  EN_REVISION_DISENO: 'enRevisionDiseno',
  CAMBIOS_SOLICITADOS: 'cambiosSolicitados',
  SIN_ASIGNACION_FALLO: 'sin_asignacion_fallo',
  /** @deprecated legacy */
  SIN_COTIZACIONES_FALLO: 'sin_cotizaciones_fallo',
  PROPUESTA_EXPIRADA: 'propuestaExpirada',
  RECHAZADA_POR_DENTISTA: 'rechazadaPorDentista',
  /** Dentista rechazó todas las cotizaciones en bloque comparativo */
  RECHAZADO_TODAS_OFERTAS: 'rechazadoTodasOfertas',
} as const;

/** WorkTypes canónicos v5.13 (derivación de casos) + legacy (skills históricos). */
export const WORK_TYPES = [
  // Coronas (canónicos v5.13)
  'corona_unitaria',
  'corona_multiple_corta',
  'corona_multiple_larga',
  'full_arch_corona',
  // Coronas (legacy skills)
  'corona_anterior',
  'corona_posterior',
  'corona_implante',
  // Inlays / onlays
  'inlay_onlay',
  // Carillas (canónicos v5.13)
  'carilla_simple',
  'carilla_multiple',
  // Carillas (legacy)
  'carilla_unitaria',
  'carillas_multiples',
  // Puentes (canónicos v5.13)
  'puente_corto',
  'puente_largo',
  // Puentes (legacy)
  'puente_3u',
  'puente_4mas',
  // Full arch
  'full_arch',
  // Prótesis removible
  'protesis_parcial_removible',
  'protesis_total',
  'sobredentadura',
  'barra_implantes',
  // Guías
  'guia_quirurgica_simple',
  'guia_quirurgica_compleja',
] as const;

/**
 * Categorías canónicas de disponibilidad del técnico (v5.13 — 7 categorías).
 * El técnico declara disponibilidad por categoría, no por work_type individual.
 * Columnas `technician_availability`: `cat_<categoria>_cad` / `cat_<categoria>_cam`.
 */
export const WORK_CATEGORIES = [
  'coronas',
  'inlays',
  'carillas',
  'puentes',
  'full_arch',
  'protesis',
  'guias',
] as const;

export type WorkCategory = typeof WORK_CATEGORIES[number];

/** Labels legibles de las 7 categorías. */
export const WORK_CATEGORY_LABELS: Record<WorkCategory, string> = {
  coronas: 'Coronas',
  inlays: 'Inlays y Onlays',
  carillas: 'Carillas',
  puentes: 'Puentes',
  full_arch: 'Full Arch',
  protesis: 'Prótesis Removible',
  guias: 'Guías Quirúrgicas',
};

/**
 * Mapeo work_type → categoría (7). Incluye canónicos v5.13 y legacy para lectura dual.
 */
export const WORK_TYPE_TO_CATEGORY: Record<WorkType, WorkCategory> = {
  corona_unitaria: 'coronas',
  corona_multiple_corta: 'coronas',
  corona_multiple_larga: 'coronas',
  full_arch_corona: 'full_arch',
  corona_anterior: 'coronas',
  corona_posterior: 'coronas',
  corona_implante: 'coronas',
  inlay_onlay: 'inlays',
  carilla_simple: 'carillas',
  carilla_multiple: 'carillas',
  carilla_unitaria: 'carillas',
  carillas_multiples: 'carillas',
  puente_corto: 'puentes',
  puente_largo: 'puentes',
  puente_3u: 'puentes',
  puente_4mas: 'puentes',
  full_arch: 'full_arch',
  protesis_parcial_removible: 'protesis',
  protesis_total: 'protesis',
  sobredentadura: 'protesis',
  barra_implantes: 'protesis',
  guia_quirurgica_simple: 'guias',
  guia_quirurgica_compleja: 'guias',
};

/** Labels legibles para los tipos de trabajo */
export const WORK_TYPE_LABELS: Record<string, string> = {
  corona_unitaria: 'Corona Unitaria',
  corona_multiple_corta: 'Coronas Múltiples (2–3)',
  corona_multiple_larga: 'Coronas Múltiples (4–9)',
  full_arch_corona: 'Full Arch (coronas)',
  corona_anterior: 'Corona Anterior (hist.)',
  corona_posterior: 'Corona Posterior (hist.)',
  corona_implante: 'Corona sobre Implante',
  inlay_onlay: 'Inlay / Onlay',
  carilla_simple: 'Carilla (1–3)',
  carilla_multiple: 'Carillas Múltiples (4+)',
  carilla_unitaria: 'Carilla Unitaria (hist.)',
  carillas_multiples: 'Carillas Múltiples (hist.)',
  puente_corto: 'Puente Corto (3–6)',
  puente_largo: 'Puente Largo (7–9)',
  puente_3u: 'Puente 3 Unidades (hist.)',
  puente_4mas: 'Puente 4+ Unidades (hist.)',
  full_arch: 'Full Arch',
  protesis_parcial_removible: 'Prótesis Parcial Removible',
  protesis_total: 'Prótesis Total',
  sobredentadura: 'Sobredentadura',
  barra_implantes: 'Barra sobre Implantes',
  guia_quirurgica_simple: 'Guía Quirúrgica Simple',
  guia_quirurgica_compleja: 'Guía Quirúrgica Compleja',
};

/** Niveles de categoría del técnico */
export const CATEGORY_LEVELS = {
  BRONCE: 'bronce',
  PLATA: 'plata',
  ORO: 'oro',
  ELITE: 'elite',
} as const;

/** Complejidad de un caso */
export const CASE_COMPLEXITY = {
  BASICO: 'basico',
  INTERMEDIO: 'intermedio',
  AVANZADO: 'avanzado',
  CRITICO: 'critico',
} as const;

/** Tipo de servicio requerido — solo diseño */
export const SERVICE_TYPES = {
  SOLO_DISENO: 'solo_diseno',
} as const;

/** Labels legibles para los tipos de servicio */
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  solo_diseno: 'Solo diseño',
};

/** Niveles de urgencia de un caso (incluye valores legacy en BD). */
export const URGENCY_LEVELS = {
  BAJA: 'baja',
  NORMAL: 'normal',
  ALTA: 'alta',
  URGENTE: 'urgente',
  PRIORITARIO: 'prioritario',
} as const;

/** Prioridades disponibles al crear caso: ahora administrables vía tabla `urgency_level`. */
export type CaseCreatableUrgencyLevel = 'baja' | 'normal' | 'alta';

/** Estados finales: archivar y crear copia (no intermedios). */
export const CASE_TERMINAL_STATUSES = [
  CASE_STATUSES.COMPLETADO,
  CASE_STATUSES.RECHAZADO,
  CASE_STATUSES.CERRADO,
] as const;

export type CaseTerminalStatus = (typeof CASE_TERMINAL_STATUSES)[number];

const TERMINAL_SET = new Set<string>(CASE_TERMINAL_STATUSES);

export function isTerminalCaseStatus(status: string | null | undefined): boolean {
  return status != null && TERMINAL_SET.has(status);
}

export function isDraftCaseStatus(status: string | null | undefined): boolean {
  return status === CASE_STATUSES.BORRADOR;
}

/** Activo en flujo: ni borrador ni terminal. */
export function isActiveCaseStatus(status: string | null | undefined): boolean {
  if (status == null) return false;
  return !isDraftCaseStatus(status) && !isTerminalCaseStatus(status);
}

/** Invitación del técnico en estado que permite archivar su vista. */
export const TECH_ARCHIVE_INVITATION_STATUSES = ['rejected', 'expired', 'withdrawn'] as const;

export type CaseStatus = typeof CASE_STATUSES[keyof typeof CASE_STATUSES];
export type InternalCaseStatus = typeof INTERNAL_CASE_STATUSES[keyof typeof INTERNAL_CASE_STATUSES];
export type UrgencyLevel = typeof URGENCY_LEVELS[keyof typeof URGENCY_LEVELS];
export type VitaShade = string;
export type RestorationType = string;
export type DentalMaterial = string;
export type WorkType = typeof WORK_TYPES[number];
export type CategoryLevel = typeof CATEGORY_LEVELS[keyof typeof CATEGORY_LEVELS];
export type CaseComplexity = typeof CASE_COMPLEXITY[keyof typeof CASE_COMPLEXITY];
export type ServiceType = typeof SERVICE_TYPES[keyof typeof SERVICE_TYPES];
