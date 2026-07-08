/**
 * Deduplicación de promesas in-flight.
 *
 * Si ya existe una promesa en curso para la misma key, la retorna en vez de
 * ejecutar la factory de nuevo. La entrada se borra al asentarse la promesa
 * (éxito o error): nunca se cachean resultados ni rechazos, solo se colapsan
 * llamadas genuinamente concurrentes.
 */
export type InflightDedup<T> = (key: string, factory: () => Promise<T>) => Promise<T>;

export function createInflightDedup<T>(): InflightDedup<T> {
  const inflight = new Map<string, Promise<T>>();

  return (key: string, factory: () => Promise<T>): Promise<T> => {
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = factory().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };
}
