'use server';

/**
 * Fase 3 (ajuste login) — Verificación de email obligatoria (EMAIL_VERIFICATION_ENABLED).
 * Fase 3.5 (ajuste login) — Recuperación de contraseña real (sin flag, fix de funcionalidad rota).
 *
 * Importante: estas acciones envían correo vía `sendCriticalAuthEmail` (notifications.ts),
 * NO vía `notifyUser()` — son transaccionales de cuenta y no deben depender de
 * `NOTIFICATIONS_LIVE` ni de preferencias de notificación del usuario.
 */

import * as bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { db, infraPromise } from "@/lib/db";
import { user, verificationToken, passwordResetToken } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendCriticalAuthEmail } from "@/lib/services/notifications";
import { checkAndRecordAuthRateLimit } from "@/lib/db/rateLimit";
import { getNumericSetting } from "@/lib/featureFlags";

const MAX_AUTH_EMAILS_PER_HOUR = 5;

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || '';
const VERIFICATION_COOLDOWN_MS = 60_000;
const RESET_COOLDOWN_MS = 60_000;

// El TTL del link debe coincidir con la ventana de espera del wizard de registro
// (15 min, ver VERIFY_WINDOW_SECONDS en app/auth/register/page.tsx) — si el link sigue
// vivo más tiempo que la espera del wizard, alguien podría confirmar una cuenta mucho
// después de que la pantalla ya dijo "venció".
function getVerificationTtlMinutes(): Promise<number> {
  return getNumericSetting('EMAIL_VERIFICATION_TTL_MINUTES', 15);
}

// ─── Verificación de email (Fase 3) ──────────────────────────────────────────

export async function requestEmailVerificationAction(email: string): Promise<{ success: boolean; error?: string }> {
  if (infraPromise) await infraPromise;
  try {
    const cleanEmail = email.toLowerCase().trim();
    const [existingUser] = await db
      .select({ id: user.id, fullName: user.fullName, emailVerified: user.emailVerified })
      .from(user)
      .where(sql`LOWER(${user.email}) = ${cleanEmail}`)
      .limit(1);

    // No revela si el email existe o ya está verificado — siempre responde éxito genérico.
    if (!existingUser || existingUser.emailVerified) {
      return { success: true };
    }

    // Anti-abuso: si ya hay un token vigente reciente para este email, no generar otro.
    const [recent] = await db
      .select({ expires: verificationToken.expires })
      .from(verificationToken)
      .where(eq(verificationToken.identifier, cleanEmail))
      .limit(1);
    const verificationTtlMinutes = await getVerificationTtlMinutes();
    const verificationTtlMs = verificationTtlMinutes * 60_000;
    if (recent && recent.expires.getTime() - Date.now() > (verificationTtlMs - VERIFICATION_COOLDOWN_MS)) {
      return { success: true };
    }

    const withinRateLimit = await checkAndRecordAuthRateLimit(cleanEmail, 'email_verification', MAX_AUTH_EMAILS_PER_HOUR);
    if (!withinRateLimit) {
      console.warn('[requestEmailVerificationAction] Rate limit excedido para', cleanEmail);
      return { success: true };
    }

    await db.delete(verificationToken).where(eq(verificationToken.identifier, cleanEmail));

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + verificationTtlMs);
    await db.insert(verificationToken).values({ identifier: cleanEmail, token, expires });

    const link = `${baseUrl()}/auth/verify?token=${token}`;
    await sendCriticalAuthEmail({
      toEmail: cleanEmail,
      subject: 'DentFlowAi: verifica tu correo electrónico',
      body: `Hola${existingUser.fullName ? ' ' + existingUser.fullName : ''},\n\nConfirma tu correo para activar tu cuenta en DentFlowAi:\n\n${link}\n\nEste enlace vence en ${verificationTtlMinutes} minutos. Si no creaste esta cuenta, ignora este correo.`,
    });

    return { success: true };
  } catch (error) {
    console.error('[requestEmailVerificationAction] Error:', error);
    return { success: false, error: 'No se pudo enviar el correo de verificación.' };
  }
}

