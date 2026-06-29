import { db } from "@/lib/db";
import { authActionRateLimit } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

const HOUR_MS = 3600_000;

/**
 * Tope duro de envíos reales de correo por email+acción en la última hora. A diferencia del
 * cooldown corto (60s) ya existente en requestEmailVerificationAction/requestPasswordResetAction,
 * esto evita que alguien use el formulario para bombardear una bandeja ajena con decenas de
 * correos reales a lo largo de una hora. Inserta una fila solo cuando se decide enviar (el
 * caller no debe llamar esto en los no-ops por anti-enumeración o cooldown).
 */
export async function checkAndRecordAuthRateLimit(
  email: string,
  actionType: string,
  maxPerHour: number,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - HOUR_MS);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(authActionRateLimit)
    .where(
      and(
        eq(authActionRateLimit.email, email),
        eq(authActionRateLimit.actionType, actionType),
        gte(authActionRateLimit.createdAt, windowStart),
      ),
    );

  if (count >= maxPerHour) {
    return false;
  }

  await db.insert(authActionRateLimit).values({ email, actionType });
  return true;
}
