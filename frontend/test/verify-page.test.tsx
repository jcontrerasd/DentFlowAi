import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pushMock, searchParamsGetMock, confirmEmailVerificationActionMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  searchParamsGetMock: vi.fn(),
  confirmEmailVerificationActionMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({ get: searchParamsGetMock }),
}));

vi.mock('@/lib/db/actions/auth', () => ({
  confirmEmailVerificationAction: (...a: unknown[]) => confirmEmailVerificationActionMock(...a),
  requestEmailVerificationAction: vi.fn(async () => ({ success: true })),
}));

import VerifyPage from '@/app/auth/verify/page';

describe('VerifyPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pushMock.mockReset();
    searchParamsGetMock.mockImplementation((key: string) => (key === 'token' ? 'test-token-123' : null));
    confirmEmailVerificationActionMock.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra verificacion exitosa y luego redirige al dashboard', async () => {
    render(<VerifyPage />);

    expect(screen.getByText('Verificando...')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(confirmEmailVerificationActionMock).toHaveBeenCalledWith('test-token-123');
    expect(screen.getByText('Acceso Habilitado.')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });
});
