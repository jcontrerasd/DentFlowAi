/**
 * Next.js instrumentation — se ejecuta una vez al arrancar el servidor.
 *
 * Único propósito: en **local** levantar el scheduler de crons in-process
 * (`lib/localCron.ts`) para que el motor de ligas (y futuros crons) opere igual que
 * en dev/prod, donde los dispara Cloud Scheduler. Nunca arranca con
 * `NODE_ENV=production` (Cloud Run usa Cloud Scheduler) ni en el runtime edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.LOCAL_CRONS_ENABLED === 'false') return;

  const { startLocalCronScheduler } = await import('@/lib/localCron');
  startLocalCronScheduler();
}
