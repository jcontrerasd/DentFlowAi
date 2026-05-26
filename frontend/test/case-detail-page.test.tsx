import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  backMock,
  useAuthMock,
  getCaseDetailsMock,
  getSignedUrlActionMock,
  getCaseEventsActionMock,
  getMyInvitationForCaseActionMock,
  checkProposalExpiryActionMock,
  viewerMock,
} = vi.hoisted(() => ({
  backMock: vi.fn(),
  useAuthMock: vi.fn(),
  getCaseDetailsMock: vi.fn(),
  getSignedUrlActionMock: vi.fn(),
  getCaseEventsActionMock: vi.fn(),
  getMyInvitationForCaseActionMock: vi.fn(),
  checkProposalExpiryActionMock: vi.fn(),
  viewerMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useRouter: () => ({ back: backMock, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: vi.fn(() => null) }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock('@/lib/db/actions/cases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/actions/cases')>();
  return {
    ...actual,
    getCaseDetails: (...a: unknown[]) => getCaseDetailsMock(...a),
    getSignedUrlAction: (...a: unknown[]) => getSignedUrlActionMock(...a),
    getCaseEventsAction: (...a: unknown[]) => getCaseEventsActionMock(...a),
  };
});

vi.mock('@/lib/db/actions/invitations', () => ({
  getMyInvitationForCaseAction: (...a: unknown[]) => getMyInvitationForCaseActionMock(...a),
}));

vi.mock('@/lib/db/actions/proposal', () => ({
  checkProposalExpiryAction: (...a: unknown[]) => checkProposalExpiryActionMock(...a),
  startWorkAction: vi.fn(),
  acceptProposalAction: vi.fn(),
  rejectProposalAction: vi.fn(),
  expireDentistComparativeWindowAction: vi.fn(),
}));

vi.mock('@/components/DentalViewer3D', () => ({
  default: (props: { models: Array<{ subType: string }>; annotations: Array<{ id: string }> }) => {
    viewerMock(props);
    return (
      <div>
        <span>viewer-models:{props.models.length}</span>
        <span>viewer-annotations:{props.annotations.length}</span>
        {props.models.map((model) => (
          <span key={model.subType}>{model.subType}</span>
        ))}
      </div>
    );
  },
}));

vi.mock('@/components/cases/TeethSelector', () => ({
  TeethSelector: ({ selectedTeeth }: { selectedTeeth?: number[] }) => <div>teeth:{selectedTeeth?.join(',') ?? ''}</div>,
}));

vi.mock('@/components/cases/STLThumbnail', () => ({ default: () => null }));
vi.mock('@/components/cases/UnifiedCaseHub', () => ({ default: () => null }));
vi.mock('@/components/cases/CaseWorkflowStepper', () => ({ default: () => null }));
vi.mock('@/components/cases/ComparativeOffersPanel', () => ({ default: () => null }));

import CaseDetailPage from '@/app/dashboard/cases/[id]/page';

describe('CaseDetailPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: 'tech-1' },
      userProfile: {
        id: 'tech-1',
        role: 'tecnico',
        fullName: 'Tecnico Demo',
        organization: { id: 'org-1', name: 'Clinica Demo', type: 'clinica' },
      },
    });

    getSignedUrlActionMock.mockResolvedValue('https://signed.example/model.stl');
    getCaseEventsActionMock.mockResolvedValue({ events: [], hasMoreOlder: false });
    getMyInvitationForCaseActionMock.mockResolvedValue({ data: null });
    checkProposalExpiryActionMock.mockResolvedValue({ success: true });

    getCaseDetailsMock.mockResolvedValue({
      id: 'case-1',
      internalName: 'Caso Integracion',
      patientIdAnon: 'PAT-001',
      urgency: 'normal',
      status: 'publicado',
      createdAt: '2026-04-14T10:00:00.000Z',
      teeth: [11, 12],
      restorationType: 'Corona',
      material: 'Zirconia',
      shade: 'A2',
      notesOclusal: 'Sin interferencias',
      notesEsthetic: 'Borde natural',
      doctorNotes: 'Nota de revisión en doctor_notes',
      specialInstructions: 'Instrucciones originales del caso',
      labNotes: '',
      organizationId: 'org-1',
      files: [
        {
          id: 'f1',
          filename: 'upper.stl',
          category: 'scan',
          subType: 'superior',
          gcsPath: 'organizations/org-1/cases/case-1/upper.stl',
          size: 100,
          createdAt: '2026-04-14',
        },
        {
          id: 'f2',
          filename: 'lower.obj',
          category: 'design',
          subType: 'inferior',
          gcsPath: 'organizations/org-1/cases/case-1/lower.obj',
          size: 100,
          createdAt: '2026-04-14',
        },
      ],
      annotations: [
        {
          id: 'a1',
          text: 'Revisar cúspide',
          coordinates: { x: 1, y: 2, z: 3 },
          isResolved: false,
          createdAt: '2026-04-14',
          user: { id: 'tech-1', fullName: 'Tecnico Demo' },
        },
      ],
    });
  });

  it('carga el caso, resuelve archivos y renderiza el visor con modelos', async () => {
    render(<CaseDetailPage />);

    expect(await screen.findByText('Caso Integracion')).toBeInTheDocument();

    expect(await screen.findByText('Instrucciones originales del caso')).toBeInTheDocument();
    expect(screen.queryByText('Nota de revisión en doctor_notes')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('viewer-models:2')).toBeInTheDocument();
      expect(screen.getByText('viewer-annotations:1')).toBeInTheDocument();
      expect(screen.getByText('superior')).toBeInTheDocument();
      expect(screen.getByText('inferior')).toBeInTheDocument();
    });

    expect(getSignedUrlActionMock).toHaveBeenCalled();
  });

  it('carga eventos del hub para el caso', async () => {
    render(<CaseDetailPage />);

    await waitFor(() => {
      expect(getCaseEventsActionMock).toHaveBeenCalledWith('case-1');
    });
  });
});
