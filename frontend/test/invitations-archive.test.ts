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
    assignedAt: new Date(),
    expiresAt: null,
    compensation: null,
    deadlineDays: null,
    deadlineHours: null,
    isAssigned: false,
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
