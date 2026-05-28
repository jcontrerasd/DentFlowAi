import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pushMock, useAuthMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/dashboard',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next-auth/react', () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db/actions/cases', () => ({
  getSignedUrlAction: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db/actions/invitations', () => ({
  getMyInvitationsAction: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/components/admin/ImpersonationSelector', () => ({
  default: () => null,
}));

vi.mock('@/components/theme/ThemeToggleButton', () => ({
  default: () => null,
}));

import DashboardLayout from '@/app/dashboard/layout';

describe('DashboardLayout', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('redirige a login si no hay usuario autenticado', async () => {
    useAuthMock.mockReturnValue({ user: null, userProfile: null, loading: false });
    render(
      <DashboardLayout>
        <div>contenido</div>
      </DashboardLayout>,
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/auth/login');
    });
  });

  it('redirige a registro si onboarding no esta completo', async () => {
    useAuthMock.mockReturnValue({
      user: { email: 'demo@dentflow.ai', id: 'u1' },
      userProfile: { fullName: 'Demo', role: 'dentista', onboardingStep: 50 },
      loading: false,
    });

    render(
      <DashboardLayout>
        <div>contenido</div>
      </DashboardLayout>,
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/auth/register');
    });
  });

  it('renderiza contenido si el onboarding esta completo', async () => {
    useAuthMock.mockReturnValue({
      user: { email: 'demo@dentflow.ai', id: 'u1' },
      userProfile: { fullName: 'Demo', role: 'dentista', onboardingStep: 100 },
      loading: false,
    });

    render(
      <DashboardLayout>
        <div>contenido protegido</div>
      </DashboardLayout>,
    );

    expect(await screen.findByText('contenido protegido')).toBeInTheDocument();
    expect(screen.getByText('Casos')).toBeInTheDocument();
  });
});
