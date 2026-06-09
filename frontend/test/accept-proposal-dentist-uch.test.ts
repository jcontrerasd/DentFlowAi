import { describe, expect, it } from 'vitest';

/**
 * Coherente con `acceptProposalAction` en proposal.ts: al aceptar una oferta, el
 * loop de "losers" solo procesa invitaciones aún activas (pending/quoted). Las que
 * ya estaban `rejected` —rechazo manual del dentista (OFERTA_RECHAZADA) o del propio
 * técnico (OFERTA_RECHAZADA_POR_TECNICO)— ya recibieron su evento de cierre, así que
 * NO se les vuelve a emitir OFERTA_NO_SELECCIONADA (evitaba dos "Otra oferta fue
 * elegida" en el UCH del técnico, y el duplicado de cierre al dentista).
 */
function shouldProcessLoser(loserStatusBeforeAccept: string): boolean {
  return loserStatusBeforeAccept === 'pending' || loserStatusBeforeAccept === 'quoted';
}

describe('acceptProposalAction — losers (sin duplicar el aviso de cierre)', () => {
  it('omite por completo a un loser ya rechazado (no re-emite OFERTA_NO_SELECCIONADA)', () => {
    expect(shouldProcessLoser('rejected')).toBe(false);
  });

  it('procesa los losers aún vivos en el comparativo', () => {
    expect(shouldProcessLoser('quoted')).toBe(true);
    expect(shouldProcessLoser('pending')).toBe(true);
  });
});
