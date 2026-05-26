import { describe, expect, it } from 'vitest';
import { tecnicoSeesVisibleToTecnicoEvent } from '@/lib/uchEventVisibility';

describe('tecnicoSeesVisibleToTecnicoEvent', () => {
  const tech = 'tech-1';
  const doctor = 'doc-1';

  it('con invitationId y currentInvitationId coincide → true', () => {
    expect(
      tecnicoSeesVisibleToTecnicoEvent({
        eventUserId: tech,
        invitationIdFromPayload: 'inv-a',
        viewerTechnicianId: tech,
        currentInvitationId: 'inv-a',
        assignedTechnicianId: tech,
        doctorId: doctor,
      }),
    ).toBe(true);
  });

  it('con invitationId y currentInvitationId distinto → false aunque userId sea el técnico', () => {
    expect(
      tecnicoSeesVisibleToTecnicoEvent({
        eventUserId: tech,
        invitationIdFromPayload: 'inv-old',
        viewerTechnicianId: tech,
        currentInvitationId: 'inv-new',
        assignedTechnicianId: tech,
        doctorId: doctor,
      }),
    ).toBe(false);
  });

  it('con invitationId y currentInvitationId null: evento del propio técnico → true (UCH antes de resolver invitación)', () => {
    expect(
      tecnicoSeesVisibleToTecnicoEvent({
        eventUserId: tech,
        invitationIdFromPayload: 'inv-a',
        viewerTechnicianId: tech,
        currentInvitationId: null,
        assignedTechnicianId: null,
        doctorId: doctor,
      }),
    ).toBe(true);
  });

  it('con invitationId y currentInvitationId null: evento de otro usuario → false', () => {
    expect(
      tecnicoSeesVisibleToTecnicoEvent({
        eventUserId: 'otro',
        invitationIdFromPayload: 'inv-a',
        viewerTechnicianId: tech,
        currentInvitationId: null,
        assignedTechnicianId: tech,
        doctorId: doctor,
      }),
    ).toBe(false);
  });

  it('sin invitationId: dentista del caso y técnico asignado → true', () => {
    expect(
      tecnicoSeesVisibleToTecnicoEvent({
        eventUserId: doctor,
        invitationIdFromPayload: undefined,
        viewerTechnicianId: tech,
        currentInvitationId: 'inv-a',
        assignedTechnicianId: tech,
        doctorId: doctor,
      }),
    ).toBe(true);
  });
});
