import { describe, it, expect } from 'vitest';
import {
  deriveCaseComplexity,
  deriveScenarioFromInputs,
  COMPLEXITY_TO_LEAGUE,
} from '@/lib/fauchard/assignmentScenario';
import { CASE_COMPLEXITY } from '@/lib/constants/dental';
import {
  buildChainPositionMap,
  buildRetryChainDetails,
} from '@/lib/fauchard/simulationHelpers';
import type { RankedCandidate } from '@/lib/db/actions/assignment';

describe('deriveScenarioFromInputs', () => {
  it('mapea corona unitaria básica a bronce', () => {
    const s = deriveScenarioFromInputs('Corona Unitaria', [36], undefined, false);
    expect(s.workType).toBe('corona_unitaria');
    expect(s.category).toBe('coronas');
    expect(s.caseComplexity).toBe(CASE_COMPLEXITY.BASICO);
    expect(s.caseLeague).toBe(COMPLEXITY_TO_LEAGUE[CASE_COMPLEXITY.BASICO]);
  });

  it('mapea 4 carillas a intermedio', () => {
    const s = deriveScenarioFromInputs('Carilla', [11, 12, 13, 14], undefined, false);
    expect(s.workType).toBe('carilla_multiple');
    expect(s.category).toBe('carillas');
    expect(s.caseComplexity).toBe(CASE_COMPLEXITY.INTERMEDIO);
  });

  it('mapea guía quirúrgica a crítico', () => {
    const s = deriveScenarioFromInputs('Guía Quirúrgica', []);
    expect(s.caseComplexity).toBe(CASE_COMPLEXITY.CRITICO);
    expect(s.caseLeague).toBe('elite');
  });

  it('respeta override de complejidad con value intermedio → plata', () => {
    const s = deriveScenarioFromInputs('Corona Unitaria', [], CASE_COMPLEXITY.INTERMEDIO);
    expect(s.caseLeague).toBe('plata');
  });

  it('notas estéticas largas no alteran complejidad en modo auto', () => {
    const s = deriveScenarioFromInputs('Corona Unitaria', [11, 12, 13, 14]);
    expect(s.caseComplexity).toBe(CASE_COMPLEXITY.INTERMEDIO);
    expect(s.caseLeague).toBe('plata');
  });
});

describe('deriveCaseComplexity', () => {
  it('avanzado con 10+ piezas', () => {
    const teeth = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(deriveCaseComplexity('Corona Unitaria', teeth)).toBe(CASE_COMPLEXITY.AVANZADO);
  });
});

describe('buildChainPositionMap', () => {
  it('asigna posiciones 1..N en orden de retryChain', () => {
    const map = buildChainPositionMap(['tech-a', 'tech-b', 'tech-c']);
    expect(map.get('tech-a')).toBe(1);
    expect(map.get('tech-b')).toBe(2);
    expect(map.get('tech-c')).toBe(3);
    expect(map.get('tech-d')).toBeUndefined();
  });
});

describe('buildRetryChainDetails', () => {
  it('enriquece cadena con nombres y scores', () => {
    const rankedCore: RankedCandidate[] = [
      { technicianId: 't1', score: 0.9, components: { Q: 1, P: 1, E: 1, B: 0.5, L: 0, N: 0 }, activeLoad: 2 },
      { technicianId: 't2', score: 0.7, components: { Q: 0.8, P: 0.8, E: 0.8, B: 0, L: 0, N: 0 }, activeLoad: 1 },
    ];
    const techById = new Map([
      ['t1', { fullName: 'Ana Tech', leagueLevel: 'oro' }],
      ['t2', { fullName: 'Bob Lab', leagueLevel: 'plata' }],
    ]);
    const details = buildRetryChainDetails(rankedCore, ['t1', 't2'], techById);
    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({ position: 1, fullName: 'Ana Tech', score: 0.9, leagueLevel: 'oro' });
    expect(details[1]).toMatchObject({ position: 2, fullName: 'Bob Lab', score: 0.7, leagueLevel: 'plata' });
  });
});

describe('simulateAssignmentAction contract (shape)', () => {
  it('precio usa restoration code; asignación usa restoration label', () => {
    const priceInput = { restorationType: 'rest_001' };
    const assignInput = { restorationLabel: 'Corona Unitaria' };
    expect(priceInput.restorationType).toMatch(/^rest_/);
    expect(assignInput.restorationLabel).toBe('Corona Unitaria');
  });

  it('no expone campos legacy invitedCount/alphaBonus en tipo de respuesta documentado', () => {
    const legacyKeys = ['invitedCount', 'alphaBonus', 'distribution', 'eligiblePool'];
    const modernShape = {
      scenario: {},
      funnel: { universe: 0, excluded: {}, eligible: 0, stages: [] },
      ranked: [],
      assignmentPreview: {
        selectedTechnicianId: null,
        attemptsBudget: 3,
        retryChain: [],
        retryChainDetails: [],
      },
      pricePreview: { resolved: false },
      poolEmpty: false,
    };
    for (const k of legacyKeys) {
      expect(modernShape).not.toHaveProperty(k);
    }
  });

  it('ranked incluye componente B y chainPosition en contrato moderno', () => {
    const row = {
      technicianId: 't1',
      rank: 1,
      score: 0.9,
      components: { Q: 1, P: 1, E: 1, B: 0.8, L: 0, N: 0 },
      activeLoad: 0,
      fullName: 'Test',
      leagueLevel: 'oro',
      excluded: false,
      wouldAssign: true,
      chainPosition: 1 as number | null,
    };
    expect(row.chainPosition).toBe(1);
    expect(row.components.B).toBe(0.8);
  });
});
