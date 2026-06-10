/**
 * ContactGuard — detección de teléfonos por país (country-aware).
 *
 * Reemplaza la regla DB genérica `telefono_8plus_digitos` (que trataba cualquier
 * corrida de 8+ dígitos como teléfono y producía falsos positivos: tracking, fechas,
 * precios). Aquí los teléfonos se detectan con los formatos móviles reales de los
 * países **involucrados** en el caso (dentista + técnico + actor); ver
 * `resolveInvolvedCountryCodes` en `guardOrFail.ts`.
 *
 * El texto que recibe `detectPhones` ya viene normalizado por `normalizeForGuard`
 * (minúsculas + `collapseDigitSeparators`, que junta `+56 9 1234 5678` → `+56912345678`).
 *
 * Notas de diseño:
 * - Cada patrón local va anclado con bordes no-dígito `(?<!\d)…(?!\d)`. Esto evita que
 *   un patrón calce un substring DENTRO de una corrida de dígitos más larga (p. ej. un
 *   número de seguimiento de 12 dígitos no calza un patrón de 9/10 dígitos).
 * - El código de país es opcional en el patrón local (`(?:56)?…`) para capturar tanto
 *   `912345678` como `56912345678`. El prefijo `+` lo cubre `INTERNATIONAL_PHONE_PATTERN`.
 */

import { SUPPORTED_COUNTRIES } from '@/lib/constants/addressData';

export const ALL_SUPPORTED_COUNTRY_CODES: string[] = SUPPORTED_COUNTRIES.map((c) => c.code);

/**
 * Patrones de móvil local por país (sobre texto normalizado, separadores ya colapsados).
 * El código de país internacional va opcional al inicio de cada patrón.
 */
export const PHONE_PATTERNS_BY_COUNTRY: Record<string, RegExp[]> = {
  // Chile: móvil 9 + 8 dígitos (cc 56)
  CL: [/(?<!\d)(?:56)?9\d{8}(?!\d)/g],
  // Perú: móvil 9 + 8 dígitos (cc 51)
  PE: [/(?<!\d)(?:51)?9\d{8}(?!\d)/g],
  // Ecuador: móvil 09 + 8 dígitos (cc 593)
  EC: [/(?<!\d)(?:593)?0?9\d{8}(?!\d)/g],
  // Colombia: móvil 3XX + 7 dígitos = 10 dígitos (cc 57)
  CO: [/(?<!\d)(?:57)?3\d{9}(?!\d)/g],
  // Brasil: móvil DDD(2) + 9 + 8 dígitos = 11 dígitos (cc 55)
  BR: [/(?<!\d)(?:55)?\d{2}9\d{8}(?!\d)/g],
  // Bolivia: móvil 6/7 + 7 dígitos = 8 dígitos (cc 591)
  BO: [/(?<!\d)(?:591)?[67]\d{7}(?!\d)/g],
  // Uruguay: móvil 9 + 7 dígitos = 8 dígitos (cc 598)
  UY: [/(?<!\d)(?:598)?9\d{7}(?!\d)/g],
  // Argentina: móvil 10 dígitos (cc 54)
  AR: [/(?<!\d)(?:54)?\d{10}(?!\d)/g],
  // México: móvil 10 dígitos (cc 52)
  MX: [/(?<!\d)(?:52)?\d{10}(?!\d)/g],
};

/** Cualquier número con prefijo internacional `+CC` (cubre países no soportados). */
export const INTERNATIONAL_PHONE_PATTERN = /\+\d{8,14}(?!\d)/g;

export type PhoneMatch = { match: string; index: number; end: number };

/**
 * Detecta teléfonos en `normalized` considerando el patrón internacional (siempre) y
 * los patrones locales de los `countries` dados. Los spans solapados se fusionan para
 * no reportar el mismo número dos veces (p. ej. `+56912345678` calza intl y CL).
 */
export function detectPhones(normalized: string, countries: string[]): PhoneMatch[] {
  if (!normalized) return [];

  const regexes: RegExp[] = [INTERNATIONAL_PHONE_PATTERN];
  const seenSources = new Set<string>([INTERNATIONAL_PHONE_PATTERN.source]);
  for (const code of countries) {
    for (const re of PHONE_PATTERNS_BY_COUNTRY[code] ?? []) {
      if (seenSources.has(re.source)) continue;
      seenSources.add(re.source);
      regexes.push(re);
    }
  }

  const spans: Array<[number, number]> = [];
  for (const re of regexes) {
    // matchAll requiere flag global y no muta lastIndex del regex original.
    for (const m of normalized.matchAll(re)) {
      const start = m.index ?? 0;
      spans.push([start, start + m[0].length]);
    }
  }

  if (spans.length === 0) return [];

  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  return merged.map(([s, e]) => ({ match: normalized.slice(s, e), index: s, end: e }));
}
