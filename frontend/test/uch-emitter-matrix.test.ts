import { describe, expect, it } from 'vitest';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { shouldUseUchNeutralSystemPill } from '@/lib/constants/uchEmitterMatrix';
import {
  splitCasoPublicadoForDentista,
  UCH_SELF_HALF_PAYLOAD_KEY,
} from '@/lib/uchCasoPublicadoSplit';
import { resolveUchThreadLane } from '@/lib/uchThreadLane';
import { UCH_FAUCHARD_PUBLIC_USER } from '@/lib/uchPresentation';

describe('shouldUseUchNeutralSystemPill', () => {
  it('no usa píldora para hitos de orquestación', () => {
    expect(
      shouldUseUchNeutralSystemPill({
        eventType: 'sistema',
        eventAction: CASE_EVENTS.INVITACION_RECIBIDA,
        isOutcomeNotice: false,
      }),
    ).toBe(false);
    expect(
      shouldUseUchNeutralSystemPill({
        eventType: 'sistema',
        eventAction: CASE_EVENTS.CASO_PUBLICADO,
        isOutcomeNotice: false,
      }),
    ).toBe(false);
  });

  it('solo allowlist en filas sistema', () => {
    expect(
      shouldUseUchNeutralSystemPill({
        eventType: 'sistema',
        eventAction: 'CASO_CLASIFICADO',
        isOutcomeNotice: false,
      }),
    ).toBe(true);
    expect(
      shouldUseUchNeutralSystemPill({
        eventType: 'tecnico',
        eventAction: 'CASO_CLASIFICADO',
        isOutcomeNotice: false,
      }),
    ).toBe(false);
  });
});

describe('resolveUchThreadLane + uchPresentationRole', () => {
  it('INVITACION_RECIBIDA técnico sin presentationAuthor: hilo + Fauchard', () => {
    const ev = {
      userId: 'u-tech',
      type: 'sistema' as const,
      action: CASE_EVENTS.INVITACION_RECIBIDA,
      payload: { visibleTo: 'tecnico' },
      user: { id: 'u-tech', fullName: 'Lab', role: 'tecnico' },
    };
    expect(resolveUchThreadLane(ev, { actingAsDentista: false, actingAsTecnico: true, currentUserId: 'u-tech' })).toEqual({
      lane: 'thread',
      showAsFauchard: true,
    });
  });

  it('viewingAsAdmin usa tabla A (supervisión) aunque legacy dual flags', () => {
    const ev = {
      userId: 'u-tech',
      type: 'tecnico' as const,
      action: CASE_EVENTS.OFERTA_ENVIADA,
      payload: {},
      user: { id: 'u-tech', fullName: 'Lab', role: 'tecnico' },
    };
    expect(
      resolveUchThreadLane(ev, {
        actingAsDentista: false,
        actingAsTecnico: false,
        viewingAsAdmin: true,
        currentUserId: 'u-admin',
      }),
    ).toEqual({ lane: 'thread', showAsFauchard: true });
  });

  it('admin con uchPresentationRole dentista usa tabla A para oferta ajena', () => {
    const ev = {
      userId: 'u-tech',
      type: 'tecnico' as const,
      action: CASE_EVENTS.OFERTA_ENVIADA,
      payload: {},
      user: { id: 'u-tech', fullName: 'Lab', role: 'tecnico' },
    };
    expect(
      resolveUchThreadLane(ev, {
        actingAsDentista: true,
        actingAsTecnico: true,
        currentUserId: 'u-admin',
        uchPresentationRole: 'dentista',
      }),
    ).toEqual({ lane: 'thread', showAsFauchard: true });
  });
});

describe('splitCasoPublicadoForDentista + resolveUchThreadLane', () => {
  const dentistaViewer = {
    actingAsDentista: true,
    actingAsTecnico: false,
    currentUserId: 'u-doc',
  } as const;

  const maskedCasoPublicadoCombined = {
    id: 'evt-cp-1',
    userId: 'u-doc',
    type: 'sistema' as const,
    action: CASE_EVENTS.CASO_PUBLICADO,
    content: 'He publicado el caso. Estamos buscando el laboratorio ideal para tu caso.',
    payload: { visibleTo: 'dentista' },
    stateChange: {},
    createdAt: new Date('2026-05-13T22:40:00.000Z'),
    user: {
      id: UCH_FAUCHARD_PUBLIC_USER.id,
      fullName: UCH_FAUCHARD_PUBLIC_USER.fullName,
      role: UCH_FAUCHARD_PUBLIC_USER.role,
    },
  };

  it('mitad dentista: carril propio por marca de payload (user enmascarado se conserva)', () => {
    const [dentistHalf, fauchardHalf] = splitCasoPublicadoForDentista([maskedCasoPublicadoCombined]);
    expect(dentistHalf?.id).toMatch(/::dentist$/);
    // El `user` enmascarado se mantiene; el carril se decide por la marca en `payload`.
    expect(dentistHalf?.user?.id).toBe(UCH_FAUCHARD_PUBLIC_USER.id);
    expect((dentistHalf?.payload as Record<string, unknown>)[UCH_SELF_HALF_PAYLOAD_KEY]).toBe(true);
    expect((dentistHalf?.payload as Record<string, unknown>).presentationAuthor).toBeUndefined();
    expect(resolveUchThreadLane(dentistHalf, dentistaViewer)).toEqual({
      lane: 'self',
      showAsFauchard: false,
    });
    expect((fauchardHalf?.payload as Record<string, unknown>)[UCH_SELF_HALF_PAYLOAD_KEY]).toBeUndefined();
    expect(resolveUchThreadLane(fauchardHalf, dentistaViewer)).toEqual({
      lane: 'thread',
      showAsFauchard: true,
    });
  });

  it('legacy sin partir: un solo evento combinado enmascarado sigue en hilo Fauchard', () => {
    expect(resolveUchThreadLane(maskedCasoPublicadoCombined, dentistaViewer)).toEqual({
      lane: 'thread',
      showAsFauchard: true,
    });
  });
});
