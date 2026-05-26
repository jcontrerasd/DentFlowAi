import { describe, expect, it, vi, beforeEach } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

import InvitationsRedirectPage from '@/app/dashboard/invitations/page';

describe('InvitationsRedirectPage', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirige a /dashboard/cases sin preset', async () => {
    await expect(
      InvitationsRedirectPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('REDIRECT:/dashboard/cases');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/cases');
  });

  it('preserva preset en la URL de casos', async () => {
    await expect(
      InvitationsRedirectPage({
        searchParams: Promise.resolve({ preset: 'nuevas' }),
      }),
    ).rejects.toThrow('REDIRECT:/dashboard/cases?preset=nuevas');
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/cases?preset=nuevas');
  });
});
