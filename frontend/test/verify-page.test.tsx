import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import VerifyPage from '@/app/auth/verify/page';

describe('VerifyPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra verificacion exitosa y luego redirige al dashboard', async () => {
    render(<VerifyPage />);

    expect(screen.getByText('Verificando...')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(screen.getByText('Acceso Habilitado.')).toBeInTheDocument();
    expect(screen.getByText('Tu identidad ha sido verificada exitosamente.')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });
});
