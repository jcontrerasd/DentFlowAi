import { DASHBOARD_METRICS_REFRESH_EVENT } from '@/lib/dashboard/constants';

export function dispatchDashboardMetricsRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_METRICS_REFRESH_EVENT));
}

export function subscribeDashboardMetricsRefresh(
  handler: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const wrapped = () => handler();
  window.addEventListener(DASHBOARD_METRICS_REFRESH_EVENT, wrapped);
  return () => window.removeEventListener(DASHBOARD_METRICS_REFRESH_EVENT, wrapped);
}
