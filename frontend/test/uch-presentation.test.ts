import { describe, expect, it } from 'vitest';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { shouldPresentUchEventAsFauchard, UCH_PAYLOAD_PRESENTATION_FAUCHARD } from '@/lib/uchPresentation';

describe('shouldPresentUchEventAsFauchard', () => {
  it('no enmascara cuando el viewer es el autor sin presentationAuthor (p. ej. aceptación de oferta)', () => {
    expect(
      shouldPresentUchEventAsFauchard(
        {
          userId: 'u-dent',
          user: { id: '__fauchard__', fullName: 'Fauchard', role: 'sistema' },
          payload: { visibleTo: 'dentista' },
        },
        { id: 'u-dent', role: 'dentista' },
        'u-dent',
      ),
    ).toBe(false);
  });

  it('enmascara a Fauchard cuando el viewer es el actor persistido pero el payload marca orquestación', () => {
    expect(
      shouldPresentUchEventAsFauchard(
        {
          userId: 'u-dent',
          user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
          payload: { visibleTo: 'dentista', ...UCH_PAYLOAD_PRESENTATION_FAUCHARD },
        },
        { id: 'u-dent', role: 'dentista' },
        'u-dent',
      ),
    ).toBe(true);
  });

  it('sigue enmascarando mensajes del otro rol hacia dentista', () => {
    expect(
      shouldPresentUchEventAsFauchard(
        {
          userId: 'u-tech',
          user: { id: 'u-tech', fullName: 'Lab', role: 'tecnico' },
          payload: { visibleTo: 'dentista' },
        },
        { id: 'u-dent', role: 'dentista' },
        'u-dent',
      ),
    ).toBe(true);
  });

  it('INVITACION_RECIBIDA técnico mismo userId sin presentationAuthor → Fauchard (legacy BD)', () => {
    expect(
      shouldPresentUchEventAsFauchard(
        {
          userId: 'u-tech',
          action: CASE_EVENTS.INVITACION_RECIBIDA,
          user: { id: 'u-tech', fullName: 'Lab', role: 'tecnico' },
          payload: { visibleTo: 'tecnico' },
        },
        { id: 'u-tech', role: 'tecnico' },
        'u-dent',
      ),
    ).toBe(true);
  });
});
