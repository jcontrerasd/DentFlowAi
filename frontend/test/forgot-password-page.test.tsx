import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { searchParamsGetMock } = vi.hoisted(() => ({
  searchParamsGetMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

import ForgotPasswordPage from '@/app/auth/forgot-password/page';

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    searchParamsGetMock.mockImplementation((key: string) => (key === 'email' ? 'recover%40dentflow.ai' : null));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('precarga el email desde query string', async () => {
    render(<ForgotPasswordPage />);

    expect(await screen.findByDisplayValue('recover@dentflow.ai')).toBeInTheDocument();
  });

  it('muestra confirmacion despues de enviar el formulario', async () => {
    render(<ForgotPasswordPage />);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Instrucciones/i }));

    await vi.advanceTimersByTimeAsync(1100);

    await waitFor(() => {
      expect(screen.getByText('Solicitud Recibida')).toBeInTheDocument();
    });
  });
});
