import { describe, expect, it } from 'vitest';
import { userCanAccessClinicalCase } from '@/lib/db/caseListVisibility';

const ORG = 'org-1';
const DENTIST_A = 'dentist-a';
const DENTIST_B = 'dentist-b';
const TECH = 'tech-1';

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
