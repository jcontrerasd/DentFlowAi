/**
 * Helpers puros del simulador Fauchard (testeables sin DB).
 */

import type { RankedCandidate } from '@/lib/db/actions/assignment';
import type { RetryChainEntry } from '@/lib/fauchard/simulationTypes';

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
