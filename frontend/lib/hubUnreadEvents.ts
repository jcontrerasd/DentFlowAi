/**
 * Bus de eventos para refrescar al instante los contadores de no-leídos del Centro de control
 * (campana global del header + badges de tarjetas en listados) sin esperar a un foco/navegación.
 * Se dispara cuando un caso se marca como leído. Espejo del patrón de `lib/dashboard/dashboardRefresh.ts`.
 */
export const HUB_UNREAD_REFRESH_EVENT = 'dentflow:hub-unread-refresh';

export function dispatchHubUnreadRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(HUB_UNREAD_REFRESH_EVENT));
}

export function subscribeHubUnreadRefresh(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => handler();
  window.addEventListener(HUB_UNREAD_REFRESH_EVENT, wrapped);
  return () => window.removeEventListener(HUB_UNREAD_REFRESH_EVENT, wrapped);
}
