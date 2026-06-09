import { describe, it, expect, vi } from 'vitest';
import { dispatchHubUnreadRefresh, subscribeHubUnreadRefresh } from '@/lib/hubUnreadEvents';
import { filterOthersTechChannel, filterOthersNegChannel, type UchUnreadEvent } from '@/lib/uchUnread';

describe('hubUnreadEvents bus', () => {
  it('invoca al suscriptor cuando se dispara el evento', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeHubUnreadRefresh(handler);

    dispatchHubUnreadRefresh();
    expect(handler).toHaveBeenCalledTimes(1);

    dispatchHubUnreadRefresh();
    expect(handler).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('deja de notificar tras desuscribirse', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeHubUnreadRefresh(handler);
    unsubscribe();

    dispatchHubUnreadRefresh();
    expect(handler).not.toHaveBeenCalled();
  });

  it('soporta múltiples suscriptores independientes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeHubUnreadRefresh(a);
    const ub = subscribeHubUnreadRefresh(b);

    dispatchHubUnreadRefresh();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    ua();
    dispatchHubUnreadRefresh();
    expect(a).toHaveBeenCalledTimes(1); // ya no recibe
    expect(b).toHaveBeenCalledTimes(2);

    ub();
  });
});

describe('detección de mensaje entrante del otro rol', () => {
  const viewer = 'viewer-1';
  const other = 'tech-9';

  // Replica la lógica de detección de la página del caso: máximo createdAt de eventos del otro rol.
  const maxOtherMs = (events: UchUnreadEvent[]): number => {
    const others = [
      ...filterOthersTechChannel(events, viewer),
      ...filterOthersNegChannel(events, viewer),
    ];
    return others.reduce((m, e) => Math.max(m, new Date(e.createdAt).getTime() || 0), 0);
  };

  it('un evento nuevo del otro rol aumenta el máximo (dispararía toast)', () => {
    const base: UchUnreadEvent[] = [
      { type: 'tecnico', action: 'REVISION_ENVIADA', userId: other, createdAt: new Date(1000) },
    ];
    const prev = maxOtherMs(base);

    const next = [
      ...base,
      { type: 'tecnico', action: 'REVISION_ENVIADA', userId: other, createdAt: new Date(2000) } as UchUnreadEvent,
    ];
    expect(maxOtherMs(next)).toBeGreaterThan(prev);
  });

  it('un evento propio NO aumenta el máximo (sin falso positivo)', () => {
    const base: UchUnreadEvent[] = [
      { type: 'tecnico', action: 'REVISION_ENVIADA', userId: other, createdAt: new Date(1000) },
    ];
    const prev = maxOtherMs(base);

    const next = [
      ...base,
      { type: 'negociacion', action: 'OFERTA_ENVIADA', userId: viewer, createdAt: new Date(5000) } as UchUnreadEvent,
    ];
    expect(maxOtherMs(next)).toBe(prev);
  });
});
