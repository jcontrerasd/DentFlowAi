'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { getServerIdentity } from '@/lib/db/actions/impersonation';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_COOKIE = 'dfa-theme';
const ONE_YEAR = 60 * 60 * 24 * 365;

function isValidMode(v: unknown): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

export async function updateThemePreferenceAction(value: ThemeMode) {
  if (!isValidMode(value)) {
    return { success: false, error: 'Modo de tema inválido.' };
  }
  try {
    const me = await getServerIdentity();
    if (!me?.id) return { success: false, error: 'No autenticado.' };

    await db.update(user)
      .set({ themePreference: value })
      .where(eq(user.id, me.id));

    const jar = await cookies();
    jar.set(THEME_COOKIE, value, {
      path: '/',
      maxAge: ONE_YEAR,
      sameSite: 'lax',
    });

    return { success: true };
  } catch (e) {
    console.error('[updateThemePreferenceAction]', e);
    return { success: false, error: 'No se pudo guardar la preferencia.' };
  }
}

export async function getThemePreferenceAction(): Promise<ThemeMode> {
  try {
    const me = await getServerIdentity();
    if (!me?.id) return 'system';
    const rows = await db.select({ p: user.themePreference })
      .from(user).where(eq(user.id, me.id)).limit(1);
    const v = rows[0]?.p;
    return isValidMode(v) ? v : 'system';
  } catch {
    return 'system';
  }
}
