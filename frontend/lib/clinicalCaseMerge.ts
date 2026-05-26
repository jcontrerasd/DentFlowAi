/**
 * Fusiona actualización de caso evitando perder `comparativeOffers` en refetches parciales
 * durante `propuestaLista`.
 */
export function mergeClinicalCaseUpdate(prev: any, next: any): any {
  if (next == null || typeof next !== 'object') return next ?? prev;
  if (prev == null) return next;
  const merged = { ...prev, ...next };
  const status = (next.status ?? prev.status) as string;
  if (status === 'propuestaLista' || prev.status === 'propuestaLista') {
    const nextCo = next.comparativeOffers;
    const prevCo = prev.comparativeOffers;
    const nextEmpty = !Array.isArray(nextCo) || nextCo.length === 0;
    const prevHas = Array.isArray(prevCo) && prevCo.length > 0;
    if (nextEmpty && prevHas) merged.comparativeOffers = prevCo;
  }
  return merged;
}
