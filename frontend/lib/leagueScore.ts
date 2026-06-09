/**
 * Penalización de transición de liga (Fase 2) sobre el score Fauchard.
 *
 * Helper puro y sin dependencias (testeable sin DB y sin ciclo fauchard↔league):
 * mientras el técnico está en su período de prueba en la liga superior, su score se
 * reduce por el factor `(1 - lPenaltyTransition)`.
 *
 * Ver [Doc/DentFlowAI_Diseño_Funcional_Liga.md](../../Doc/DentFlowAI_Diseño_Funcional_Liga.md).
 */
export function applyLeagueTransitionPenalty(
  score: number,
  inTransition: boolean,
  lPenaltyTransition: number
): number {
  if (!inTransition) return score;
  const factor = 1 - lPenaltyTransition;
  return score * (factor > 0 ? factor : 0);
}
