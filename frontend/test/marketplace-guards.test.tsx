import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replaceMock, useAuthMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

import MarketplacePage from '@/app/dashboard/marketplace/page';

describe('Bloque E - Marketplace (redirect)', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useAuthMock.mockReturnValue({
      user: { id: 'u1' },
      userProfile: { id: 'u1', role: 'dentista' },
      loading: false,
    });
  });

  it('redirige siempre al dashboard (ruta legacy)', async () => {
    render(<MarketplacePage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/dashboard');
    });
  });
});
