'use server';

import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { db, infraPromise } from '@/lib/db';
import { user, sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

import { getForcedIdentity } from './test-identity';
import { getSessionTimeoutConfig, evaluateSessionTimeout, touchSessionActivity } from '@/lib/db/sessionTimeouts';

/**
 * Motor de resolución de identidad delegada.
 * Resuelve quién es el usuario que está operando en el sistema,
 * permitiendo que un Admin actúe en nombre de otro.
 */
export async function getServerIdentity() {
  // Bypass para pruebas de integración (solo fuera de producción)
  if (process.env.NODE_ENV !== 'production') {
    const forced = getForcedIdentity();
    if (forced) return forced;
  }

  if (infraPromise) await infraPromise;

  try {
    const session = await auth();

    if (!session?.user) {
      return null;
    }

    // Fase 1/4/5 (ajuste login): con single-session, tab-close-logout o timeout de sesión
    // (v5.29) activos, una sesión válida en el JWT puede haber sido invalidada por nosotros
    // (otro login la reemplazó, o venció por inactividad/tope absoluto). Verificamos contra
    // nuestra tabla `sessions` propia — sin nada de esto activado, cero queries extra.
    const timeoutCfg = await getSessionTimeoutConfig();
    const ownSessionTrackingActive = process.env.SINGLE_SESSION_ENABLED === 'true'
      || process.env.TAB_CLOSE_LOGOUT_ENABLED === 'true'
      || timeoutCfg.enabled;
    if (ownSessionTrackingActive) {
      const sid = (session.user as any).sid;
      if (!sid) return null;
      const [row] = await db.select({
        sessionToken: sessions.sessionToken,
        createdAt: sessions.createdAt,
        lastActivityAt: sessions.lastActivityAt,
      })
        .from(sessions)
        .where(eq(sessions.sessionToken, sid))
        .limit(1);
      if (!row) return null;
      if (timeoutCfg.enabled) {
        if (evaluateSessionTimeout(row, new Date(), timeoutCfg) !== 'valid') return null;
        await touchSessionActivity(sid, row.lastActivityAt);
      }
    }

    const cookieStore = await cookies();
    const impersonateId = cookieStore.get('dentflow_impersonate_id')?.value;

    const userRole = (session.user as any).role;
    const isSystemAdmin = userRole === 'admin' || 
                          session.user.email === 'jaime.contreras.d@gmail.com' ||
                          session.user.email?.endsWith('@dentflow.ai');
    
    const realIdentity = {
      id: session.user.id,
      orgId: (session.user as any).organizationId,
      role: userRole,
      fullName: session.user.name,
      email: session.user.email,
      isSimulating: false,
      isSystemAdmin,
      adminId: session.user.id
    };

    let finalIdentity = realIdentity;

    // Si no hay cookie o no es el master/admin, la identidad es la real
    if (impersonateId && isSystemAdmin) {
      // Resolvemos el usuario simulado desde la DB
      const [simulated] = await db
        .select({
          id: user.id,
          role: user.role,
          fullName: user.fullName,
          orgId: user.organizationId,
          email: user.email
        })
        .from(user)
        .where(eq(user.id, impersonateId))
        .limit(1);

      if (simulated) {
        finalIdentity = {
          id: simulated.id,
          fullName: simulated.fullName,
          orgId: simulated.orgId,
          role: simulated.role,
          email: simulated.email,
          isSimulating: true,
          isSystemAdmin,
          adminId: session.user.id
        };
      } else {
        // La cookie apunta a un usuario que ya no existe (borrado, cookie stale).
        // Limpiarla automáticamente y continuar como el admin real — así el admin
        // no queda bloqueado y no puede operar accidentalmente con su propio id
        // en una pantalla que esperaba al usuario simulado.
        console.warn('[getServerIdentity] Cookie de impersonación inválida (userId no existe), limpiando:', impersonateId);
        try {
          const cookieStore = await cookies();
          cookieStore.delete('dentflow_impersonate_id');
        } catch { /* best-effort */ }
      }
    }

    return finalIdentity;
  } catch (error) {
     console.error("[getServerIdentity] Critical Error:", error);
     return null;
  }
}

/**
 * Fase 4 (ajuste login): chequeo liviano para que la UI (dashboard/layout.tsx) detecte
 * que la sesión actual fue invalidada (otro login la reemplazó, o venció por timeout v5.29)
 * y cierre sesión client-side. Con todo apagado, siempre retorna válido sin query extra
 * (mismo criterio de gating que getServerIdentity).
 */
export async function validateOwnSessionAction(): Promise<{ valid: boolean; reason?: 'session_replaced' | 'session_expired' }> {
  if (infraPromise) await infraPromise;
  try {
    const timeoutCfg = await getSessionTimeoutConfig();
    const ownSessionTrackingActive = process.env.SINGLE_SESSION_ENABLED === 'true'
      || process.env.TAB_CLOSE_LOGOUT_ENABLED === 'true'
      || timeoutCfg.enabled;
    if (!ownSessionTrackingActive) return { valid: true };

    const session = await auth();
    if (!session?.user) return { valid: true }; // sin sesión: nada que invalidar, login ya redirige

    const sid = (session.user as any).sid;
    if (!sid) return { valid: false, reason: 'session_replaced' };

    const [row] = await db.select({
      sessionToken: sessions.sessionToken,
      createdAt: sessions.createdAt,
      lastActivityAt: sessions.lastActivityAt,
    })
      .from(sessions)
      .where(eq(sessions.sessionToken, sid))
      .limit(1);
    if (!row) return { valid: false, reason: 'session_replaced' };
    if (timeoutCfg.enabled && evaluateSessionTimeout(row, new Date(), timeoutCfg) !== 'valid') {
      return { valid: false, reason: 'session_expired' };
    }
    return { valid: true };
  } catch (error) {
    console.error("[validateOwnSessionAction] Error:", error);
    return { valid: true }; // fail-open: un error de DB no debe expulsar sesiones válidas
  }
}

/**
 * Inicia la simulación de un usuario específico.
 */
export async function startSimulationAction(userId: string) {
  if (infraPromise) await infraPromise;

  try {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'admin' || session?.user?.email === 'jaime.contreras.d@gmail.com';
    
    if (!isAdmin) return { success: false, error: "No autorizado" };

    // Refrescar lastLoginAt del usuario simulado para que el filtro de inactividad
    // de Fauchard no lo excluya por no hacer login propio (la impersonación no pasa
    // por auth.config.ts donde se escribe este campo).
    await db.update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, userId));

    const cookieStore = await cookies();
    cookieStore.set('dentflow_impersonate_id', userId, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 día de duración
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: "Error de servidor" };
  }
}

/**
 * Finaliza cualquier simulación activa.
 */
export async function stopSimulationAction() {
  if (infraPromise) await infraPromise;

  try {
    const cookieStore = await cookies();
    cookieStore.delete('dentflow_impersonate_id');
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}
