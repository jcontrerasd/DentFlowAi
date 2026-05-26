'use client';

import { useEffect } from 'react';
import { logError } from '@/lib/logger';

export default function ClientTelemetry() {
  useEffect(() => {
    // No registrar errores de ventana en desarrollo para evitar bucles de refresco (Fast Refresh)
    // causados por extensiones de Chrome que escriben en los logs.
    if (process.env.NODE_ENV === 'development') return;

    const onWindowError = (event: ErrorEvent) => {
      logError('Window runtime error', event.error ?? event.message, {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      logError('Unhandled promise rejection', event.reason);
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}