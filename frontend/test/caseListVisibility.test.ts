import { describe, expect, it } from 'vitest';
import {
  userCanAccessClinicalCase,
  getDoctorAddressDisclosure,
} from '@/lib/db/caseListVisibility';

const ORG = 'org-1';
const DENTIST_A = 'dentist-a';
const DENTIST_B = 'dentist-b';
const TECH = 'tech-1';
const TECH_LOSER = 'tech-2';

describe('userCanAccessClinicalCase', () => {
  it('dentista: accede a su propio caso', async () => {
    expect(
      await userCanAccessClinicalCase(
        { id: DENTIST_A, role: 'dentista', orgId: ORG },
        'case-1',
        {
          organizationId: ORG,
          doctorId: DENTIST_A,
          status: 'borrador',
          assignedTechnicianId: null,
        },
      ),
    ).toBe(true);
  });

  it('dentista: no accede al borrador de otro dentista de la misma org', async () => {
    expect(
      await userCanAccessClinicalCase(
        { id: DENTIST_B, role: 'dentista', orgId: ORG },
        'case-1',
        {
          organizationId: ORG,
          doctorId: DENTIST_A,
          status: 'enEvaluacion',
          assignedTechnicianId: null,
        },
      ),
    ).toBe(false);
  });

  it('dentista: accede a publicado de otro dentista en la misma org', async () => {
    expect(
      await userCanAccessClinicalCase(
        { id: DENTIST_B, role: 'dentista', orgId: ORG },
        'case-1',
        {
          organizationId: ORG,
          doctorId: DENTIST_A,
          status: 'publicado',
          assignedTechnicianId: null,
        },
      ),
    ).toBe(true);
  });

  it('dentista: no accede a caso de otra organización', async () => {
    expect(
      await userCanAccessClinicalCase(
        { id: DENTIST_A, role: 'dentista', orgId: ORG },
        'case-1',
        {
          organizationId: 'other-org',
          doctorId: DENTIST_A,
          status: 'borrador',
          assignedTechnicianId: null,
        },
      ),
    ).toBe(false);
  });

  it('admin org: accede a cualquier caso de la org', async () => {
    expect(
      await userCanAccessClinicalCase(
        { id: 'admin-1', role: 'admin', orgId: ORG },
        'case-1',
        {
          organizationId: ORG,
          doctorId: DENTIST_A,
          status: 'borrador',
          assignedTechnicianId: null,
        },
      ),
    ).toBe(true);
  });

  it('system admin: bypass', async () => {
    expect(
      await userCanAccessClinicalCase(
        { id: 'admin-1', role: 'dentista', orgId: ORG, isSystemAdmin: true },
        'case-1',
        {
          organizationId: 'other-org',
          doctorId: DENTIST_A,
          status: 'borrador',
          assignedTechnicianId: null,
        },
      ),
    ).toBe(true);
  });

  it('técnico asignado: accede sin consultar invitación', async () => {
    expect(
      await userCanAccessClinicalCase(
        { id: TECH, role: 'tecnico', orgId: null },
        'case-1',
        {
          organizationId: ORG,
          doctorId: DENTIST_A,
          status: 'enEjecucion',
          assignedTechnicianId: TECH,
        },
      ),
    ).toBe(true);
  });
});

describe('getDoctorAddressDisclosure (v2 — solo diseño, sin nivel coarse)', () => {
  const base = {
    assignedTechnicianId: TECH,
    doctorId: DENTIST_A,
    isInvitedTechnician: true,
    needsFabrication: false,
  };

  it('técnico asignado (ganador): dirección completa (full)', () => {
    expect(
      getDoctorAddressDisclosure({ role: 'tecnico', userId: TECH, ...base }),
    ).toBe('full');
  });

  it('técnico invitado no asignado: ninguna dirección (none) — coarse eliminado en v2', () => {
    expect(
      getDoctorAddressDisclosure({ role: 'tecnico', userId: TECH_LOSER, ...base }),
    ).toBe('none');
  });

  it('técnico perdedor: ninguna dirección (none)', () => {
    expect(
      getDoctorAddressDisclosure({ role: 'tecnico', userId: TECH_LOSER, ...base }),
    ).toBe('none');
  });

  it('técnico sin invitación al caso: nada (none)', () => {
    expect(
      getDoctorAddressDisclosure({
        role: 'tecnico',
        userId: 'tech-extraño',
        ...base,
        isInvitedTechnician: false,
      }),
    ).toBe('none');
  });

  it('caso sin fabricación (siempre en v2): técnico invitado no ve ninguna dirección (none)', () => {
    expect(
      getDoctorAddressDisclosure({
        role: 'tecnico',
        userId: TECH_LOSER,
        ...base,
        needsFabrication: false,
      }),
    ).toBe('none');
  });

  it('admin: dirección completa (full)', () => {
    expect(
      getDoctorAddressDisclosure({ role: 'admin', userId: 'admin-1', ...base, isInvitedTechnician: false }),
    ).toBe('full');
  });

  it('isSystemAdmin (impersonando o no): dirección completa (full)', () => {
    expect(
      getDoctorAddressDisclosure({ isSystemAdmin: true, role: 'tecnico', userId: TECH_LOSER, ...base, isInvitedTechnician: false }),
    ).toBe('full');
  });

  it('dentista dueño: su propia dirección completa (full)', () => {
    expect(
      getDoctorAddressDisclosure({ role: 'dentista', userId: DENTIST_A, ...base, isInvitedTechnician: false }),
    ).toBe('full');
  });

  it('userId nulo: nada (none)', () => {
    expect(
      getDoctorAddressDisclosure({ role: 'tecnico', userId: null, ...base }),
    ).toBe('none');
  });

  it('caso sin técnico asignado todavía: técnico invitado no ve dirección (none)', () => {
    expect(
      getDoctorAddressDisclosure({
        role: 'tecnico',
        userId: TECH,
        ...base,
        assignedTechnicianId: null,
      }),
    ).toBe('none');
  });
});
