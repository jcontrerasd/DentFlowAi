import {
  CASE_COMPLEXITY,
  WORK_TYPE_TO_CATEGORY,
  type CaseComplexity,
  type WorkCategory,
  type WorkType,
} from '@/lib/constants/dental';

/** Nivel mínimo de designLevel requerido según la liga del caso. */
export const MIN_SKILL_FOR_CATEGORY: Record<string, number> = {
  bronce: 1,
  plata: 3,
  oro: 5,
  elite: 7,
};

export const LEAGUE_ORDER = ['bronce', 'plata', 'oro', 'elite'] as const;

export const COMPLEXITY_TO_LEAGUE: Record<string, string> = {
  [CASE_COMPLEXITY.BASICO]: 'bronce',
  [CASE_COMPLEXITY.INTERMEDIO]: 'plata',
  [CASE_COMPLEXITY.AVANZADO]: 'oro',
  [CASE_COMPLEXITY.CRITICO]: 'elite',
};

const RESTORATION_TO_BASE_WORK_TYPE: Record<string, string> = {
  'Corona Unitaria': 'corona_unitaria',
  Inlay: 'inlay_onlay',
  Onlay: 'inlay_onlay',
  Carilla: 'carilla_simple',
  Puente: 'puente_corto',
  'Corona sobre implante': 'corona_implante',
  Denture: 'protesis_total',
  'Guía Quirúrgica': 'guia_quirurgica_simple',
  Otro: 'corona_unitaria',
};

const PROSTHESIS_WORK_TYPES = new Set([
  'protesis_parcial_removible',
  'protesis_total',
  'sobredentadura',
  'barra_implantes',
]);

export type CaseClassificationInput = {
  restorationLabel: string;
  teeth: number[];
  replacesMissingTeeth?: boolean | null;
};

function isCoronaRestoration(label: string): boolean {
  return label === 'Corona Unitaria' || label === 'Corona sobre implante' || label === 'Otro';
}

function isCarillaRestoration(label: string): boolean {
  return label === 'Carilla';
}

function isInlayRestoration(label: string): boolean {
  return label === 'Inlay' || label === 'Onlay';
}

function isProsthesisRestoration(label: string): boolean {
  return label === 'Denture';
}

function isGuiaRestoration(label: string): boolean {
  return label === 'Guía Quirúrgica';
}

/** Resuelve el flag póntico: NULL legacy → inferir desde restauración Puente. */
export function resolvePonticFlag(
  replacesMissingTeeth: boolean | null | undefined,
  restorationLabel: string,
): boolean {
  if (replacesMissingTeeth === true) return true;
  if (replacesMissingTeeth === false) return false;
  return restorationLabel === 'Puente';
}

/**
 * Árbol de decisión v5.13 (precedencia doc §3.3):
 * 1. ≥10 unidades → full_arch
 * 2. Pónticos → puente por longitud
 * 3. Carilla → carillas
 * 4. Inlay/onlay → inlays
 * 5. Corona sin pónticos → corona por cantidad
 */
export function resolveWorkType(input: CaseClassificationInput): WorkType {
  const { restorationLabel, teeth } = input;
  const count = teeth.length;
  const hasPontics = resolvePonticFlag(input.replacesMissingTeeth, restorationLabel);

  // Prioridad 1: full arch por escala
  if (count >= 10) {
    if (!hasPontics && isCoronaRestoration(restorationLabel)) {
      return 'full_arch_corona';
    }
    return 'full_arch';
  }

  // Prótesis / guía / denture — tipos fijos por restauración
  if (isProsthesisRestoration(restorationLabel)) {
    return 'protesis_total';
  }
  if (isGuiaRestoration(restorationLabel)) {
    return 'guia_quirurgica_simple';
  }
  if (restorationLabel === 'Corona sobre implante') {
    return count <= 1 ? 'corona_implante' : count <= 3 ? 'corona_multiple_corta' : 'corona_multiple_larga';
  }

  // Prioridad 2: pónticos → puente
  if (hasPontics) {
    if (count >= 7) return 'puente_largo';
    return 'puente_corto';
  }

  // Prioridad 3: carillas
  if (isCarillaRestoration(restorationLabel)) {
    return count >= 4 ? 'carilla_multiple' : 'carilla_simple';
  }

  // Prioridad 4: inlays
  if (isInlayRestoration(restorationLabel)) {
    return 'inlay_onlay';
  }

  // Prioridad 5: coronas sin pónticos
  if (isCoronaRestoration(restorationLabel)) {
    if (count <= 1) return 'corona_unitaria';
    if (count <= 3) return 'corona_multiple_corta';
    return 'corona_multiple_larga';
  }

  return (RESTORATION_TO_BASE_WORK_TYPE[restorationLabel] as WorkType) || 'corona_unitaria';
}

export function resolveCategory(workType: string): WorkCategory {
  return WORK_TYPE_TO_CATEGORY[workType as WorkType] ?? 'coronas';
}

/** Complejidad unificada — precedencia: crítico (guía) > avanzado > intermedio > básico. */
export function resolveCaseComplexity(input: CaseClassificationInput): CaseComplexity {
  const { restorationLabel, teeth } = input;
  const workType = resolveWorkType(input);

  if (isGuiaRestoration(restorationLabel)) {
    return CASE_COMPLEXITY.CRITICO;
  }

  if (
    teeth.length >= 10 ||
    PROSTHESIS_WORK_TYPES.has(workType) ||
    workType === 'full_arch' ||
    workType === 'full_arch_corona'
  ) {
    return CASE_COMPLEXITY.AVANZADO;
  }

  if (
    teeth.length >= 4 ||
    workType === 'puente_largo' ||
    workType === 'carilla_multiple' ||
    workType === 'corona_multiple_larga'
  ) {
    return CASE_COMPLEXITY.INTERMEDIO;
  }

  return CASE_COMPLEXITY.BASICO;
}

export type ResolvedScenario = CaseClassificationInput & {
  workType: WorkType;
  caseComplexity: CaseComplexity;
  caseLeague: string;
  category: WorkCategory;
};

export function resolveScenario(input: CaseClassificationInput): ResolvedScenario {
  const workType = resolveWorkType(input);
  const caseComplexity = resolveCaseComplexity(input);
  const caseLeague = COMPLEXITY_TO_LEAGUE[caseComplexity] ?? 'bronce';
  return {
    ...input,
    workType,
    caseComplexity,
    caseLeague,
    category: resolveCategory(workType),
  };
}

/** @deprecated Usar resolveWorkType */
export function getWorkTypeForCase(
  restorationLabel: string,
  teeth: number[] = [],
  replacesMissingTeeth?: boolean | null,
): string {
  return resolveWorkType({ restorationLabel, teeth, replacesMissingTeeth });
}

/** @deprecated Usar resolveCategory */
export function categoryForWorkType(workType: string): WorkCategory {
  return resolveCategory(workType);
}
