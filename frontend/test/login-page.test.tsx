import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pushMock, replaceMock, signInMock, searchParamsGetMock, checkUserStatusActionMock, useSessionMock } =
  vi.hoisted(() => ({
    pushMock: vi.fn(),
    replaceMock: vi.fn(),
    signInMock: vi.fn(),
    searchParamsGetMock: vi.fn(),
    checkUserStatusActionMock: vi.fn(),
    useSessionMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  useSession: () => useSessionMock(),
}));

vi.mock('@/lib/db/actions/user', () => ({
  checkUserStatusAction: (...args: unknown[]) => checkUserStatusActionMock(...args),
}));

import LoginPage from '@/app/auth/login/page';

describe('LoginPage', () => {
  beforeEach(() => {
    searchParamsGetMock.mockImplementation((key: string) => (key === 'email' ? 'demo%40dentflow.ai' : null));
    useSessionMock.mockReturnValue({ data: null, status: 'unauthenticated' });
    checkUserStatusActionMock.mockReset();
    signInMock.mockReset();
    replaceMock.mockReset();
    checkUserStatusActionMock.mockResolvedValue({ exists: true, active: true });
  });

  it('precarga el email desde query string', async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('demo@dentflow.ai')).toBeInTheDocument();
    });
  });

  it('inicia sesion enviando credenciales a signIn', async () => {
    signInMock.mockResolvedValueOnce({ error: null });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    await waitFor(() => {
      expect(checkUserStatusActionMock).toHaveBeenCalledWith('demo@dentflow.ai');
      expect(signInMock).toHaveBeenCalledWith(
        'credentials',
        expect.objectContaining({ email: 'demo@dentflow.ai', password: 'Secret123', redirect: false }),
      );
    });
  });

  it('redirige al dashboard si la sesion ya esta autenticada', async () => {
    useSessionMock.mockReturnValue({
      data: { user: { email: 'demo@dentflow.ai' } },
      status: 'authenticated',
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('muestra mensaje de credenciales invalidas', async () => {
    signInMock.mockResolvedValueOnce({ error: 'CredentialsSignin' });
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'bad-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    await waitFor(() => {
      expect(
        screen.getByText('La contraseña ingresada es incorrecta. Por favor, inténtalo de nuevo.'),
      ).toBeInTheDocument();
    });
  });

  it('bloquea acceso cuando el correo no esta registrado', async () => {
    checkUserStatusActionMock.mockResolvedValueOnce({ exists: false, active: false });
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    await waitFor(() => {
      expect(screen.getByText('Este correo electrónico no está registrado en nuestro sistema.')).toBeInTheDocument();
    });
  });
});