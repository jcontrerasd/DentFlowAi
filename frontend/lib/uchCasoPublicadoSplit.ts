/**
 * Divide el evento legacy `CASO_PUBLICADO` ("He publicado el caso. Estamos buscando el laboratorio
 * ideal para tu caso.") en dos burbujas para el dentista:
 *   1. Voz del dentista (carril propio): "He publicado el caso."
 *   2. Voz de Fauchard (hilo): "Estamos buscando el laboratorio ideal para tu caso."
 *
 * Se aplica solo del lado del cliente, en el render del UCH. No reescribe la BD, así que
 * cubre tanto eventos históricos (contenido unido) como eventos nuevos por igual.
 */

import { CASE_EVENTS } from '@/lib/constants/caseEvents';

/**
 * Marca interna en `payload` que identifica la mitad "dentista" del split de CASO_PUBLICADO.
 * Se lee desde `resolveUchThreadLane` para forzar carril propio sin depender del `user`
 * enmascarado por el servidor.
 */
export const UCH_SELF_HALF_PAYLOAD_KEY = '__uchPresentationSelfHalf' as const;

type CasoPublicadoSplittable = {
  id: string;
  userId?: string;
  type: 'negociacion' | 'tecnico' | 'sistema';
  action: string;
  content: string;
  payload: unknown;
  stateChange: unknown;
  createdAt: string | Date;
  user?: {
    id: string;
    fullName: string;
    role: string;
    image?: string;
  };
};

const DENTIST_PHRASE = 'He publicado el caso.';
const FAUCHARD_PHRASE = 'Estamos buscando el laboratorio ideal para tu caso.';

/**
 * Devuelve la lista expandida. Si el evento `CASO_PUBLICADO` ya viene partido (solo una frase),
 * no se vuelve a partir; el resto de eventos pasa intacto.
 */
export function splitCasoPublicadoForDentista<T extends CasoPublicadoSplittable>(events: readonly T[]): T[] {
  const out: T[] = [];
  for (const e of events) {
    if (e.action !== CASE_EVENTS.CASO_PUBLICADO) {
      out.push(e);
      continue;
    }

    const payload = (e.payload ?? {}) as Record<string, unknown>;
    const visibleTo = typeof payload.visibleTo === 'string' ? payload.visibleTo : undefined;
    if (visibleTo === 'tecnico') {
      out.push(e);
      continue;
    }

    const content = (e.content ?? '').trim();
    const hasDentist = content.includes(DENTIST_PHRASE);
    const hasFauchard = content.includes(FAUCHARD_PHRASE);

    if (!hasDentist || !hasFauchard) {
      out.push(e);
      continue;
    }

    const baseTs = new Date(e.createdAt).getTime();
    const safeBase = Number.isFinite(baseTs) ? baseTs : Date.now();

    const dentistPayload: Record<string, unknown> = { ...payload };
    delete dentistPayload.presentationAuthor;
    // Marca leída por `resolveUchThreadLane` para forzar carril propio en la mitad dentista
    // del split, sin tocar `event.user` (que el servidor enmascara como Fauchard).
    dentistPayload[UCH_SELF_HALF_PAYLOAD_KEY] = true;

    const fauchardPayload: Record<string, unknown> = {
      ...payload,
      presentationAuthor: 'fauchard',
    };

    out.push({
      ...e,
      id: `${e.id}::dentist`,
      content: DENTIST_PHRASE,
      payload: dentistPayload,
      createdAt: new Date(safeBase),
    });

    out.push({
      ...e,
      id: `${e.id}::fauchard`,
      content: FAUCHARD_PHRASE,
      payload: fauchardPayload,
      createdAt: new Date(safeBase + 1),
    });
  }
  return out;
}
