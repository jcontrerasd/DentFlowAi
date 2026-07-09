import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useSessionMock, getUserProfileDirectMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  getUserProfileDirectMock: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
}));

vi.mock('@/lib/db/actions/user', () => ({
  getUserProfileDirect: (...a: unknown[]) => getUserProfileDirectMock(...a),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  startSimulationAction: vi.fn().mockResolvedValue({ success: true }),
  stopSimulationAction: vi.fn().mockResolvedValue({ success: true }),
}));

import { AuthProvider, useAuth } from '@/context/AuthContext';

const PROFILE = { id: 'u1', email: 'demo@dentflow.ai', fullName: 'Demo', role: 'dentista' as const, onboardingStep: 100, phone: null, specialty: null, registrationNumber: null };

let refreshProfileRef: (() => Promise<void>) | null = null;

function Consumer() {
  const { userProfile, refreshProfile } = useAuth();
  refreshProfileRef = refreshProfile;
  return <div data-testid="perfil">{userProfile?.fullName ?? 'sin-perfil'}</div>;
}

describe('AuthContext — deduplicación de fetch de perfil', () => {
  beforeEach(() => {
    getUserProfileDirectMock.mockReset();
    refreshProfileRef = null;
    localStorage.clear();
    useSessionMock.mockReturnValue({
      data: { user: { id: 'u1', role: 'dentista' } },
      status: 'authenticated',
    });
  });

  it('llamadas concurrentes a refreshProfile durante el fetch inicial → una sola query', async () => {
    let resolveProfile!: (p: typeof PROFILE) => void;
    getUserProfileDirectMock.mockImplementation(
      () => new Promise((r) => { resolveProfile = r; }),
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    // Fetch inicial in-flight; dos refreshProfile concurrentes se dedupan sobre él.
    expect(getUserProfileDirectMock).toHaveBeenCalledTimes(1);
    let r1!: Promise<void>;
    let r2!: Promise<void>;
    act(() => {
      r1 = refreshProfileRef!();
      r2 = refreshProfileRef!();
    });
    expect(getUserProfileDirectMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveProfile(PROFILE);
      await Promise.all([r1, r2]);
    });

    expect(screen.getByTestId('perfil')).toHaveTextContent('Demo');
    expect(getUserProfileDirectMock).toHaveBeenCalledTimes(1);
  });

  it('tras resolverse, refreshProfile vuelve a la DB (no cachea resultados)', async () => {
    getUserProfileDirectMock.mockResolvedValue(PROFILE);

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('perfil')).toHaveTextContent('Demo');
    });
    expect(getUserProfileDirectMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await refreshProfileRef!();
    });
    expect(getUserProfileDirectMock).toHaveBeenCalledTimes(2);
  });

  it('StrictMode: el double-effect de montaje dispara una sola query', async () => {
    getUserProfileDirectMock.mockResolvedValue(PROFILE);

    render(
      <StrictMode>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('perfil')).toHaveTextContent('Demo');
    });
    expect(getUserProfileDirectMock).toHaveBeenCalledTimes(1);
  });
});
