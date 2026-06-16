import { describe, it, expect } from 'vitest';
import { CASE_COMPLEXITY } from '@/lib/constants/dental';
import {
  passesCooldown,
  passesExcludedManually,
  passesInactive,
  passesLeague,
  passesNotAvailable,
  passesSkill,
  passesSuspended,
} from '@/lib/fauchard/funnelStagePredicates';
import {
  getBottleneckStage,
  getFunnelStageMeta,
  markFunnelBottlenecks,
} from '@/lib/fauchard/simulationHelpers';
import type { FunnelStage, SimulationScenario } from '@/lib/fauchard/simulationTypes';

const scenario: SimulationScenario = {
  workType: 'corona_unitaria',
  caseLeague: 'bronce',
  caseComplexity: CASE_COMPLEXITY.BASICO,
  category: 'coronas',
};

function applySequentialFilters(
  techs: { id: string; isAvailable?: boolean; leagueLevel?: string }[],
  exclude: Set<string>,
  cooldownIds: Set<string>,
  skillByUser: Map<string, number>,
  minSkill: number,
  now: Date,
  inactivityThreshold: Date,
): number[] {
  let remaining = [...techs];
  const counts: number[] = [remaining.length];

  const steps = [
    (t: (typeof techs)[0]) => passesExcludedManually(t.id, exclude),
    (t: (typeof techs)[0]) => passesNotAvailable(t.isAvailable),
    (t: (typeof techs)[0]) => passesLeague(t.leagueLevel, scenario.caseLeague),
    () => true,
    (t: (typeof techs)[0]) => passesInactive(null, inactivityThreshold),
    (t: (typeof techs)[0]) => passesCooldown(t.id, cooldownIds),
    (t: (typeof techs)[0]) => passesSkill(t.id, skillByUser, minSkill),
  ];

  for (const pred of steps) {
    remaining = remaining.filter(pred);
    counts.push(remaining.length);
  }
  counts.push(remaining.length);
  return counts;
}

describe('funnelStagePredicates', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const inactivityThreshold = new Date(now.getTime() - 30 * 86400000);

  it('passesLeagueForMode uses single mode (strict-first pool)', async () => {
    const { passesLeagueForMode } = await import('@/lib/fauchard/funnelStagePredicates');
    expect(passesLeagueForMode('plata', 'oro', 'strict')).toBe(false);
    expect(passesLeagueForMode('plata', 'oro', 'expand')).toBe(true);
    expect(passesLeagueForMode('oro', 'oro', 'strict')).toBe(true);
  });

  it('passesLeague acepta liga exacta y expansión (OR legacy diagnostic)', () => {
    expect(passesLeague('bronce', 'bronce')).toBe(true);
    expect(passesLeague('plata', 'oro')).toBe(true);
    expect(passesLeague('bronce', 'elite')).toBe(false);
  });

  it('passesSuspended rechaza suspensión futura', () => {
    expect(passesSuspended('2026-12-01', now)).toBe(false);
    expect(passesSuspended('2026-01-01', now)).toBe(true);
    expect(passesSuspended(null, now)).toBe(true);
  });

  it('embudo secuencial: suma de dropped equivale a universe - eligible', () => {
    const techs = [
      { id: 'a', isAvailable: true, leagueLevel: 'bronce' },
      { id: 'b', isAvailable: false, leagueLevel: 'bronce' },
      { id: 'c', isAvailable: true, leagueLevel: 'elite' },
    ];
    const exclude = new Set<string>();
    const cooldownIds = new Set<string>();
    const skillByUser = new Map([
      ['a', 2],
      ['b', 2],
      ['c', 2],
    ]);
    const counts = applySequentialFilters(
      techs,
      exclude,
      cooldownIds,
      skillByUser,
      1,
      now,
      inactivityThreshold,
    );
    const universe = counts[0]!;
    const eligible = counts[counts.length - 1]!;
    let totalDropped = 0;
    for (let i = 1; i < counts.length; i++) {
      totalDropped += counts[i - 1]! - counts[i]!;
    }
    expect(universe - eligible).toBe(totalDropped);
    expect(eligible).toBe(2);
  });
});

describe('markFunnelBottlenecks', () => {
  const meta = (id: FunnelStage['id'], dropped: number, countAfter: number): FunnelStage => {
    const m = getFunnelStageMeta(id, scenario);
    return {
      id,
      label: m.label,
      fixHint: m.fixHint,
      dropped,
      countAfter,
      reason: m.reason,
    };
  };

  it('marca la última etapa con pérdidas cuando pool vacío', () => {
    const stages: FunnelStage[] = [
      meta('universe', 0, 18),
      meta('not_available', 2, 16),
      meta('availability_filter', 16, 0),
      meta('eligible', 0, 0),
    ];
    const marked = markFunnelBottlenecks(stages, true);
    const bottleneck = getBottleneckStage(marked);
    expect(bottleneck?.id).toBe('availability_filter');
    expect(bottleneck?.dropped).toBe(16);
  });

  it('no marca bottleneck si hay elegibles', () => {
    const stages: FunnelStage[] = [
      meta('universe', 0, 10),
      meta('not_available', 1, 9),
      meta('eligible', 0, 9),
    ];
    const marked = markFunnelBottlenecks(stages, false);
    expect(getBottleneckStage(marked)).toBeNull();
  });
});

describe('getFunnelStageMeta', () => {
  it('parametriza labels con categoría y workType', () => {
    const avail = getFunnelStageMeta('availability_filter', scenario, true);
    expect(avail.label).toMatch(/Coronas/);
    expect(avail.fixHint).toMatch(/Disponibilidad/i);

    const skill = getFunnelStageMeta('insufficient_skill', scenario);
    expect(skill.label).toMatch(/Corona Unitaria/i);
    expect(skill.fixHint).toMatch(/designLevel/i);
  });
});
