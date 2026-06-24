export type OnboardingAppRole = 'dentista' | 'tecnico';

export type OnboardingProfile = {
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
  onboardingStep?: number | null;
  phone?: string | null;
  country?: string | null;
  region?: string | null;
  comuna?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  addressOffice?: string | null;
  specialty?: string | null;
  registrationNumber?: string | null;
  experienceYears?: number | null;
  organization?: {
    id?: string;
    name?: string | null;
    rut?: string | null;
    giro?: string | null;
    legalAddress?: string | null;
    technicalCapabilities?: unknown;
  } | null;
};

export type OnboardingFormData = {
  userId: string;
  orgId: string;
  orgName: string;
  phone: string;
  country: string;
  region: string;
  comuna: string;
  address: string;
  addressNumber: string;
  addressOffice: string;
  specialty: string;
  registrationNumber: string;
  experienceYears: string;
  taxId: string;
  giro: string;
  legalAddress: string;
};

export function resolveOnboardingRole(profileRole: string | null | undefined): OnboardingAppRole {
  if (profileRole === 'tecnico' || profileRole === 'diseñador') return 'tecnico';
  return 'dentista';
}

/** Mapea onboardingStep (DB) al índice de paso UI del wizard. */
export function mapOnboardingStepToUiStep(
  onboardingStep: number,
  role: OnboardingAppRole,
): number {
  if (role === 'tecnico') {
    if (onboardingStep >= 80) return 5;
    if (onboardingStep >= 65) return 4;
    if (onboardingStep >= 50) return 3;
    if (onboardingStep >= 20) return 2;
    return 1;
  }
  if (onboardingStep >= 75) return 4;
  if (onboardingStep >= 50) return 3;
  if (onboardingStep >= 20) return 2;
  return 1;
}

function stripTemporalOrgPrefix(name: string | null | undefined): string {
  if (!name) return '';
  return name.replace(/^Temporal\s*-\s*/i, '').trim();
}

export function hydrateOnboardingFormData(
  profile: OnboardingProfile,
  prev: OnboardingFormData,
  userId: string,
): OnboardingFormData {
  const org = profile.organization;
  return {
    ...prev,
    userId: userId || prev.userId,
    orgId: org?.id || prev.orgId,
    orgName: stripTemporalOrgPrefix(org?.name) || prev.orgName,
    phone: profile.phone ?? prev.phone,
    country: profile.country || prev.country || 'CL',
    region: profile.region ?? prev.region,
    comuna: profile.comuna ?? prev.comuna,
    address: profile.address ?? prev.address,
    addressNumber: profile.addressNumber ?? prev.addressNumber,
    addressOffice: profile.addressOffice ?? prev.addressOffice,
    specialty: profile.specialty || prev.specialty,
    registrationNumber: profile.registrationNumber ?? prev.registrationNumber,
    experienceYears:
      profile.experienceYears != null
        ? String(profile.experienceYears)
        : prev.experienceYears,
    taxId: org?.rut ?? prev.taxId,
    giro: org?.giro ?? prev.giro,
    legalAddress: org?.legalAddress ?? prev.legalAddress,
  };
}

