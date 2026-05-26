import { db } from '@/lib/db';
import { contactGuardRule, contactGuardCourierAllowlist } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type LoadedRule = {
  id: string;
  type: 'regex' | 'keyword';
  name: string;
  pattern: string;
  flags: string;
  appliesToFields: string[] | null;
  /** Solo para regex; cacheado para no recompilar en cada submit. */
  compiled?: RegExp;
  /** Si el regex no compila, lo marcamos para skip. */
  invalid?: boolean;
};

type CacheBucket = { rules: LoadedRule[]; courierDomains: string[]; loadedAt: number };

// TTL más corto en desarrollo para que cambios de reglas tomen efecto rápido.
const TTL_MS = process.env.NODE_ENV === 'production' ? 60_000 : 10_000;

// Singleton sobre globalThis para sobrevivir a HMR y a múltiples instancias del
// módulo dentro del mismo proceso (Next dev / Turbopack / RSC vs server actions).
const globalForGuard = globalThis as unknown as {
  __contactGuardBucket?: CacheBucket | null;
  __contactGuardInFlight?: Promise<CacheBucket> | null;
};

async function fetchBucket(): Promise<CacheBucket> {
  const [rules, couriers] = await Promise.all([
    db
      .select({
        id: contactGuardRule.id,
        type: contactGuardRule.type,
        name: contactGuardRule.name,
        pattern: contactGuardRule.pattern,
        flags: contactGuardRule.flags,
        appliesToFields: contactGuardRule.appliesToFields,
      })
      .from(contactGuardRule)
      .where(eq(contactGuardRule.isActive, true)),
    db
      .select({ domain: contactGuardCourierAllowlist.domain })
      .from(contactGuardCourierAllowlist)
      .where(eq(contactGuardCourierAllowlist.isActive, true)),
  ]);

  const loaded: LoadedRule[] = rules.map((r) => {
    const base: LoadedRule = {
      id: r.id,
      type: (r.type === 'regex' ? 'regex' : 'keyword'),
      name: r.name,
      pattern: r.pattern,
      flags: r.flags ?? 'i',
      appliesToFields: (r.appliesToFields as string[] | null) ?? null,
    };
    if (base.type === 'regex') {
      try {
        const flags = base.flags.includes('g') ? base.flags : base.flags + 'g';
        base.compiled = new RegExp(base.pattern, flags);
      } catch {
        base.invalid = true;
      }
    }
    return base;
  });

  return { rules: loaded, courierDomains: couriers.map((c) => c.domain.toLowerCase()), loadedAt: Date.now() };
}

export async function getGuardBucket(): Promise<CacheBucket> {
  const now = Date.now();
  const cached = globalForGuard.__contactGuardBucket;
  if (cached && now - cached.loadedAt < TTL_MS) return cached;
  if (globalForGuard.__contactGuardInFlight) return globalForGuard.__contactGuardInFlight;
  const pending = fetchBucket()
    .then((b) => {
      globalForGuard.__contactGuardBucket = b;
      return b;
    })
    .finally(() => {
      globalForGuard.__contactGuardInFlight = null;
    });
  globalForGuard.__contactGuardInFlight = pending;
  return pending;
}

export function invalidateContactGuardCache(): void {
  globalForGuard.__contactGuardBucket = null;
  globalForGuard.__contactGuardInFlight = null;
}
