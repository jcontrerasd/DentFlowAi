import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAuthMock, updateProfileOptimisticallyMock, getSignedUrlActionMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  updateProfileOptimisticallyMock: vi.fn(),
  getSignedUrlActionMock: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/lib/db/actions/user', () => ({
  updateUserAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/db/actions/organization', () => ({
  updateOrganizationDetailsAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/db/actions/cases', () => ({
  getUploadUrlAction: vi.fn(),
  getSignedUrlAction: (...a: unknown[]) => getSignedUrlActionMock(...a),
}));

vi.mock('@/components/profile/SkillMatrixForm', () => ({
  __esModule: true,
  default: React.forwardRef(function SkillMatrixStub() {
    return <div data-testid="skill-matrix-stub" />;
  }),
}));

vi.mock('@/components/profile/AvailabilityToggle', () => ({
  __esModule: true,
  default: () => <div data-testid="availability-stub" />,
}));

import ProfilePage from '@/app/dashboard/profile/page';
import { ToastProvider } from '@/context/ToastContext';

describe('ProfilePage', () => {
  beforeEach(() => {
    getSignedUrlActionMock.mockReset();
    getSignedUrlActionMock.mockResolvedValue(null);
    useAuthMock.mockReturnValue({
      user: { id: 'u1', email: 'u@test.com' },
      userProfile: {
        id: 'u1',
        role: 'dentista',
        fullName: 'Dr. Test',
        phone: '',
        specialty: 'Odontología General',
        registrationNumber: '',
        experienceYears: 0,
        bio: '',
        image: null,
        organization: { id: 'org-1', name: 'Clínica' },
      },
      updateProfileOptimistically: updateProfileOptimisticallyMock,
    });
  });

  it('muestra encabezado Mi Perfil', async () => {
    render(
      <ToastProvider>
        <ProfilePage />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Mi Perfil/i })).toBeInTheDocument();
    });
  });

  it('no llama a firma de avatar si el perfil no tiene imagen', async () => {
    render(
      <ToastProvider>
        <ProfilePage />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Mi Perfil/i })).toBeInTheDocument();
    });
    expect(getSignedUrlActionMock).not.toHaveBeenCalled();
  });
});
