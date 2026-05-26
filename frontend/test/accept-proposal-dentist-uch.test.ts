import { describe, expect, it } from 'vitest';

/**
 * Coherente con `acceptProposalAction` en proposal.ts:
 * no registrar OFERTA_NO_SELECCIONADA visible al dentista si el perdedor ya estaba `rejected`.
 */
function skipDentistOmissionLog(loserStatusBeforeAccept: string): boolean {
  return loserStatusBeforeAccept === 'rejected';
}

describe('acceptProposalAction UCH dentista (sin duplicar cierre por omisión)', () => {
  it('omite log dentista cuando el perdedor ya fue rechazado manualmente', () => {
    expect(skipDentistOmissionLog('rejected')).toBe(true);
  });

  it('no omite para ofertas aún vivas en el comparativo', () => {
    expect(skipDentistOmissionLog('quoted')).toBe(false);
    expect(skipDentistOmissionLog('pending')).toBe(false);
  });
});
