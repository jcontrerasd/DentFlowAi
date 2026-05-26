import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { ensureInfrastructure, INFRA_VERSION } from './infrastructure';

const connectionString = process.env.DATABASE_URL!;

// Prevenir múltiples conexiones en desarrollo (Singleton para Next.js HMR)
const globalForDb = global as unknown as {
  client: postgres.Sql | undefined,
  infraPromise: Promise<void> | undefined,
  infraPromiseVersion: string | undefined,
};

export const client = globalForDb.client ?? postgres(connectionString, {
    prepare: false,
    max: 10 // Limitamos el pool en local para evitar saturación
});

if (process.env.NODE_ENV !== 'production') globalForDb.client = client;

export const db = drizzle(client, { schema });

// Disparar la verificación de infraestructura de forma asíncrona una sola vez por versión
if (!globalForDb.infraPromise || globalForDb.infraPromiseVersion !== INFRA_VERSION) {
  globalForDb.infraPromiseVersion = INFRA_VERSION;
  globalForDb.infraPromise = ensureInfrastructure(db);
}

export const infraPromise = globalForDb.infraPromise;
