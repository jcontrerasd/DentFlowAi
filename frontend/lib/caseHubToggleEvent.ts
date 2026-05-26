/** Evento global para abrir/cerrar el UCH desde fuera de la página del caso (p. ej. tarjeta en listado). */
export const CASE_HUB_TOGGLE_EVENT = 'dentflow:caseHubToggle';

export type CaseHubToggleDetail = { caseId: string };

export function dispatchCaseHubToggle(caseId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<CaseHubToggleDetail>(CASE_HUB_TOGGLE_EVENT, { detail: { caseId } }));
}
