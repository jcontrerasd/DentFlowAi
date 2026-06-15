import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { ensureInfrastructure, ensureIncrementalInfrastructure, INFRA_VERSION } from './infrastructure';

const connectionString = process.env.DATABASE_URL!;

// Prevenir múltiples conexiones en desarrollo (Singleton para Next.js HMR)
const globalForDb = global as unknown as {
  client: postgres.Sql | undefined,
  infraPromise: Promise<void> | undefined,
  infraPromiseVersion: string | undefined,
  incrementalPromise: Promise<void> | undefined,
};

export const client = globalForDb.client ?? postgres(connectionString, {
    prepare: false,
    max: 10 // Limitamos el pool en local para evitar saturación
});

if (process.env.NODE_ENV !== 'production') globalForDb.client = client;

export const db = drizzle(client, { schema });

// Disparar la verificación de infraestructura de forma asíncrona una sola vez por versión.
// NO ejecutar durante `next build` (NEXT_PHASE=phase-production-build) ni si falta
// DATABASE_URL: en esa fase no hay BD y postgres-js caería al host por defecto
// (127.0.0.1:5432), lanzando ECONNREFUSED en el log del build. En runtime sí corre.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
if (process.env.DATABASE_URL && !isBuildPhase) {
  // Siempre: tablas idempotentes (auditoría precios, audit_log) aunque el gate de versión ya corrió.
  globalForDb.incrementalPromise = ensureIncrementalInfrastructure(db);
}
if (process.env.DATABASE_URL && !isBuildPhase
    && (!globalForDb.infraPromise || globalForDb.infraPromiseVersion !== INFRA_VERSION)) {
  globalForDb.infraPromiseVersion = INFRA_VERSION;
  globalForDb.infraPromise = ensureInfrastructure(db);
}

export const infraPromise = globalForDb.infraPromise
  ? Promise.all([globalForDb.incrementalPromise, globalForDb.infraPromise]).then(() => undefined)
  : globalForDb.incrementalPromise;
