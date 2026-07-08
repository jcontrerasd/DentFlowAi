import { NextRequest, NextResponse } from 'next/server';

/**
 * Guard de autenticación para las rutas de cron.
 *
 * Fail-closed: si `CRON_SECRET` no está configurado en producción, se rechaza
 * la petición (500) en vez de dejar el endpoint abierto. En desarrollo, sin
 * secreto configurado, se permite para poder probar los crons localmente.
 *
 * Devuelve una `NextResponse` de error si la petición no pasa, o `null` si es
 * legítima (el handler debe continuar).
 */
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[cronAuth] CRON_SECRET no configurado en producción — rechazando.');
      return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 });
    }
    // Desarrollo/local sin secreto: permitir para pruebas manuales.
    return null;
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
