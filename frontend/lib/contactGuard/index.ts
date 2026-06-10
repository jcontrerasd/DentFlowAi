import { normalizeForGuard } from './normalize';
import { getGuardBucket, type LoadedRule } from '@/lib/contactGuard/cache';
import { detectPhones, ALL_SUPPORTED_COUNTRY_CODES } from './phonePatterns';

export type GuardViolation = {
  ruleId: string;
  ruleType: 'regex' | 'keyword';
  ruleName: string;
  matchedText: string;
};

export type GuardContext = {
  field: string;
  /** Si es true (campo trackingId), URLs cuyo dominio esté en la allowlist no cuentan como violación. */
  allowCourierUrls?: boolean;
  /**
   * Códigos de país de los involucrados (dentista + técnico + actor), para la detección
   * de teléfonos country-aware. Si no se provee, se usan todos los países soportados.
   */
  countries?: string[];
};

/**
 * Campos exentos de la detección numérica/telefónica: su contenido legítimo es un código
 * largo (p. ej. el número de seguimiento del courier). El resto de reglas (email, URL
 * externa, handle, keywords) sigue aplicando.
 */
const NUMERIC_EXEMPT_FIELDS = new Set<string>(['dispatchTracking']);

export type GuardResult =
  | { ok: true; normalized: string }
  | { ok: false; violations: GuardViolation[]; normalized: string };

function ruleAppliesTo(rule: LoadedRule, field: string): boolean {
  if (!rule.appliesToFields || rule.appliesToFields.length === 0) return true;
  return rule.appliesToFields.includes(field);
}

function isUrlRule(name: string): boolean {
  return name === 'url_http' || name === 'url_shortener' || name === 'dominio_explicito';
}

