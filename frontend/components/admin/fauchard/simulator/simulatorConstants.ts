import type { ExclusionReason } from '@/lib/db/actions/assignment';
import { CASE_COMPLEXITY, type CaseComplexity } from '@/lib/constants/dental';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';
import type { LiveScenario, SimulatorFunnelStep } from './simulatorTypes';

/** Controles densos del paso Caso (sin scroll en viewport estándar). */
export const COMPACT_SELECT_CLASS =
  'w-full bg-background border border-divider rounded-xl px-3 py-2 text-xs text-foreground outline-none focus:border-primary/30';

export const COMPLEXITY_OPTIONS = Object.values(CASE_COMPLEXITY) as CaseComplexity[];

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  not_available: 'No disponible',
  suspended: 'Suspendido',
  inactive: 'Inactivo',
  league_mismatch: 'Liga no coincide',
  cooldown: 'En cooldown',
  insufficient_skill: 'Sin habilidad',
  availability_filter: 'Filtro disponibilidad',
  excluded_manually: 'Excluido manualmente',
};

export type ParamGroupItem = { key: string; label: string; suffix?: string; helpKey?: string };
export type ParamGroup = { group: string; items: ParamGroupItem[] };

export const PARAM_GROUPS: ParamGroup[] = [
  {
    group: 'Pesos del score (α)',
    items: [
      { key: 'alphaQuality', label: 'Q · Calidad' },
      { key: 'alphaPunctuality', label: 'P · Puntualidad' },
      { key: 'alphaExperience', label: 'E · Experiencia' },
      { key: 'alphaBonus', label: 'B · Bono (suma)' },
      { key: 'alphaLoad', label: 'L · Carga (resta)' },
      { key: 'alphaNoResponse', label: 'N · No-respuesta (resta)' },
    ],
  },
  {
    group: 'Ventana de calidad y puntualidad (Q · P)',
    items: [
      { key: 'wQualityDays', label: 'Calidad histórica', suffix: 'd', helpKey: 'wQualityDays-q' },
      { key: 'wQualityDays', label: 'Puntualidad histórica', suffix: 'd', helpKey: 'wQualityDays-p' },
    ],
  },
  {
    group: 'Filtros de exclusión',
    items: [
      { key: 'tCooldownMinutes', label: 'Cooldown', suffix: 'min' },
      { key: 'dInactivityDays', label: 'Inactividad', suffix: 'd' },
    ],
  },
  {
    group: 'Asignación',
    items: [
      { key: 'maxAssignmentAttempts', label: 'Intentos máx.' },
      { key: 'tQuoteMinutes', label: 'Plazo respuesta', suffix: 'min' },
    ],
  },
];

export const PARAM_GROUPS_BY_STEP: Record<Exclude<SimulatorFunnelStep, 'caso' | 'clasificacion'>, ParamGroup[]> = {
  filtros: [PARAM_GROUPS[2]!],
  ranking: [PARAM_GROUPS[0]!, PARAM_GROUPS[1]!],
  asignacion: [PARAM_GROUPS[3]!],
};

export const FUNNEL_STEPS: { id: SimulatorFunnelStep; label: string; shortLabel: string }[] = [
  { id: 'caso', label: 'Caso virtual', shortLabel: 'Caso' },
  { id: 'clasificacion', label: 'Clasificación', shortLabel: 'Clasif.' },
  { id: 'filtros', label: 'Filtros duros', shortLabel: 'Filtros' },
  { id: 'ranking', label: 'Ranking Q/P/E/B/L/N', shortLabel: 'Ranking' },
  { id: 'asignacion', label: 'Asignación directa', shortLabel: 'Asignación' },
];

export function resolveStepBadge(
  step: SimulatorFunnelStep,
  result: SimulationResult | null,
  liveScenario: LiveScenario,
): string | null {
  switch (step) {
    case 'caso':
      return liveScenario.workType ? liveScenario.workType : null;
    case 'clasificacion':
      return liveScenario.caseLeague ? `Liga ${liveScenario.caseLeague}` : null;
    case 'filtros':
      if (!result) return null;
      return `${result.funnel.eligible}/${result.funnel.universe}`;
    case 'ranking': {
      if (!result || result.poolEmpty) return null;
      const top = result.ranked.find((r) => !r.excluded);
      return top ? `#${top.rank} ${top.fullName.split(' ')[0]}` : null;
    }
    case 'asignacion': {
      if (!result || result.poolEmpty) return null;
      const assigned = result.assignmentPreview.retryChainDetails[0];
      return assigned ? assigned.fullName.split(' ')[0] ?? null : null;
    }
    default:
      return null;
  }
}

export function isStepDone(step: SimulatorFunnelStep, result: SimulationResult | null): boolean {
  if (step === 'caso' || step === 'clasificacion') return true;
  return result != null && !result.poolEmpty;
}
