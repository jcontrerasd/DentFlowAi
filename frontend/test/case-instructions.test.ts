import { describe, expect, it } from 'vitest';
import {
  creationInstructionsText,
  latestRejectedDeliveryReviewComment,
} from '@/lib/cases/instructions';

describe('creationInstructionsText', () => {
  it('prefers specialInstructions over doctorNotes', () => {
    expect(
      creationInstructionsText({
        specialInstructions: '  Crear contorno mesial  ',
        doctorNotes: 'Solo ajuste incisal',
      }),
    ).toBe('Crear contorno mesial');
  });

  it('falls back to doctorNotes when specialInstructions is absent', () => {
    expect(creationInstructionsText({ doctorNotes: 'Legacy note' })).toBe('Legacy note');
  });
});

describe('latestRejectedDeliveryReviewComment', () => {
  it('returns comment from highest-version rejected delivery', () => {
    expect(
      latestRejectedDeliveryReviewComment([
        { version: 1, status: 'rejected', reviewComment: 'older' },
        { version: 3, status: 'rejected', reviewComment: 'newest' },
        { version: 2, status: 'approved', reviewComment: 'ignored' },
      ]),
    ).toBe('newest');
  });

  it('returns null when there is no rejected delivery with comment', () => {
    expect(
      latestRejectedDeliveryReviewComment([{ version: 1, status: 'pending', reviewComment: null }]),
    ).toBeNull();
  });
});
