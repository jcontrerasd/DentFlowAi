/**
 * Helpers puros del simulador Fauchard (testeables sin DB).
 */

import type { ExclusionReason, RankedCandidate } from '@/lib/db/actions/assignment';
import {
  WORK_CATEGORY_LABELS,
  WORK_TYPE_LABELS,
  type WorkCategory,
} from '@/lib/constants/dental';
import { MIN_SKILL_FOR_CATEGORY } from '@/lib/fauchard/caseWorkType';
import type {
  FunnelStage,
  FunnelStageId,
  RetryChainEntry,
  SimulationResult,
  SimulationScenario,
} from '@/lib/fauchard/simulationTypes';

type FunnelMetaContext = {
  categoryLabel: string;
  workTypeLabel: string;
  leagueLabel: string;
  minSkill: number;
};

function buildFunnelMetaContext(scenario: SimulationScenario): FunnelMetaContext {
  const category = scenario.category as WorkCategory;
  const leagueLabel = scenario.caseLeague;
  return {
    categoryLabel: WORK_CATEGORY_LABELS[category] ?? scenario.category,
    workTypeLabel: WORK_TYPE_LABELS[scenario.workType] ?? scenario.workType,
    leagueLabel,
    minSkill: MIN_SKILL_FOR_CATEGORY[leagueLabel] ?? 1,
  };
}

const FUNNEL_STAGE_LABELS: Record<FunnelStageId, (ctx: FunnelMetaContext) => string> = {
  universe: () => 'Universo',
  excluded_manually: () => 'Sin exclusión manual',
  not_available: () => 'Disponible global',
  league: (ctx) => `Liga «${ctx.leagueLabel}» (estricta o expansión)`,
  suspended: () => 'Sin suspensión activa',
  inactive: () => 'Actividad reciente',
  cooldown: (ctx) => `Sin cooldown · «${ctx.workTypeLabel}»`,
  insufficient_skill: (ctx) => `Skill diseño ≥ ${ctx.minSkill} · «${ctx.workTypeLabel}»`,
  availability_filter: (ctx) => `Disponibilidad CAD · ${ctx.categoryLabel}`,
  eligible: () => 'Elegibles',
};

const FUNNEL_STAGE_FIX_HINTS: Record<FunnelStageId, (ctx: FunnelMetaContext) => string> = {
  universe: () => 'Base: técnicos activos en el sistema.',
  excluded_manually: () => 'En Asignación, usa «Restablecer rechazos» para limpiar exclusiones manuales.',
  not_available: () => 'En Perfil → Disponibilidad, activa el switch «Disponible para recibir casos».',
  league: (ctx) =>
    `Sube la liga del técnico o baja la complejidad del caso (modo Manual) para exigir liga menor que «${ctx.leagueLabel}».`,
  suspended: () => 'Revisa y levanta la suspensión del técnico o espera a que expire.',
  inactive: () => 'Revisa último login del técnico o ajusta «Inactividad» en Configuración Fauchard → Parámetros.',
  cooldown: (ctx) =>
    `Espera la ventana de cooldown para «${ctx.workTypeLabel}» o reduce tCooldownMinutes en la config (sandbox).`,
  insufficient_skill: (ctx) =>
    `En perfil técnico → Matriz de skills, declara «${ctx.workTypeLabel}» con designLevel ≥ ${ctx.minSkill}.`,
  availability_filter: (ctx) =>
    `Activa switch global, CAD y el toggle de «${ctx.categoryLabel}» en Perfil → Disponibilidad.`,
  eligible: () => 'Técnicos que pasaron todos los filtros del motor.',
};

const FUNNEL_STAGE_REASONS: Partial<Record<FunnelStageId, ExclusionReason>> = {
  excluded_manually: 'excluded_manually',
  not_available: 'not_available',
  league: 'league_mismatch',
  suspended: 'suspended',
  inactive: 'inactive',
  cooldown: 'cooldown',
  insufficient_skill: 'insufficient_skill',
  availability_filter: 'availability_filter',
};

/** Etiqueta y orientación por etapa del embudo (parametrizado con escenario). */
export function getFunnelStageMeta(
  id: FunnelStageId,
  scenario: SimulationScenario,
): { label: string; fixHint: string; reason?: ExclusionReason } {
  const ctx = buildFunnelMetaContext(scenario);
  return {
    label: FUNNEL_STAGE_LABELS[id](ctx),
    fixHint: FUNNEL_STAGE_FIX_HINTS[id](ctx),
    reason: FUNNEL_STAGE_REASONS[id],
  };
}

