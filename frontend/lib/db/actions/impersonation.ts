'use server';

import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { db, infraPromise } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

import { getForcedIdentity } from './test-identity';

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
    const logFile = '/Users/jaimecontreras/Documents/Projects/DentFlowAi/frontend/uat_debug.log';
    
    if (!session?.user) {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] No session found\n`);
      return null;
    }

    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Session User: ${JSON.stringify(session.user)}\n`);

    const cookieStore = await cookies();
    const impersonateId = cookieStore.get('dentflow_impersonate_id')?.value;
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Impersonate ID: ${impersonateId || 'none'}\n`);
    
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
      }
    }

    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Final Identity Role: ${finalIdentity.role} (Type: ${typeof finalIdentity.role})\n`);
    return finalIdentity;
  } catch (error) {
     console.error("[getServerIdentity] Critical Error:", error);
     return null;
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
