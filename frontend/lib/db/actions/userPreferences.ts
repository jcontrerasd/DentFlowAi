'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { getServerIdentity } from '@/lib/db/actions/impersonation';
import type { EmailNotificationPrefs } from '@/lib/services/notifications';

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

export async function getEmailNotificationPrefsAction(): Promise<{ success: boolean; data?: EmailNotificationPrefs; error?: string }> {
  try {
    const me = await getServerIdentity();
    if (!me?.id) return { success: false, error: 'No autorizado' };
    const [row] = await db.select({ prefs: user.emailNotificationPrefs })
      .from(user).where(eq(user.id, me.id as string)).limit(1);
    return { success: true, data: (row?.prefs ?? {}) as EmailNotificationPrefs };
  } catch (e) {
    console.error('[getEmailNotificationPrefsAction]', e);
    return { success: false, error: 'No se pudo leer las preferencias.' };
  }
}

export async function updateEmailNotificationPrefsAction(
  prefs: EmailNotificationPrefs
): Promise<{ success: boolean; error?: string }> {
  try {
    const me = await getServerIdentity();
    if (!me?.id) return { success: false, error: 'No autorizado' };
    await db.update(user)
      .set({ emailNotificationPrefs: prefs })
      .where(eq(user.id, me.id as string));
    return { success: true };
  } catch (e) {
    console.error('[updateEmailNotificationPrefsAction]', e);
    return { success: false, error: 'No se pudo guardar las preferencias.' };
  }
}