/** Marca isBottleneck en la última etapa con dropped > 0 antes de elegibles (solo si pool vacío). */
export function markFunnelBottlenecks(stages: FunnelStage[], poolEmpty: boolean): FunnelStage[] {
  if (!poolEmpty) return stages.map((s) => ({ ...s, isBottleneck: false }));
  const filterStages = stages.filter(
    (s) => s.id !== 'universe' && s.id !== 'eligible' && s.dropped > 0 && !s.skipped,
  );
  const bottleneckId = filterStages[filterStages.length - 1]?.id;
  return stages.map((s) => ({ ...s, isBottleneck: s.id === bottleneckId }));
}

export function getBottleneckStage(stages: FunnelStage[]): FunnelStage | null {
  return stages.find((s) => s.isBottleneck) ?? null;
}

export const EXCLUSION_CRITERION_NAMES: Record<ExclusionReason, string> = {
  availability_filter: 'Disponibilidad CAD por categoría',
  insufficient_skill: 'Nivel de skill en matriz',
  league_mismatch: 'Liga del técnico',
  not_available: 'Switch global de disponibilidad',
  inactive: 'Actividad reciente (anti-inactividad)',
  cooldown: 'Cooldown por tipo de trabajo',
  suspended: 'Sin suspensión activa',
  excluded_manually: 'Exclusión manual en simulación',
};

const EXCLUSION_SHORT_LABELS: Record<ExclusionReason, string> = {
  not_available: 'No disponible',
  suspended: 'Suspendido',
  inactive: 'Inactivo',
  league_mismatch: 'Liga no coincide',
  cooldown: 'En cooldown',
  insufficient_skill: 'Sin habilidad',
  availability_filter: 'Filtro disponibilidad',
  excluded_manually: 'Excluido manualmente',
};

export type FailedCriterion = {
  reason: ExclusionReason;
  criterionName: string;
  count: number;
  whatFailed: string;
  howToFix: string;
};

export type PoolEmptyExplanation = {
  headline: string;
  caseRequirements: string;
  /** Resumen de una línea con los criterios que bloquearon el pool. */
  summaryLine: string;
  failedCriteria: FailedCriterion[];
  /** @deprecated Usar failedCriteria; se mantiene para compatibilidad de tests/UI legacy */
  primaryCause: string;
  actions: string[];
  productionNote: string;
  dominantReason: ExclusionReason | null;
  reasonBreakdown: { reason: ExclusionReason; count: number; label: string }[];
};

type ScenarioLabels = {
  categoryLabel: string;
  workTypeLabel: string;
  leagueLabel: string;
  minSkill: number;
};

function resolveScenarioLabels(result: SimulationResult): ScenarioLabels {
  const category = result.scenario.category as WorkCategory;
  const leagueLabel = result.scenario.caseLeague;
  return {
    categoryLabel: WORK_CATEGORY_LABELS[category] ?? result.scenario.category,
    workTypeLabel: WORK_TYPE_LABELS[result.scenario.workType] ?? result.scenario.workType,
    leagueLabel,
    minSkill: MIN_SKILL_FOR_CATEGORY[leagueLabel] ?? 1,
  };
}

