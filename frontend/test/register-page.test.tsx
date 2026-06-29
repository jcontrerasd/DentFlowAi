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
  getEmailVerificationEnabledActionMock,
  checkUserStatusActionMock,
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
  getEmailVerificationEnabledActionMock: vi.fn(),
  checkUserStatusActionMock: vi.fn(),
}));

vi.mock('next/navigation', () => {
  // Objeto estable a propósito (igual que el useRouter real de Next.js, memoizado entre
  // renders) — un mock que devuelve un objeto nuevo en cada llamada rompe cualquier efecto
  // que tenga `router` en su dependency array: cada render generaría una referencia distinta,
  // re-disparando el efecto indefinidamente.
  const routerMock = { push: routerPushMock };
  return { useRouter: () => routerMock };
});

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
  getGoogleOAuthEnabledAction: async () => ({ enabled: false }),
  getEmailVerificationEnabledAction: (...a: unknown[]) => getEmailVerificationEnabledActionMock(...a),
  checkUserStatusAction: (...a: unknown[]) => checkUserStatusActionMock(...a),
}));

vi.mock('@/lib/db/actions/organization', () => ({
  createOrganizationAction: (...a: unknown[]) => createOrganizationActionMock(...a),
  updateOrganizationDetailsAction: (...a: unknown[]) => updateOrganizationDetailsActionMock(...a),
}));

vi.mock('@/lib/db/actions/auth', () => ({
  requestEmailVerificationAction: async () => ({ success: true }),
  getVerificationExpiryAction: async () => ({ expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() }),
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
    getEmailVerificationEnabledActionMock.mockReset();
    getEmailVerificationEnabledActionMock.mockResolvedValue({ enabled: false });
    checkUserStatusActionMock.mockReset();
    checkUserStatusActionMock.mockResolvedValue({ exists: true, active: true, emailVerified: true });
  });

  it('bloquea contrasena corta antes de llamar a crear usuario', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByPlaceholderText('ejemplo@dentflow.ai'), { target: { value: 'demo@dentflow.ai' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: '123' } });
    // El input se re-renderiza con un nodo DOM nuevo en cada cambio de estado del wizard — hay
    // que volver a consultarlo justo antes de usarlo, no cachear la referencia anterior.
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], { target: { value: '123' } });
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
    // El input se re-renderiza con un nodo DOM nuevo en cada cambio de estado del wizard — hay
    // que volver a consultarlo justo antes de cada fireEvent, no cachear la referencia anterior
    // (de lo contrario el segundo fireEvent.change apunta a un nodo ya desmontado y su onChange
    // nunca llega a dispararse).
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: 'Secret123' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], { target: { value: 'Secret123' } });
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

  it('pestaña nueva o refresh con sesión ya autenticada y correo sin verificar: entra directo a esperar, no salta a Rol', async () => {
    // Reproduce el bug original: el usuario deja la pestaña esperando verificación, y un F5 (o
    // una pestaña nueva, indistinguible para React — ambas pierden el estado y solo quedan con
    // la sesión vía cookie) saltaba directo a "Configura tu Rol." porque el efecto de sync de
    // sesión nunca chequeaba emailVerified. Debe volver a la pantalla de espera, no a Rol.
    // (Se descartó mostrar un aviso de "pestaña duplicada" en su lugar — rompía el caso normal
    // de simplemente refrescar, que es indistinguible de una pestaña nueva a nivel de React.)
    // checkUserStatusAction (el polling) también reporta sin verificar — consistente con
    // getUserProfileDirect — para no disparar el ciclo de detección de verificación real.
    getEmailVerificationEnabledActionMock.mockResolvedValue({ enabled: true });
    checkUserStatusActionMock.mockResolvedValue({ exists: true, active: true, emailVerified: false });
    useSessionMock.mockReturnValue({
      data: { user: { id: 'uid-2', email: 'sin-verificar@dentflow.ai', name: '' } },
      status: 'authenticated',
    });
    getUserProfileDirectMock.mockResolvedValue({
      onboardingStep: 0,
      role: 'dentista',
      email: 'sin-verificar@dentflow.ai',
      fullName: null,
      emailVerified: null,
      organization: null,
    });

    render(<RegisterPage />);

    await waitFor(() => {
      expect(screen.getByText('Confirma tu correo.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Configura tu Rol.')).not.toBeInTheDocument();
  });

  it('muestra aviso no bloqueante cuando otra pestaña late en el mismo BroadcastChannel', async () => {
    // Simula una segunda pestaña real: otra instancia de BroadcastChannel con el mismo nombre
    // emitiendo el latido de presencia. No debe bloquear ni cambiar el flujo, solo mostrar el
    // aviso informativo.
    createUserActionMock.mockResolvedValueOnce({ success: true, data: { id: 'uid-3', organizationId: 'org-3' } });
    getEmailVerificationEnabledActionMock.mockResolvedValue({ enabled: true });

    render(<RegisterPage />);
    // Espera a que el efecto de mount resuelva getEmailVerificationEnabledAction (async) antes
    // de enviar el form — si no, handleCreateAccount vería el state default (false).
    await waitFor(() => expect(getEmailVerificationEnabledActionMock).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('ejemplo@dentflow.ai'), { target: { value: 'otra-pestana@dentflow.ai' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: 'Secret123' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrarme/i }));

    await waitFor(() => {
      expect(screen.getByText('Confirma tu correo.')).toBeInTheDocument();
    });
    expect(screen.queryByText(/también está abierta en otra pestaña/i)).not.toBeInTheDocument();

    const otherTabChannel = new BroadcastChannel('dfa-register-verify-wait');
    otherTabChannel.postMessage({ email: 'otra-pestana@dentflow.ai' });

    await waitFor(() => {
      expect(screen.getByText(/también está abierta en otra pestaña/i)).toBeInTheDocument();
    });
    otherTabChannel.close();
  });

  it('si otra pestaña reclama la verificación primero, esta se detiene en vez de avanzar también', async () => {
    // Reproduce el problema reportado: las dos pestañas que esperaban entraban juntas a "Rol"
    // al confirmarse el correo. Ahora, si llega un reclamo ('verified-claim') de otra pestaña
    // por el mismo canal, esta debe quedarse en "Correo confirmado" en vez de avanzar también.
    createUserActionMock.mockResolvedValueOnce({ success: true, data: { id: 'uid-4', organizationId: 'org-4' } });
    getEmailVerificationEnabledActionMock.mockResolvedValue({ enabled: true });

    render(<RegisterPage />);
    await waitFor(() => expect(getEmailVerificationEnabledActionMock).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText('ejemplo@dentflow.ai'), { target: { value: 'reclamo@dentflow.ai' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: 'Secret123' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], { target: { value: 'Secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrarme/i }));

    await waitFor(() => {
      expect(screen.getByText('Confirma tu correo.')).toBeInTheDocument();
    });

    const otherTabChannel = new BroadcastChannel('dfa-register-verify-wait');
    otherTabChannel.postMessage({ type: 'verified-claim', email: 'reclamo@dentflow.ai' });

    await waitFor(() => {
      expect(screen.getByText('Correo confirmado.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Configura tu Rol.')).not.toBeInTheDocument();
    expect(screen.queryByText('Confirma tu correo.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar aquí' }));
    await waitFor(() => {
      expect(screen.getByText('Configura tu Rol.')).toBeInTheDocument();
    });
    otherTabChannel.close();
  });
});
