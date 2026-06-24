'use client';

import { useEffect, useState } from 'react';
import { getTabCloseLogoutEnabledAction } from '@/lib/db/actions/user';

/**
 * Fase 5 (ajuste login, TAB_CLOSE_LOGOUT_ENABLED). Se monta en dashboard/layout.tsx mientras
 * hay sesión. Hace ping a /api/auth/heartbeat cada SESSION_HEARTBEAT_SECONDS para mantener
 * `sessions.lastSeenAt` fresco, y dispara /api/auth/close por sendBeacon al cerrar la pestaña
 * o navegar fuera. Se auto-oculta (no monta nada) si el flag está off — mismo patrón que
 * AvailabilityBadge.
 */
export default function SessionHeartbeat() {
  const [enabled, setEnabled] = useState(false);
  const [heartbeatSeconds, setHeartbeatSeconds] = useState(30);

  useEffect(() => {
    getTabCloseLogoutEnabledAction().then((r) => {
      setEnabled(r.enabled);
      setHeartbeatSeconds(r.heartbeatSeconds);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const ping = () => {
      fetch('/api/auth/heartbeat', { method: 'POST', keepalive: true }).catch(() => {});
    };
    ping();
    const interval = setInterval(ping, heartbeatSeconds * 1000);

    const closeSession = () => {
      navigator.sendBeacon('/api/auth/close');
    };
    window.addEventListener('beforeunload', closeSession);
    window.addEventListener('pagehide', closeSession);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', closeSession);
      window.removeEventListener('pagehide', closeSession);
    };
  }, [enabled, heartbeatSeconds]);

  return null;
}