function buildFailedCriterion(
  reason: ExclusionReason,
  count: number,
  universe: number,
  labels: ScenarioLabels,
): FailedCriterion {
  const criterionName = EXCLUSION_CRITERION_NAMES[reason];
  const techWord = count === 1 ? '1 técnico' : `${count} técnicos`;

  switch (reason) {
    case 'availability_filter':
      return {
        reason,
        criterionName,
        count,
        whatFailed: `${techWord} de ${universe} no tiene activa la disponibilidad CAD en la categoría «${labels.categoryLabel}».`,
        howToFix: `En Perfil → Disponibilidad, activa el switch global, CAD y el toggle de «${labels.categoryLabel}».`,
      };
    case 'insufficient_skill':
      return {
        reason,
        criterionName,
        count,
        whatFailed: `${techWord} de ${universe} no alcanza nivel ${labels.minSkill} de diseño para «${labels.workTypeLabel}» (liga ${labels.leagueLabel}).`,
        howToFix: `En el perfil técnico → Matriz de skills, declara «${labels.workTypeLabel}» con designLevel ≥ ${labels.minSkill}.`,
      };
    case 'league_mismatch':
      return {
        reason,
        criterionName,
        count,
        whatFailed: `${techWord} de ${universe} no está en liga «${labels.leagueLabel}» ni en la expansión de liga que permite este caso.`,
        howToFix: `Sube la liga del técnico o baja la complejidad del caso (modo Manual en el paso Caso) para exigir una liga menor.`,
      };
    case 'not_available':
      return {
        reason,
        criterionName,
        count,
        whatFailed: `${techWord} de ${universe} tiene el switch global de disponibilidad apagado.`,
        howToFix: 'En Perfil → Disponibilidad, activa el switch principal «Disponible para recibir casos».',
      };
    case 'inactive':
      return {
        reason,
        criterionName,
        count,
        whatFailed: `${techWord} de ${universe} fue excluido por superar el umbral de inactividad (dInactivityDays en config).`,
        howToFix: 'Revisa último login del técnico o ajusta «Inactividad» en Configuración Fauchard → Parámetros.',
      };
    case 'cooldown':
      return {
        reason,
        criterionName,
        count,
        whatFailed: `${techWord} de ${universe} está en cooldown reciente para el workType «${labels.workTypeLabel}».`,
        howToFix: 'Espera la ventana de cooldown o reduce tCooldownMinutes en la config activa (solo pruebas en sandbox).',
      };
    case 'suspended':
      return {
        reason,
        criterionName,
        count,
        whatFailed: `${techWord} de ${universe} tiene una suspensión activa (suspendedUntil en el futuro).`,
        howToFix: 'Revisa y levanta la suspensión del técnico en el panel de usuarios o espera a que expire.',
      };
    case 'excluded_manually':
      return {
        reason,
        criterionName,
        count,
        whatFailed: `${techWord} de ${universe} fue marcado como excluido en esta simulación (rechazos simulados).`,
        howToFix: 'En el paso Asignación, usa «Restablecer rechazos» para limpiar exclusiones manuales.',
      };
    default:
      return {
        reason,
        criterionName: 'Filtro del motor',
        count,
        whatFailed: `${techWord} de ${universe} no pasó un filtro del motor.`,
        howToFix: 'Revisa Configuración Fauchard y el escenario del paso Caso.',
      };
  }
}

function buildCaseRequirements(labels: ScenarioLabels): string {
  return `El caso exige: «${labels.workTypeLabel}» · liga ${labels.leagueLabel} · categoría ${labels.categoryLabel} · skill diseño ≥ ${labels.minSkill}.`;
}

function buildSummaryLine(failed: FailedCriterion[], universe: number): string {
  if (failed.length === 0) {
    return `Ninguno de los ${universe} técnicos cumplió los criterios de asignación.`;
  }
  if (failed.length === 1) {
    const f = failed[0]!;
    return `Bloqueo único: ${f.criterionName} — ${f.whatFailed}`;
  }
  const names = failed.map((f) => f.criterionName).join(', ');
  return `Bloqueos detectados (${failed.length} criterios): ${names}. Ningún técnico superó todos a la vez.`;
}

