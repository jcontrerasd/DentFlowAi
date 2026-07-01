'use client';

import { useReportWebVitals } from 'next/web-vitals';

const ENDPOINT = process.env.NEXT_PUBLIC_LOG_ENDPOINT ?? '/api/telemetry';

/**
 * Reporta Core Web Vitals (LCP, FID, CLS, TTFB, INP) al endpoint de telemetría.
 * Montar una sola vez en el dashboard layout.
 * Los datos aparecen en Cloud Logging bajo la etiqueta [DentFlowAi Telemetry].
 */
export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({
      app: 'dentflowai',
      level: 'info',
      message: `web_vital:${metric.name}`,
      timestamp: new Date().toISOString(),
      path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      context: {
        name: metric.name,
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        rating: metric.rating,
        navigationType: metric.navigationType,
        id: metric.id,
      },
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  });

  return null;
}
