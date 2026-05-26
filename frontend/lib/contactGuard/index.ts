import { normalizeForGuard } from './normalize';
import { getGuardBucket, type LoadedRule } from '@/lib/contactGuard/cache';

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
};

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

  for (const rule of bucket.rules) {
    if (rule.invalid) continue;
    if (!ruleAppliesTo(rule, context.field)) continue;

    if (rule.type === 'regex' && rule.compiled) {
      rule.compiled.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.compiled.exec(normalized)) !== null) {
        const matched = match[0];
        if (context.allowCourierUrls && isUrlRule(rule.name)) {
          const domain = extractDomain(matched);
          if (domain && isAllowedCourierDomain(domain, bucket.courierDomains)) {
            if (match.index === rule.compiled.lastIndex) rule.compiled.lastIndex++;
            continue;
          }
        }
        violations.push({
          ruleId: rule.id,
          ruleType: 'regex',
          ruleName: rule.name,
          matchedText: matched,
        });
        if (match.index === rule.compiled.lastIndex) rule.compiled.lastIndex++;
      }
    } else if (rule.type === 'keyword') {
      const kw = rule.pattern.toLowerCase();
      if (!kw) continue;
      const re = new RegExp(`(^|[^a-z0-9])(${escapeRegex(kw)})(?![a-z0-9])`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = re.exec(normalized)) !== null) {
        violations.push({
          ruleId: rule.id,
          ruleType: 'keyword',
          ruleName: rule.name,
          matchedText: match[2],
        });
      }
    }
  }

  if (violations.length === 0) return { ok: true, normalized };
  return { ok: false, violations, normalized };
}

export { invalidateContactGuardCache } from '@/lib/contactGuard/cache';
