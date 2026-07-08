/**
 * v5.29 — Timeout de sesión: inactividad (deslizante) + absoluto, gated por
 * SESSION_TIMEOUTS_ENABLED. Helper plano (no server action) — lo consumen
 * getServerIdentity()/validateOwnSessionAction() (actions/impersonation.ts) y el
 * callback jwt (auth.config.ts).
 */

import { eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { getFlag, getNumericSetting } from '@/lib/featureFlags';

export type SessionTimeoutConfig = {
  enabled: boolean;
  idleMs: number;
  absoluteMs: number;
};

export type SessionTimeoutResult = 'valid' | 'expired_idle' | 'expired_absolute';

const ACTIVITY_TOUCH_THROTTLE_MS = 5 * 60 * 1000;

export async function getSessionTimeoutConfig(): Promise<SessionTimeoutConfig> {
  const [enabled, idleMinutes, absoluteHours] = await Promise.all([
    getFlag('SESSION_TIMEOUTS_ENABLED'),
    getNumericSetting('SESSION_IDLE_TIMEOUT_MINUTES', 120),
    getNumericSetting('SESSION_ABSOLUTE_TIMEOUT_HOURS', 8),
  ]);
  return {
    enabled,
    idleMs: idleMinutes * 60 * 1000,
    absoluteMs: absoluteHours * 60 * 60 * 1000,
  };
}

/**
 * Timestamps null (fila creada en la ventana de carrera antes de que corriera la
 * migración v5.29) se tratan como válidos — el reloj arranca recién ahora, no se
 * fuerza un logout por una columna que aún no existía.
 */
export function evaluateSessionTimeout(
  row: { createdAt: Date | null; lastActivityAt: Date | null },
  now: Date,
  cfg: SessionTimeoutConfig,
): SessionTimeoutResult {
  if (row.lastActivityAt && now.getTime() - row.lastActivityAt.getTime() > cfg.idleMs) {
    return 'expired_idle';
  }
  if (row.createdAt && now.getTime() - row.createdAt.getTime() > cfg.absoluteMs) {
    return 'expired_absolute';
  }
  return 'valid';
}

/** Renovación deslizante del timeout de inactividad, con throttle para no escribir en cada request. */
export async function touchSessionActivity(sid: string, lastActivityAt: Date | null): Promise<void> {
  if (lastActivityAt && Date.now() - lastActivityAt.getTime() < ACTIVITY_TOUCH_THROTTLE_MS) return;
  try {
    await db.update(sessions).set({ lastActivityAt: new Date() }).where(eq(sessions.sessionToken, sid));
  } catch (e) {
    console.error('[sessionTimeouts] Error renovando lastActivityAt:', e);
  }
}

/** Helper puro para el callback jwt — tolera loginAt ausente/no-numérico (nunca expira). */
export function isAbsoluteExpired(loginAt: unknown, now: number, absoluteMs: number): boolean {
  if (typeof loginAt !== 'number' || !Number.isFinite(loginAt)) return false;
  return now - loginAt > absoluteMs;
}

/** Barrido del cron: borra filas vencidas por inactividad o tope absoluto. Solo garbage collection. */
export async function deleteExpiredSessions(cfg: { idleMs: number; absoluteMs: number }): Promise<number> {
  const idleCutoff = new Date(Date.now() - cfg.idleMs);
  const absoluteCutoff = new Date(Date.now() - cfg.absoluteMs);
  const deletedIdle = await db.delete(sessions).where(lt(sessions.lastActivityAt, idleCutoff)).returning({ sessionToken: sessions.sessionToken });
  const deletedAbsolute = await db.delete(sessions).where(lt(sessions.createdAt, absoluteCutoff)).returning({ sessionToken: sessions.sessionToken });
  return deletedIdle.length + deletedAbsolute.length;
}
