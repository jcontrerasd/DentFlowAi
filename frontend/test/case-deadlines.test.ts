import { describe, it, expect } from 'vitest';
import { getCaseProposalDeadlineAt } from '@/lib/db/caseDeadlines';

describe('caseDeadlines', () => {
  describe('getCaseProposalDeadlineAt', () => {
    it('returns Date for proposalExpiresAt', () => {
      const d = new Date('2030-06-01T12:00:00.000Z');
      expect(getCaseProposalDeadlineAt({ proposalExpiresAt: d })?.getTime()).toBe(d.getTime());
    });

    it('returns null when missing or invalid', () => {
      expect(getCaseProposalDeadlineAt({})).toBeNull();
      expect(getCaseProposalDeadlineAt({ proposalExpiresAt: 'invalid' })).toBeNull();
    });
  });
});
