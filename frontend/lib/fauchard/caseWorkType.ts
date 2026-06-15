import {
  WORK_TYPE_TO_CATEGORY,
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

const RESTORATION_TO_WORK_TYPE: Record<string, string> = {
  'Corona Unitaria': 'corona_posterior',
  Inlay: 'inlay_onlay',
  Onlay: 'inlay_onlay',
  Carilla: 'carilla_unitaria',
  Puente: 'puente_3u',
  'Corona sobre implante': 'corona_implante',
  Denture: 'protesis_total',
  'Guía Quirúrgica': 'guia_quirurgica_simple',
  Otro: 'corona_posterior',
};

export function getWorkTypeForCase(restorationLabel: string, teeth: number[] = []): string {
  if (teeth.length >= 4 && restorationLabel === 'Carilla') return 'carillas_multiples';
  if (teeth.length >= 4 && restorationLabel === 'Puente') return 'puente_4mas';
  if (teeth.length >= 10) return 'full_arch';
  return RESTORATION_TO_WORK_TYPE[restorationLabel] || 'corona_posterior';
}

export function categoryForWorkType(workType: string): WorkCategory {
  return WORK_TYPE_TO_CATEGORY[workType as WorkType] ?? 'coronas';
}

export const LEAGUE_ORDER = ['bronce', 'plata', 'oro', 'elite'] as const;