/**
 * Tiempo restante real del token vigente para este email — usado por el wizard de registro
 * para que el countdown de cada pestaña refleje el TTL real (`expires` en BD), en vez de
 * resetear a los 15 min completos cada vez que se monta una pestaña nueva (p. ej. si el
 * usuario abre /auth/register otra vez mientras la pestaña original ya lleva varios minutos
 * esperando). No revela el token, solo el timestamp de expiración.
 */
export async function getVerificationExpiryAction(email: string): Promise<{ expiresAt: string | null }> {
  if (infraPromise) await infraPromise;
  try {
    const cleanEmail = email.toLowerCase().trim();
    const [row] = await db
      .select({ expires: verificationToken.expires })
      .from(verificationToken)
      .where(eq(verificationToken.identifier, cleanEmail))
      .limit(1);
    return { expiresAt: row ? row.expires.toISOString() : null };
  } catch (error) {
    console.error('[getVerificationExpiryAction] Error:', error);
    return { expiresAt: null };
  }
}

export async function confirmEmailVerificationAction(token: string): Promise<{ success: boolean; error?: string }> {
  if (infraPromise) await infraPromise;
  try {
    if (!token) return { success: false, error: 'Token inválido.' };

    const [row] = await db
      .select()
      .from(verificationToken)
      .where(eq(verificationToken.token, token))
      .limit(1);

    if (!row) return { success: false, error: 'El enlace de verificación es inválido o ya fue usado.' };
    if (row.expires.getTime() < Date.now()) {
      await db.delete(verificationToken).where(eq(verificationToken.token, token));
      return { success: false, error: 'El enlace de verificación venció. Solicita uno nuevo.' };
    }

    await db.update(user)
      .set({ emailVerified: new Date(), updatedAt: new Date() })
      .where(sql`LOWER(${user.email}) = ${row.identifier}`);

    await db.delete(verificationToken).where(eq(verificationToken.token, token));

    return { success: true };
  } catch (error) {
    console.error('[confirmEmailVerificationAction] Error:', error);
    return { success: false, error: 'No se pudo verificar el correo.' };
  }
}

// ─── Recuperación de contraseña (Fase 3.5) ───────────────────────────────────

