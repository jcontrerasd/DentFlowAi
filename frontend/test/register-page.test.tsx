import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  routerPushMock,
  useAuthMock,
  createUserActionMock,
  updateUserActionMock,
  getUserProfileDirectMock,
  createOrganizationActionMock,
  updateOrganizationDetailsActionMock,
  signInMock,
  useSessionMock,
} = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  useAuthMock: vi.fn(),
  createUserActionMock: vi.fn(),
  updateUserActionMock: vi.fn(),
  getUserProfileDirectMock: vi.fn(),
  createOrganizationActionMock: vi.fn(),
  updateOrganizationDetailsActionMock: vi.fn(),
  signInMock: vi.fn(),
  useSessionMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
  signIn: (...args: unknown[]) => signInMock(...args),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/components/profile/SkillMatrixForm', () => ({
  default: () => null,
}));

vi.mock('@/lib/db/actions/user', () => ({
  createUserAction: (...a: unknown[]) => createUserActionMock(...a),
  updateUserAction: (...a: unknown[]) => updateUserActionMock(...a),
  getUserProfileDirect: (...a: unknown[]) => getUserProfileDirectMock(...a),
}));

vi.mock('@/lib/db/actions/organization', () => ({
  createOrganizationAction: (...a: unknown[]) => createOrganizationActionMock(...a),
  updateOrganizationDetailsAction: (...a: unknown[]) => updateOrganizationDetailsActionMock(...a),
}));

import RegisterPage from '@/app/auth/register/page';

describe('RegisterPage', () => {
  beforeEach(() => {
    useSessionMock.mockReturnValue({ data: null, status: 'unauthenticated' });
    useAuthMock.mockReturnValue({ userProfile: null, refreshProfile: vi.fn().mockResolvedValue(undefined) });
    signInMock.mockResolvedValue({ ok: true, error: null });
    createUserActionMock.mockReset();
    updateUserActionMock.mockReset();
    getUserProfileDirectMock.mockReset();
    createOrganizationActionMock.mockReset();
    updateOrganizationDetailsActionMock.mockReset();
  });

  it('bloquea contrasena corta antes de llamar a crear usuario', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByPlaceholderText('ejemplo@dentflow.ai'), { target: { value: 'demo@dentflow.ai' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrarme/i }));

    await waitFor(() => {
      expect(screen.getByText('La contraseña debe tener al menos 6 caracteres.')).toBeInTheDocument();
      expect(createUserActionMock).not.toHaveBeenCalled();
    });
  });

  it('crea cuenta con server action y pasa al paso de rol', async () => {
    createUserActionMock.mockResolvedValueOnce({
      success: true,
      data: { id: 'uid-1', organizationId: 'org-1' },
    });

    render(<RegisterPage />);

    fireEvent.change(screen.getByPlaceholderText('ejemplo@dentflow.ai'), { target: { value: 'demo@dentflow.ai' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrarme/i }));

    await waitFor(() => {
      expect(createUserActionMock).toHaveBeenCalled();
      expect(signInMock).toHaveBeenCalledWith(
        'credentials',
        expect.objectContaining({ email: 'demo@dentflow.ai', password: 'Secret123', redirect: false }),
      );
      expect(screen.getByText('Configura tu Rol.')).toBeInTheDocument();
    });
  });
});
