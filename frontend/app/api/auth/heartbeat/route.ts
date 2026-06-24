import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Fase 5 (ajuste login, TAB_CLOSE_LOGOUT_ENABLED). Llamado por SessionHeartbeat.tsx cada
 * SESSION_HEARTBEAT_SECONDS mientras la pestaña esté abierta. Resuelve el `sid` desde la
 * cookie de sesión de la propia request — el cliente nunca envía ni conoce el sid.
 */
export async function POST() {
  if (process.env.TAB_CLOSE_LOGOUT_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const session = await auth();
  const sid = (session?.user as any)?.sid;
  if (!sid) {
    return NextResponse.json({ ok: false, error: 'No session' }, { status: 401 });
  }

  await db.update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(sessions.sessionToken, sid));

  return NextResponse.json({ ok: true });
}
