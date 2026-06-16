import { describe, expect, it } from 'vitest';
import {
  hydrateOnboardingFormData,
  mapOnboardingStepToUiStep,
  resolveOnboardingRole,
} from '@/lib/auth/onboardingHydration';

const blankForm = {
  userId: '',
  orgId: '',
  orgName: '',
  phone: '',
  country: 'CL',
  region: '',
  comuna: '',
  address: '',
  addressNumber: '',
  addressOffice: '',
  specialty: 'Odontología General',
  registrationNumber: '',
  experienceYears: '',
  taxId: '',
  giro: '',
  legalAddress: '',
};

describe('resolveOnboardingRole', () => {
  it('maps diseñador and tecnico to tecnico', () => {
    expect(resolveOnboardingRole('tecnico')).toBe('tecnico');
    expect(resolveOnboardingRole('diseñador')).toBe('tecnico');
  });

  it('defaults to dentista', () => {
    expect(resolveOnboardingRole('dentista')).toBe('dentista');
    expect(resolveOnboardingRole(null)).toBe('dentista');
  });
});

describe('mapOnboardingStepToUiStep', () => {
  it('maps técnico milestones', () => {
    expect(mapOnboardingStepToUiStep(0, 'tecnico')).toBe(1);
    expect(mapOnboardingStepToUiStep(20, 'tecnico')).toBe(2);
    expect(mapOnboardingStepToUiStep(50, 'tecnico')).toBe(3);
    expect(mapOnboardingStepToUiStep(65, 'tecnico')).toBe(4);
    expect(mapOnboardingStepToUiStep(80, 'tecnico')).toBe(5);
  });

  it('maps dentista milestones', () => {
    expect(mapOnboardingStepToUiStep(20, 'dentista')).toBe(2);
    expect(mapOnboardingStepToUiStep(50, 'dentista')).toBe(3);
    expect(mapOnboardingStepToUiStep(75, 'dentista')).toBe(4);
  });

  it('regression: técnico step 65 opens Habilidades (4), not Perfil (2)', () => {
    expect(mapOnboardingStepToUiStep(65, 'tecnico')).toBe(4);
    expect(mapOnboardingStepToUiStep(65, 'tecnico')).not.toBe(2);
  });
});

describe('hydrateOnboardingFormData', () => {
  it('hydrates user and org fields from profile', () => {
    const result = hydrateOnboardingFormData(
      {
        phone: '+56 9 1234 5678',
        country: 'CL',
        region: 'CL-RM',
        comuna: 'CL-RM-SAN',
        address: 'Av. Providencia',
        addressNumber: '100',
        specialty: 'Endodoncia',
        registrationNumber: 'REG-1',
        experienceYears: 5,
        organization: {
          id: 'org-1',
          name: 'Temporal - Lab Norte',
          rut: '12.345.678-9',
          giro: 'Laboratorio dental',
          legalAddress: 'Calle 1',
        },
      },
      blankForm,
      'user-1',
    );

    expect(result.userId).toBe('user-1');
    expect(result.orgId).toBe('org-1');
    expect(result.orgName).toBe('Lab Norte');
    expect(result.phone).toBe('+56 9 1234 5678');
    expect(result.experienceYears).toBe('5');
    expect(result.taxId).toBe('12.345.678-9');
    expect(result.giro).toBe('Laboratorio dental');
  });
});
