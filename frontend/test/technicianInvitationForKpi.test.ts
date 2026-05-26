import { describe, expect, it } from 'vitest';
import {
  buildInvitationStatusByCaseId,
  pickInvitationStatusForKpi,
} from '@/lib/cases/technicianInvitationForKpi';

describe('pickInvitationStatusForKpi', () => {
  it('elige la fila con updated_at más reciente', () => {
    expect(
      pickInvitationStatusForKpi([
        { status: 'quoted', updatedAt: new Date('2024-01-01') },
        { status: 'confirmed', updatedAt: new Date('2024-01-02') },
      ]),
    ).toBe('confirmed');
  });

  it('rejected reciente gana sobre confirmed antiguo', () => {
    expect(
      pickInvitationStatusForKpi([
        { status: 'confirmed', updatedAt: new Date('2024-01-01') },
        { status: 'rejected', updatedAt: new Date('2024-06-01') },
      ]),
    ).toBe('rejected');
  });

  it('sin ganador, elige fila más reciente', () => {
    expect(
      pickInvitationStatusForKpi([
        { status: 'quoted', updatedAt: new Date('2024-01-01') },
        { status: 'withdrawn', updatedAt: new Date('2024-06-01') },
      ]),
    ).toBe('withdrawn');
  });
});

describe('buildInvitationStatusByCaseId', () => {
  it('agrupa por caso con criterio representativo', () => {
    const map = buildInvitationStatusByCaseId([
      {
        clinicalCaseId: 'c1',
        status: 'quoted',
        updatedAt: new Date('2024-01-01'),
      },
      {
        clinicalCaseId: 'c1',
        status: 'rejected',
        updatedAt: new Date('2024-06-01'),
      },
      {
        clinicalCaseId: 'c2',
        status: 'pending',
        updatedAt: new Date('2024-03-01'),
      },
    ]);
    expect(map.get('c1')).toBe('rejected');
    expect(map.get('c2')).toBe('pending');
  });
});