export async function requestPasswordResetAction(email: string): Promise<{ success: boolean; error?: string }> {
  if (infraPromise) await infraPromise;
  try {
    const cleanEmail = email.toLowerCase().trim();
    const [existingUser] = await db
      .select({ id: user.id, fullName: user.fullName, hashedPassword: user.hashedPassword })
      .from(user)
      .where(sql`LOWER(${user.email}) = ${cleanEmail}`)
      .limit(1);

    // Anti-enumeración: siempre el mismo mensaje genérico, exista o no la cuenta.
    if (!existingUser) {
      return { success: true };
    }

    if (!existingUser.hashedPassword) {
      // Cuenta solo-Google (u otra sin password): no se ofrece reset, se informa por correo
      // para no crear una contraseña paralela sin que el usuario lo pida explícitamente.
      const withinRateLimitGoogle = await checkAndRecordAuthRateLimit(cleanEmail, 'password_reset', MAX_AUTH_EMAILS_PER_HOUR);
      if (!withinRateLimitGoogle) {
        console.warn('[requestPasswordResetAction] Rate limit excedido para', cleanEmail);
        return { success: true };
      }
      await sendCriticalAuthEmail({
        toEmail: cleanEmail,
        subject: 'DentFlowAi: tu cuenta usa Google para iniciar sesión',
        body: `Hola${existingUser.fullName ? ' ' + existingUser.fullName : ''},\n\nRecibimos una solicitud para restablecer la contraseña de esta cuenta, pero está vinculada a Google y no tiene contraseña propia. Inicia sesión con el botón "Continuar con Google" en /auth/login.\n\nSi no fuiste tú, puedes ignorar este correo.`,
      });
      return { success: true };
    }

    // Anti-abuso: no reenviar si ya hay un token vigente reciente sin usar.
    const [recent] = await db
      .select({ expires: passwordResetToken.expires })
      .from(passwordResetToken)
      .where(and(eq(passwordResetToken.email, cleanEmail), sql`${passwordResetToken.usedAt} IS NULL`))
      .limit(1);
    const RESET_TTL_MS = 2 * 3600_000; // 2 horas
    if (recent && recent.expires.getTime() - Date.now() > (RESET_TTL_MS - RESET_COOLDOWN_MS)) {
      return { success: true };
    }

    const withinRateLimit = await checkAndRecordAuthRateLimit(cleanEmail, 'password_reset', MAX_AUTH_EMAILS_PER_HOUR);
    if (!withinRateLimit) {
      console.warn('[requestPasswordResetAction] Rate limit excedido para', cleanEmail);
      return { success: true };
    }

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + RESET_TTL_MS);
    await db.insert(passwordResetToken).values({ token, email: cleanEmail, expires });

    const link = `${baseUrl()}/auth/reset-password?token=${token}`;
    await sendCriticalAuthEmail({
      toEmail: cleanEmail,
      subject: 'DentFlowAi: recupera el acceso a tu cuenta',
      body: `Hola${existingUser.fullName ? ' ' + existingUser.fullName : ''},\n\nSolicitaste restablecer tu contraseña en DentFlowAi:\n\n${link}\n\nEste enlace vence en 2 horas y solo puede usarse una vez. Si no fuiste tú, ignora este correo — tu contraseña actual sigue funcionando.`,
    });

    return { success: true };
  } catch (error) {
    console.error('[requestPasswordResetAction] Error:', error);
    return { success: false, error: 'No se pudo procesar la solicitud.' };
  }
}

export async function resetPasswordAction(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (infraPromise) await infraPromise;
  try {
    if (!token) return { success: false, error: 'Token inválido.' };
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    const [row] = await db
      .select()
      .from(passwordResetToken)
      .where(eq(passwordResetToken.token, token))
      .limit(1);

    if (!row) return { success: false, error: 'El enlace es inválido.' };
    if (row.usedAt) return { success: false, error: 'Este enlace ya fue usado. Solicita uno nuevo.' };
    if (row.expires.getTime() < Date.now()) return { success: false, error: 'El enlace venció. Solicita uno nuevo.' };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db.update(user)
      .set({ hashedPassword, updatedAt: new Date() })
      .where(sql`LOWER(${user.email}) = ${row.email}`);

    await db.update(passwordResetToken)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetToken.token, token));

    return { success: true };
  } catch (error) {
    console.error('[resetPasswordAction] Error:', error);
    return { success: false, error: 'No se pudo restablecer la contraseña.' };
  }
}

// ─── Agregar contraseña a una cuenta 100% Google (perfil) ───────────────────

/**
 * Permite que un usuario que entró solo por Google agregue una contraseña propia, para poder
 * loguear también con email/clave a partir de ahí. Usa la sesión REAL (`auth()`), nunca
 * `getServerIdentity()`, para que la impersonación admin nunca pueda fijar una clave sobre la
 * cuenta simulada (mismo patrón que `discardOnboardingAccountAction` en user.ts).
 */
export async function setOwnPasswordAction(newPassword: string): Promise<{ success: boolean; error?: string }> {
  if (infraPromise) await infraPromise;
  try {
    const session = await auth();
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return { success: false, error: 'No autenticado.' };

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db.update(user)
      .set({ hashedPassword, updatedAt: new Date() })
      .where(eq(user.id, userId));

    return { success: true };
  } catch (error) {
    console.error('[setOwnPasswordAction] Error:', error);
    return { success: false, error: 'No se pudo guardar la contraseña.' };
  }
}