function extractDomain(match: string): string | null {
  const m = match.match(/(?:https?:\/\/)?([a-z0-9.\-]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase() : null;
}

function isAllowedCourierDomain(domain: string, allowed: string[]): boolean {
  return allowed.some((d) => domain === d || domain.endsWith('.' + d));
}

// Regex canónicas para detectar spans de URL/dominio en el texto normalizado. Son
// independientes de las reglas DB (que pueden editarse) y sirven para proteger el
// interior de una URL/dominio de las reglas numéricas/handle (P1) y para deduplicar
// `dominio_explicito` contenido en una `url_http` (P4).
const URL_HTTP_RE = /https?:\/\/[^\s<>"']+/gi;
const URL_SHORTENER_RE = /(?:bit\.ly|t\.co|goo\.gl|tinyurl\.com|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rebrand\.ly|short\.io)\/[a-z0-9]+/gi;
// Dominio sin esquema + path opcional (para proteger números que viven en la ruta,
// p. ej. `correos.cl/track/123456789`).
const DOMAIN_RE = /(?<![a-z0-9])[a-z0-9\-]{2,}\.(?:com|cl|net|org|io|app|me|co|info|biz|gob\.cl|edu\.cl)(?![a-z])(?:\/[^\s<>"']*)?/gi;

function findSpans(normalized: string, re: RegExp): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const m of normalized.matchAll(re)) {
    const start = m.index ?? 0;
    spans.push([start, start + m[0].length]);
  }
  return spans;
}

/** Spans de URLs http(s) únicamente (para dedupe P4: dominio dentro de una URL). */
function findUrlHttpSpans(normalized: string): Array<[number, number]> {
  return findSpans(normalized, URL_HTTP_RE);
}

/**
 * Spans `[start, end)` de URLs/dominios (http, acortadores y dominios sin esquema con
 * su path). Las reglas no-URL (teléfono, handle) ignoran lo que vive dentro de estos
 * spans, para TODOS los campos (no solo el de courier).
 */
function findProtectedSpans(normalized: string): Array<[number, number]> {
  return [
    ...findSpans(normalized, URL_HTTP_RE),
    ...findSpans(normalized, URL_SHORTENER_RE),
    ...findSpans(normalized, DOMAIN_RE),
  ];
}

function isInsideUrlSpan(start: number, end: number, spans: Array<[number, number]>): boolean {
  for (const [s, e] of spans) {
    if (start >= s && end <= e) return true;
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function checkContactExposure(
  rawText: string,
  context: GuardContext,
): Promise<GuardResult> {
  const text = rawText ?? '';
  if (!text.trim()) return { ok: true, normalized: '' };

  const normalized = normalizeForGuard(text);
  const bucket = await getGuardBucket();
  if (process.env.NODE_ENV !== 'production') {
    const counts = { regex: 0, keyword: 0, invalid: 0 };
    for (const r of bucket.rules) {
      if (r.invalid) counts.invalid++;
      else if (r.type === 'regex') counts.regex++;
      else counts.keyword++;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[ContactGuard] check field=${context.field} text=${JSON.stringify(text)} normalized=${JSON.stringify(normalized)} rulesActive={regex:${counts.regex}, keyword:${counts.keyword}, invalid:${counts.invalid}} couriers=${bucket.courierDomains.length}`,
    );
  }
  const violations: GuardViolation[] = [];
  // Spans de URL/dominio: protegen su interior de las reglas numéricas/handle (P1) y
  // permiten deduplicar `dominio_explicito` dentro de una `url_http` (P4). Se calculan
  // SIEMPRE (no solo con allowCourierUrls) para que apliquen a todos los campos.
  const protectedSpans = findProtectedSpans(normalized);
  const urlHttpSpans = findUrlHttpSpans(normalized);

  for (const rule of bucket.rules) {
    if (rule.invalid) continue;
    // Teléfonos: ahora se detectan por país en código (ver detectPhones más abajo).
    // Las reglas DB `telefono_*` quedan inertes (legacy) para no duplicar detección.
    if (rule.name.startsWith('telefono_')) continue;
    if (!ruleAppliesTo(rule, context.field)) continue;

    if (rule.type === 'regex' && rule.compiled) {
      rule.compiled.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.compiled.exec(normalized)) !== null) {
        const matched = match[0];
        const start = match.index;
        const end = match.index + matched.length;
        const advance = () => { if (match!.index === rule.compiled!.lastIndex) rule.compiled!.lastIndex++; };

        if (isUrlRule(rule.name)) {
          // URLs de courier en la allowlist (solo en el campo trackingId) no son violación.
          if (context.allowCourierUrls) {
            const domain = extractDomain(matched);
            if (domain && isAllowedCourierDomain(domain, bucket.courierDomains)) {
              advance();
              continue;
            }
          }
          // P4: un dominio contenido en una URL http ya está cubierto por `url_http`.
          if (rule.name === 'dominio_explicito' && isInsideUrlSpan(start, end, urlHttpSpans)) {
            advance();
            continue;
          }
        } else if (isInsideUrlSpan(start, end, protectedSpans)) {
          // P1: reglas no-URL (handle, etc.) ignoran lo que vive dentro de una URL/dominio.
          advance();
          continue;
        }

        violations.push({
          ruleId: rule.id,
          ruleType: 'regex',
          ruleName: rule.name,
          matchedText: matched,
        });
        advance();
      }
    } else if (rule.type === 'keyword') {
      const kw = rule.pattern.toLowerCase();
      if (!kw) continue;
      const re = new RegExp(`(^|[^a-z0-9])(${escapeRegex(kw)})(?![a-z0-9])`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = re.exec(normalized)) !== null) {
        const matchStart = match.index + match[1].length;
        const matchEnd = matchStart + match[2].length;
        if (isInsideUrlSpan(matchStart, matchEnd, protectedSpans)) continue;
        violations.push({
          ruleId: rule.id,
          ruleType: 'keyword',
          ruleName: rule.name,
          matchedText: match[2],
        });
      }
    }
  }

  // Detección de teléfonos por país (country-aware). Exenta en campos cuyo contenido
  // legítimo es un código numérico largo (P3, p. ej. número de seguimiento del courier).
  if (!NUMERIC_EXEMPT_FIELDS.has(context.field)) {
    const countries =
      context.countries && context.countries.length > 0
        ? context.countries
        : ALL_SUPPORTED_COUNTRY_CODES;
    for (const phone of detectPhones(normalized, countries)) {
      // Los números que viven dentro de una URL/dominio no son teléfonos (P1).
      if (isInsideUrlSpan(phone.index, phone.end, protectedSpans)) continue;
      violations.push({
        ruleId: 'telefono',
        ruleType: 'regex',
        ruleName: 'telefono',
        matchedText: phone.match,
      });
    }
  }

  if (violations.length === 0) return { ok: true, normalized };
  return { ok: false, violations, normalized };
}

export { invalidateContactGuardCache } from '@/lib/contactGuard/cache';
