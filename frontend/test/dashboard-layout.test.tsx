import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pushMock, useAuthMock, getMyInvitationsActionMock, getMyHubUnreadTotalActionMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useAuthMock: vi.fn(),
  getMyInvitationsActionMock: vi.fn(),
  getMyHubUnreadTotalActionMock: vi.fn(),
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
  getMyInvitationsAction: (...a: unknown[]) => getMyInvitationsActionMock(...a),
}));

vi.mock('@/lib/db/actions/hubRead', () => ({
  getMyHubUnreadTotalAction: (...a: unknown[]) => getMyHubUnreadTotalActionMock(...a),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  validateOwnSessionAction: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock('@/components/availability/AvailabilityBadge', () => ({
  default: () => null,
}));

vi.mock('@/components/availability/AvailabilityContext', () => ({
  AvailabilityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/availability/RolloutBanner', () => ({
  default: () => null,
}));

vi.mock('@/components/admin/ImpersonationSelector', () => ({
  default: () => null,
}));

vi.mock('@/components/theme/ThemeToggleButton', () => ({
  default: () => null,
}));

vi.mock('@/lib/db/actions/user', () => ({
  getEmailVerificationEnabledAction: vi.fn().mockResolvedValue({ enabled: false }),
  getTabCloseLogoutEnabledAction: vi.fn().mockResolvedValue({ enabled: false, heartbeatSeconds: 30 }),
}));

import DashboardLayout from '@/app/dashboard/layout';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    pushMock.mockReset();
    getMyInvitationsActionMock.mockReset();
    getMyHubUnreadTotalActionMock.mockReset();
    getMyInvitationsActionMock.mockResolvedValue([]);
    getMyHubUnreadTotalActionMock.mockResolvedValue({ total: 0 });
  });

  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
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

  it('el polling de invitaciones no corre en background y refresca al volver a visible', async () => {
    vi.useFakeTimers();
    useAuthMock.mockReturnValue({
      user: { email: 'tec@dentflow.ai', id: 't1' },
      userProfile: { fullName: 'Tec', role: 'tecnico', onboardingStep: 100 },
      loading: false,
    });
    setVisibility('hidden');

    render(
      <DashboardLayout>
        <div>contenido</div>
      </DashboardLayout>,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(getMyInvitationsActionMock).toHaveBeenCalledTimes(1); // carga inicial

    // 3 ticks del intervalo con la pestaña oculta → ninguna llamada nueva.
    await vi.advanceTimersByTimeAsync(180_000);
    expect(getMyInvitationsActionMock).toHaveBeenCalledTimes(1);

    // Volver a visible → refresh inmediato sin esperar el próximo tick.
    setVisibility('visible');
    fireEvent(document, new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(getMyInvitationsActionMock).toHaveBeenCalledTimes(2);
  });

  it('la campana hub no pollea en background y colapsa visible+focus en una llamada', async () => {
    vi.useFakeTimers();
    useAuthMock.mockReturnValue({
      user: { email: 'demo@dentflow.ai', id: 'u1' },
      userProfile: { fullName: 'Demo', role: 'dentista', onboardingStep: 100 },
      loading: false,
    });
    setVisibility('hidden');

    render(
      <DashboardLayout>
        <div>contenido</div>
      </DashboardLayout>,
    );
    // Deja pasar la carga inicial (loadHub directo + debounce de 300ms por pathname).
    await vi.advanceTimersByTimeAsync(400);
    const initialCalls = getMyHubUnreadTotalActionMock.mock.calls.length;

    // 3 ticks del intervalo con la pestaña oculta → ninguna llamada nueva.
    await vi.advanceTimersByTimeAsync(180_000);
    expect(getMyHubUnreadTotalActionMock).toHaveBeenCalledTimes(initialCalls);

    // Volver a la pestaña: visibilitychange + focus casi simultáneos.
    setVisibility('visible');
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event('focus'));

    // Antes de que venza el debounce no hay llamada nueva…
    await vi.advanceTimersByTimeAsync(299);
    expect(getMyHubUnreadTotalActionMock).toHaveBeenCalledTimes(initialCalls);

    // …y al vencer, ambas señales colapsan en exactamente una.
    await vi.advanceTimersByTimeAsync(10);
    expect(getMyHubUnreadTotalActionMock).toHaveBeenCalledTimes(initialCalls + 1);
  });
});
