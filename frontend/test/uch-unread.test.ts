import { describe, it, expect } from 'vitest';
import {
  countUnreadNegChannel,
  countUnreadTechChannel,
  totalUchHubUnread,
  type UchUnreadEvent,
} from '@/lib/uchUnread';

const base = (over: Partial<UchUnreadEvent>): UchUnreadEvent => ({
  type: 'tecnico',
  action: 'COMENTARIO_TECNICO',
  userId: 'tech-1',
  createdAt: new Date('2026-01-01T12:00:00Z'),
  ...over,
});

describe('uchUnread', () => {
  it('cuenta todo el canal técnico del otro si no hay marca de lectura', () => {
    const events: UchUnreadEvent[] = [
      base({ action: 'COMENTARIO_TECNICO', userId: 'tech-1', createdAt: '2026-01-01T10:00:00Z' }),
      base({ action: 'REVISION_ENVIADA', userId: 'tech-1', createdAt: '2026-01-01T11:00:00Z' }),
    ];
    expect(countUnreadTechChannel(events, 'dent-1', null)).toBe(2);
    expect(countUnreadNegChannel(events, 'dent-1', null)).toBe(0);
  });

  it('no cuenta mensajes propios del visor', () => {
    const events: UchUnreadEvent[] = [
      base({ userId: 'dent-1', createdAt: '2026-01-01T10:00:00Z' }),
      base({ userId: 'tech-1', createdAt: '2026-01-01T11:00:00Z' }),
    ];
    expect(countUnreadTechChannel(events, 'dent-1', null)).toBe(1);
  });

  it('respeta lastRead solo para eventos posteriores', () => {
    const lastRead = new Date('2026-01-01T10:30:00Z');
    const events: UchUnreadEvent[] = [
      base({ userId: 'tech-1', createdAt: '2026-01-01T10:00:00Z' }),
      base({ userId: 'tech-1', createdAt: '2026-01-01T11:00:00Z' }),
    ];
    expect(countUnreadTechChannel(events, 'dent-1', lastRead)).toBe(1);
  });

  it('canal negociación con acciones listadas', () => {
    const events: UchUnreadEvent[] = [
      {
        type: 'negociacion',
        action: 'OFERTA_ENVIADA',
        userId: 'tech-1',
        createdAt: '2026-01-02T08:00:00Z',
      },
    ];
    expect(countUnreadNegChannel(events, 'dent-1', null)).toBe(1);
    expect(countUnreadTechChannel(events, 'dent-1', null)).toBe(0);
  });

  it('totalUchHubUnread suma canales', () => {
    const events: UchUnreadEvent[] = [
      { type: 'tecnico', action: 'ENTREGA_SUBIDA', userId: 't1', createdAt: '2026-01-03T10:00:00Z' },
      { type: 'negociacion', action: 'MENSAJE_NEGOCIACION', userId: 't1', createdAt: '2026-01-03T11:00:00Z' },
    ];
    expect(
      totalUchHubUnread(events, 'd1', { lastReadTech: null, lastReadNeg: null }),
    ).toBe(2);
  });
});
