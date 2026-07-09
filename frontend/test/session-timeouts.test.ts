/**
 * v5.29 — Cobertura pura de la lógica de timeout de sesión (evaluateSessionTimeout,
 * isAbsoluteExpired, touchSessionActivity). Sin DB real: touchSessionActivity mockea
 * @/lib/db para verificar el throttle sin abrir conexión.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateSessionTimeout, isAbsoluteExpired } from '@/lib/db/sessionTimeouts';

const cfg = { enabled: true, idleMs: 2 * 60 * 60 * 1000, absoluteMs: 8 * 60 * 60 * 1000 };

describe('evaluateSessionTimeout', () => {
  const now = new Date('2026-07-08T12:00:00Z');

  it('válido: sesión reciente, dentro de ambos límites', () => {
    const row = { createdAt: new Date('2026-07-08T09:00:00Z'), lastActivityAt: new Date('2026-07-08T11:30:00Z') };
    expect(evaluateSessionTimeout(row, now, cfg)).toBe('valid');
  });

  it('expired_idle: última actividad hace más de 2h', () => {
    const row = { createdAt: new Date('2026-07-08T09:00:00Z'), lastActivityAt: new Date('2026-07-08T09:30:00Z') };
    expect(evaluateSessionTimeout(row, now, cfg)).toBe('expired_idle');
  });

  it('borde idle: exactamente 2h no vence (solo > vence)', () => {
    const row = { createdAt: new Date('2026-07-08T09:00:00Z'), lastActivityAt: new Date('2026-07-08T10:00:00Z') };
    expect(evaluateSessionTimeout(row, now, cfg)).toBe('valid');
  });

  it('expired_absolute: login hace más de 8h, aunque haya actividad reciente', () => {
    const row = { createdAt: new Date('2026-07-08T03:00:00Z'), lastActivityAt: new Date('2026-07-08T11:59:00Z') };
    expect(evaluateSessionTimeout(row, now, cfg)).toBe('expired_absolute');
  });

  it('timestamps null (ventana pre-migración): válido, el reloj arranca ahora', () => {
    const row = { createdAt: null, lastActivityAt: null };
    expect(evaluateSessionTimeout(row, now, cfg)).toBe('valid');
  });

  it('idle vence antes que el absoluto cuando ambos aplicarían', () => {
    // createdAt hace 9h (ya venció absoluto) y lastActivityAt hace 3h (también venció idle):
    // el chequeo de idle corre primero.
    const row = { createdAt: new Date('2026-07-08T03:00:00Z'), lastActivityAt: new Date('2026-07-08T09:00:00Z') };
    expect(evaluateSessionTimeout(row, now, cfg)).toBe('expired_idle');
  });
});

describe('isAbsoluteExpired', () => {
  const now = Date.now();
  const absoluteMs = 8 * 60 * 60 * 1000;

  it('undefined loginAt: nunca expira (gracia pre-rollout)', () => {
    expect(isAbsoluteExpired(undefined, now, absoluteMs)).toBe(false);
  });

  it('loginAt no numérico: nunca expira', () => {
    expect(isAbsoluteExpired('not-a-number', now, absoluteMs)).toBe(false);
  });

  it('loginAt reciente: no expira', () => {
    expect(isAbsoluteExpired(now - 60_000, now, absoluteMs)).toBe(false);
  });

  it('loginAt hace más de 8h: expira', () => {
    expect(isAbsoluteExpired(now - (absoluteMs + 60_000), now, absoluteMs)).toBe(true);
  });
});

const updateMock = vi.fn();
const whereMock = vi.fn();
const setMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    update: (...args: unknown[]) => {
      updateMock(...args);
      return { set: setMock };
    },
  },
}));

describe('touchSessionActivity', () => {
  beforeEach(() => {
    updateMock.mockReset();
    setMock.mockReset();
    whereMock.mockReset();
    setMock.mockReturnValue({ where: whereMock });
    whereMock.mockResolvedValue(undefined);
  });

  it('no escribe si lastActivityAt es reciente (dentro del throttle de 5 min)', async () => {
    const { touchSessionActivity } = await import('@/lib/db/sessionTimeouts');
    await touchSessionActivity('sid-1', new Date(Date.now() - 60_000));
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('escribe si lastActivityAt es null', async () => {
    const { touchSessionActivity } = await import('@/lib/db/sessionTimeouts');
    await touchSessionActivity('sid-2', null);
    expect(updateMock).toHaveBeenCalled();
  });

  it('escribe si lastActivityAt es más viejo que el throttle', async () => {
    const { touchSessionActivity } = await import('@/lib/db/sessionTimeouts');
    await touchSessionActivity('sid-3', new Date(Date.now() - 6 * 60 * 1000));
    expect(updateMock).toHaveBeenCalled();
  });
});
