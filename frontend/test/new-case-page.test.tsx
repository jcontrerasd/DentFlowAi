import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useAuthMock, showSuccessMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  showSuccessMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showSuccess: showSuccessMock }),
}));

vi.mock('@/lib/db/actions/cases', () => ({
  createClinicalCaseAction: vi.fn(),
  getUploadUrlAction: vi.fn(),
}));

vi.mock('@/lib/db/actions/files', () => ({
  registerFileAction: vi.fn(),
}));

vi.mock('@/components/cases/CaseCreationWizard', () => ({
  CaseCreationWizard: () => <div data-testid="case-wizard-stub" />,
}));

import NewCasePage from '@/app/dashboard/cases/new/page';

describe('NewCasePage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: 'doc-1' },
      userProfile: { id: 'doc-1', organization: { id: 'org-1' } },
    });
  });

  it('renderiza título y wizard', () => {
    render(<NewCasePage />);
    expect(screen.getByRole('heading', { name: /Nuevo Caso/i })).toBeInTheDocument();
    expect(screen.getByTestId('case-wizard-stub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Volver al Panel/i })).toBeInTheDocument();
  });
});
