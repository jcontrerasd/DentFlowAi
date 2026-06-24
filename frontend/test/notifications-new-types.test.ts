/**
 * Unit — reglas de canal de notificación (v5.0, Fase 6, §9.5).
 * Los tipos del modelo de disponibilidad usan email + in-app; los tipos
 * no listados explícitamente caen al default (email + in-app).
 */
import { describe, it, expect } from 'vitest';
import { channelsForNotification, type NotificationType } from '@/lib/services/notifications';

const V50_TYPES: NotificationType[] = [
  'NIVEL_2_ALCANZADO',
  'NIVEL_3_AUTO_OFF',
  'AUTO_OFF_PREVENTIVO',
  'RECORDATORIO_ACTIVIDAD',
  'PERDON_ADMIN',
  'CHECK_IN_DENTISTA',
  'REVISION_PLAZO_POR_VENCER',
  'REVISION_PLAZO_VENCIDO',
];

describe('channelsForNotification (Fase 6 §9.5)', () => {
  it('los tipos v5.0 emiten email + in-app', () => {
    for (const t of V50_TYPES) {
      const ch = channelsForNotification(t);
      expect(ch.email, `${t}.email`).toBe(true);
      expect(ch.inApp, `${t}.inApp`).toBe(true);
    }
  });

  it('un tipo sin entrada explícita cae al default email + in-app', () => {
    expect(channelsForNotification('NUEVA_ASIGNACION')).toEqual({ email: true, inApp: true });
  });
});
