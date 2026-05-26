import { describe, expect, it } from 'vitest';
import { applyInvitationArchiveFlags } from '@/lib/invitations/invitationArchiveFlags';

describe('applyInvitationArchiveFlags', () => {
  const base = {
    id: 'inv-1',
    caseId: 'case-a',
    caseNumber: 'DF-0001',
    internalName: 'Caso',
    restorationType: 'Corona',
    material: 'Zirconio',
    urgency: 'normal',
    caseComplexity: null,
    serviceType: 'solo_diseno',
    status: 'pending' as const,
    invitedAt: new Date(),
    expiresAt: null,
    quotedPrice: null,
    quotedDays: null,
    isWinner: false,
    caseStatus: 'enEvaluacion',
    teeth: [],
  };

  it('marca archivedByCurrentUser según ids archivados', () => {
    const result = applyInvitationArchiveFlags(
      [
        { ...base, caseId: 'case-a' },
        { ...base, id: 'inv-2', caseId: 'case-b' },
      ],
      ['case-b'],
    );
    expect(result[0].archivedByCurrentUser).toBe(false);
    expect(result[1].archivedByCurrentUser).toBe(true);
  });
});
