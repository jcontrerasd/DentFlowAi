/**
 * Feature flags administrables (v5.28) — lectura server-only con caché.
 *
 * Fuente de verdad: tabla `feature_flag` (editable en /dashboard/admin/feature-flags).
 * Fallback: `process.env` — cubre el arranque antes de la migración, DB caída y
 * los tests de CI sin base de datos. Si la key no existe en la tabla, también
 * se cae a env (permite introducir flags nuevos por env antes de seedearlos).
 *
 * Propagación: el caché dura CACHE_TTL_MS por instancia. En la instancia que
 * edita un flag el efecto es inmediato (`invalidateFlagCache()` desde la server
 * action de escritura); en las demás instancias de Cloud Run el cambio se ve al
 * expirar el caché (≤30 s). No hay invalidación cross-instancia por diseño.
 */

import { db } from '@/lib/db';
import { featureFlag } from '@/lib/db/schema';

const CACHE_TTL_MS = 30_000;

// Singleton en global para sobrevivir HMR en dev (mismo patrón que infrastructure.ts).
const globalForFlags = global as unknown as {
  __featureFlagCache: { values: Map<string, string>; expiresAt: number } | null | undefined;
};

async function readAll(): Promise<Map<string, string> | null> {
  const cached = globalForFlags.__featureFlagCache;
  if (cached && Date.now() < cached.expiresAt) return cached.values;
  try {
    const rows = await db.select({ key: featureFlag.key, value: featureFlag.value }).from(featureFlag);
    const values = new Map(rows.map((r) => [r.key, r.value]));
    globalForFlags.__featureFlagCache = { values, expiresAt: Date.now() + CACHE_TTL_MS };
    return values;
  } catch {
    // DB caída o tabla aún no migrada → el caller cae al fallback env.
    return null;
  }
}

/** Lee un flag booleano: tabla (con caché) → fallback `process.env[key] === 'true'`. */
export async function getFlag(key: string): Promise<boolean> {
  const values = await readAll();
  const raw = values?.get(key);
  if (raw !== undefined) return raw === 'true';
  return process.env[key] === 'true';
}

/** Lee un parámetro numérico: tabla → env → default. Solo acepta números finitos > 0. */
export async function getNumericSetting(key: string, defaultValue: number): Promise<number> {
  const values = await readAll();
  const fromDb = Number(values?.get(key));
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb;
  const fromEnv = Number(process.env[key]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return defaultValue;
}

/** Invalida el caché local. La llama la server action de escritura tras cada cambio. */
export function invalidateFlagCache(): void {
  globalForFlags.__featureFlagCache = null;
}
