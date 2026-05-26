/**
 * Helpers de ContactGuard seguros para Client Components.
 * NO importa nada del servidor (db, schema). Solo strings y funciones puras.
 */

export const CONTACT_GUARD_USER_PREFIX = 'Detectamos contenido no permitido';

const LEGACY_PREFIX = 'Fauchard detectó un intento de comunicación indebido';

/** Detecta si un Error proviene del guard sin depender del texto exacto. */
export function isContactGuardError(message: string | undefined | null): boolean {
  if (!message) return false;
  return message.startsWith(CONTACT_GUARD_USER_PREFIX) || message.startsWith(LEGACY_PREFIX);
}
