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
  EN_REVISION: 'enRevision',
  CAMBIOS_EN_PROCESO: 'cambiosEnProceso',
  DISENO_APROBADO: 'disenoAprobado',
  EN_FABRICACION: 'enFabricacion',
  ENVIADO: 'enviado',
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
  COTIZACIONES_ABIERTAS: 'cotizacionesAbiertas',
  EVALUANDO_OFERTAS: 'evaluandoOfertas',
  PROPUESTA_GENERADA: 'propuestaGenerada',
  PROPUESTA_PRESENTADA: 'propuestaPresentada',
  ACEPTADA_CONFIGURANDO: 'aceptadaConfigurando',
  EN_EJECUCION_DISENO: 'enEjecucionDiseno',
  EN_REVISION_DISENO: 'enRevisionDiseno',
  CAMBIOS_SOLICITADOS: 'cambiosSolicitados',
  DISENO_APROBADO: 'disenoAprobado',
  SIN_COTIZACIONES_FALLO: 'sin_cotizaciones_fallo',
  PROPUESTA_EXPIRADA: 'propuestaExpirada',
  RECHAZADA_POR_DENTISTA: 'rechazadaPorDentista',
  /** Dentista rechazó todas las cotizaciones en bloque comparativo */
  RECHAZADO_TODAS_OFERTAS: 'rechazadoTodasOfertas',
} as const;

/** Tipos de trabajo que pueden declarar los técnicos (15 valores canónicos) */
export const WORK_TYPES = [
  'corona_anterior',
  'corona_posterior',
  'corona_implante',
  'inlay_onlay',
  'carilla_unitaria',
  'carillas_multiples',
  'puente_3u',
  'puente_4mas',
  'full_arch',
  'protesis_parcial_removible',
  'protesis_total',
  'sobredentadura',
  'barra_implantes',
  'guia_quirurgica_simple',
  'guia_quirurgica_compleja',
] as const;

/** Labels legibles para los tipos de trabajo */
export const WORK_TYPE_LABELS: Record<string, string> = {
  corona_anterior: 'Corona Anterior',
  corona_posterior: 'Corona Posterior',
  corona_implante: 'Corona sobre Implante',
  inlay_onlay: 'Inlay / Onlay',
  carilla_unitaria: 'Carilla Unitaria',
  carillas_multiples: 'Carillas Múltiples (2+)',
  puente_3u: 'Puente 3 Unidades',
  puente_4mas: 'Puente 4+ Unidades',
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

/** Tipo de servicio requerido */
export const SERVICE_TYPES = {
  SOLO_DISENO: 'solo_diseno',
  SOLO_FABRICACION: 'solo_fabricacion',
  INTEGRAL: 'integral',
} as const;

/** Labels legibles para los tipos de servicio */
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  solo_diseno: 'Solo diseño',
  solo_fabricacion: 'Solo fabricación',
  integral: 'Diseño + Fabricación',
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
