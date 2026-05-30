import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pushMock, useAuthMock, listCasesByOrganizationMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useAuthMock: vi.fn(),
  listCasesByOrganizationMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/cases',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/lib/db/actions/cases', () => ({
  listCasesByOrganization: (...a: unknown[]) => listCasesByOrganizationMock(...a),
  getSignedUrlAction: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db/actions/invitations', () => ({
  getMyInvitationsAction: vi.fn().mockResolvedValue([]),
}));

import CasesPage from '@/app/dashboard/cases/page';

describe('Bloque C - Role Guards (casos)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    listCasesByOrganizationMock.mockReset();
    listCasesByOrganizationMock.mockResolvedValue({ cases: [], total: 0, page: 1, pageSize: 50, hasMore: false });
  });

  it('carga casos para dentista y consulta listCasesByOrganization', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'dent-1' },
      userProfile: { id: 'dent-1', role: 'dentista', organization: { id: 'org-dent' } },
      loading: false,
    });

    render(<CasesPage />);

    await waitFor(() => {
      expect(pushMock).not.toHaveBeenCalledWith('/dashboard');
      expect(listCasesByOrganizationMock).toHaveBeenCalled();
      const call = listCasesByOrganizationMock.mock.calls[0];
      expect(call.slice(0, 4)).toEqual([1, 24, false, true]);
    });
  });

  it('carga casos para técnico y consulta la misma lista', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'tech-1' },
      userProfile: { id: 'tech-1', role: 'tecnico', organization: { id: 'org-tech' } },
      loading: false,
    });

    render(<CasesPage />);

    await waitFor(() => {
      expect(listCasesByOrganizationMock).toHaveBeenCalled();
      const call = listCasesByOrganizationMock.mock.calls[0];
      expect(call.slice(0, 4)).toEqual([1, 24, false, true]);
    });
  });
});
