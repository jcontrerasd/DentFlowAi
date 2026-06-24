import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { sessions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Fase 5 (ajuste login, TAB_CLOSE_LOGOUT_ENABLED). Disparado por `navigator.sendBeacon` en
 * beforeunload/pagehide (SessionHeartbeat.tsx) — sin body, sin esperar respuesta. Borra la
 * fila de `sessions` de la propia request; el cron de limpieza es el plan B si sendBeacon no
 * llega a dispararse (cierre abrupto del navegador, crash, etc).
 */
export async function POST() {
  if (process.env.TAB_CLOSE_LOGOUT_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const session = await auth();
  const sid = (session?.user as any)?.sid;
  if (!sid) {
    return NextResponse.json({ ok: true }); // nada que borrar, idempotente
  }

  await db.delete(sessions).where(eq(sessions.sessionToken, sid));

  return NextResponse.json({ ok: true });
}