/** Explicación en lenguaje usuario cuando poolEmpty. */
export function buildPoolEmptyExplanation(result: SimulationResult): PoolEmptyExplanation {
  const labels = resolveScenarioLabels(result);
  const universe = result.funnel.universe;
  const caseRequirements = buildCaseRequirements(labels);
  const stages = result.funnel.stages ?? [];

  const reasonBreakdown = (Object.entries(result.funnel.excluded) as [ExclusionReason, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({
      reason,
      count,
      label: EXCLUSION_SHORT_LABELS[reason],
    }));

  const productionNote =
    'En producción, sin técnicos elegibles el caso entra a cola pendiente_pool (banner «Buscando técnicos…») hasta que haya elegibles o expire el TTL; no se crea asignación hasta entonces.';

  const droppedStages = stages.filter(
    (s) => s.dropped > 0 && s.id !== 'universe' && s.id !== 'eligible' && !s.skipped,
  );
  const bottleneck = getBottleneckStage(stages);

  if (droppedStages.length === 0 && reasonBreakdown.length === 0) {
    const failedCriteria: FailedCriterion[] = [
      {
        reason: 'not_available',
        criterionName: 'Diagnóstico no registrado',
        count: universe,
        whatFailed: `Los ${universe} técnicos fueron descartados pero el embudo no registró el motivo por etapa.`,
        howToFix: 'Vuelve a simular. Si persiste, revisa Configuración Fauchard y skills/disponibilidad del escenario.',
      },
    ];
    return {
      headline: 'Pool vacío: ningún técnico elegible',
      caseRequirements,
      summaryLine: buildSummaryLine(failedCriteria, universe),
      failedCriteria,
      primaryCause: failedCriteria[0]!.whatFailed,
      actions: failedCriteria.map((f) => f.howToFix),
      productionNote,
      dominantReason: null,
      reasonBreakdown,
    };
  }

  const failedCriteria: FailedCriterion[] = droppedStages.map((stage) => {
    const reason = stage.reason ?? 'not_available';
    return {
      ...buildFailedCriterion(reason, stage.dropped, universe, labels),
      criterionName: stage.label,
      howToFix: stage.fixHint,
    };
  });

  if (failedCriteria.length === 0 && reasonBreakdown.length > 0) {
    reasonBreakdown.forEach(({ reason, count }) => {
      failedCriteria.push(buildFailedCriterion(reason, count, universe, labels));
    });
  }

  const dominant = bottleneck?.reason
    ? { reason: bottleneck.reason, count: bottleneck.dropped }
    : reasonBreakdown[0];
  const actions = bottleneck
    ? [bottleneck.fixHint, ...failedCriteria.filter((f) => f.reason !== bottleneck.reason).map((f) => f.howToFix)]
    : failedCriteria.map((f) => f.howToFix);

  const summaryLine = bottleneck
    ? `Se vació en: ${bottleneck.label} (−${bottleneck.dropped} de ${universe}). ${bottleneck.fixHint}`
    : buildSummaryLine(failedCriteria, universe);

  const primaryCause = bottleneck
    ? `${bottleneck.dropped} técnicos cayeron en «${bottleneck.label}».`
    : failedCriteria.length === 1
      ? failedCriteria[0]!.whatFailed
      : `De ${universe} técnicos, el embudo muestra ${droppedStages.length} etapas con pérdidas antes de llegar a 0 elegibles.`;

  return {
    headline: 'Pool vacío: ningún técnico elegible',
    caseRequirements,
    summaryLine,
    failedCriteria,
    primaryCause,
    actions: [...new Set(actions)],
    productionNote,
    dominantReason: dominant?.reason ?? null,
    reasonBreakdown,
  };
}

/** Mapa technicianId → posición en cadena (1 = ganador). */
export function buildChainPositionMap(retryChain: string[]): Map<string, number> {
  const map = new Map<string, number>();
  retryChain.forEach((id, i) => map.set(id, i + 1));
  return map;
}

export function buildRetryChainDetails(
  rankedCore: RankedCandidate[],
  retryChain: string[],
  techById: Map<string, { fullName?: string | null; leagueLevel?: string | null }>,
): RetryChainEntry[] {
  const byId = new Map(rankedCore.map((r) => [r.technicianId, r]));
  return retryChain.map((technicianId, i) => {
    const row = byId.get(technicianId);
    const tech = techById.get(technicianId);
    return {
      position: i + 1,
      technicianId,
      fullName: tech?.fullName ?? technicianId,
      score: row?.score ?? 0,
      leagueLevel: tech?.leagueLevel ?? 'bronce',
    };
  });
}

export async function resolvePricePreviewForSimulation(input: {
  restorationCode?: string;
  materialCode?: string;
  shadeCode?: string;
  urgencyLabel?: string;
}): Promise<import('@/lib/fauchard/simulationTypes').PricePreview> {
  const missing: string[] = [];
  if (!input.restorationCode) missing.push('restauración');
  if (!input.materialCode) missing.push('material');
  if (!input.shadeCode) missing.push('shade');
  if (!input.urgencyLabel) missing.push('urgencia');

  if (missing.length > 0) {
    return { resolved: false, missingDimensions: missing };
  }

  const { resolveListPriceAction } = await import('@/lib/db/actions/priceRules');
  const res = await resolveListPriceAction({
    restorationType: input.restorationCode,
    material: input.materialCode,
    shade: input.shadeCode,
    urgency: input.urgencyLabel,
  });

  if (!res.success || !res.data) {
    return { resolved: false, missingDimensions: ['regla de precio'] };
  }

  return {
    resolved: true,
    ruleId: res.data.ruleId,
    ruleCode: res.data.ruleCode,
    cost: res.data.cost,
    feePercent: res.data.feePercent,
    salePrice: res.data.salePrice,
  };
}
