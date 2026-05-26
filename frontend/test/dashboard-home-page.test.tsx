import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initEmptyMetrics,
  DENTIST_DASHBOARD_METRICS,
  TECH_DASHBOARD_METRICS,
} from '@/lib/dashboard/dashboardMetricsConfig';
import { getTechKpiFichaPresentation } from '@/lib/cases/caseFichaStatusPresentation';

const {
  useAuthMock,
  listCasesByOrganizationMock,
  getDashboardMetricsActionMock,
  getMyInvitationsActionMock,
  getMySkillsActionMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  listCasesByOrganizationMock: vi.fn(),
  getDashboardMetricsActionMock: vi.fn(),
  getMyInvitationsActionMock: vi.fn(),
  getMySkillsActionMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/lib/db/actions/cases', () => ({
  listCasesByOrganization: (...a: unknown[]) => listCasesByOrganizationMock(...a),
  getSignedUrlAction: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db/actions/dashboard', () => ({
  getDashboardMetricsAction: (...a: unknown[]) => getDashboardMetricsActionMock(...a),
}));

vi.mock('@/lib/db/actions/hubRead', () => ({
  getHubUnreadCountsForCasesAction: vi.fn().mockResolvedValue({ byCaseId: {} }),
}));

vi.mock('@/lib/db/actions/skills', () => ({
  getMySkillsAction: (...a: unknown[]) => getMySkillsActionMock(...a),
  toggleAvailabilityAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/db/actions/invitations', () => ({
  getMyInvitationsAction: (...a: unknown[]) => getMyInvitationsActionMock(...a),
}));

vi.mock('@/components/cases/STLThumbnail', () => ({ default: () => null }));

vi.mock('@/components/cases/MarketplaceCaseCard', () => ({
  default: () => <div data-testid="marketplace-card">card</div>,
}));

vi.mock('@/components/cases/AdvancedFiltersRow', () => ({
  __esModule: true,
  default: () => <div data-testid="advanced-filters" />,
}));

import DashboardHome from '@/app/dashboard/page';

describe('DashboardHome', () => {
  beforeEach(() => {
    listCasesByOrganizationMock.mockReset();
    getDashboardMetricsActionMock.mockReset();
    getMyInvitationsActionMock.mockReset();
    getMySkillsActionMock.mockReset();
    listCasesByOrganizationMock.mockResolvedValue({
      cases: [],
      total: 0,
      page: 1,
      pageSize: 10,
      hasMore: false,
    });
    getDashboardMetricsActionMock.mockResolvedValue({
      role: 'dentista',
      metrics: initEmptyMetrics(DENTIST_DASHBOARD_METRICS),
      totalCases: 0,
      serverNowMs: Date.now(),
    });
    getMyInvitationsActionMock.mockResolvedValue([]);
    getMySkillsActionMock.mockResolvedValue([]);
  });

  it('muestra dashboard y CTA crear caso para dentista', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'd1' },
      userProfile: { id: 'd1', role: 'dentista', organization: { id: 'org-1' } },
    });

    render(<DashboardHome />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    expect(listCasesByOrganizationMock).toHaveBeenCalledWith(
      1,
      10,
      false,
      true,
      expect.objectContaining({ sortOrder: 'recent' }),
    );
    expect(getDashboardMetricsActionMock).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Crear Nuevo Caso/i })).toHaveAttribute(
      'href',
      '/dashboard/cases/new',
    );
    expect(screen.getByText('Casos Recientes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver Todo/i })).toHaveAttribute(
      'href',
      '/dashboard/cases',
    );
  });

  it('técnico: título Casos Recientes y métricas', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 't1' },
      userProfile: { id: 't1', role: 'tecnico', organization: { id: 'org-t' } },
    });
    getDashboardMetricsActionMock.mockResolvedValue({
      role: 'tecnico',
      metrics: { invitacionPendiente: 2, total: 2 } as any,
      totalCases: 2,
      serverNowMs: Date.now(),
    });

    render(<DashboardHome />);

    await waitFor(() => {
      expect(screen.getByText('Casos Recientes')).toBeInTheDocument();
    });

    expect(listCasesByOrganizationMock).toHaveBeenCalledWith(
      1,
      10,
      false,
      true,
      expect.objectContaining({ sortOrder: 'recent' }),
    );
    expect(getMySkillsActionMock).toHaveBeenCalled();
    expect(getMyInvitationsActionMock).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Ver Todo/i })).toHaveAttribute(
      'href',
      '/dashboard/cases',
    );
  });

  it('técnico: click KPI Esperando inicio filtra carrusel con techKpi', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 't1' },
      userProfile: { id: 't1', role: 'tecnico', organization: { id: 'org-t' } },
    });
    const techMetrics = initEmptyMetrics(TECH_DASHBOARD_METRICS);
    techMetrics.aceptadaPendienteInicio = 2;
    getDashboardMetricsActionMock.mockResolvedValue({
      role: 'tecnico',
      metrics: techMetrics,
      totalCases: 2,
      serverNowMs: Date.now(),
    });

    render(<DashboardHome />);

    const kpiLabel = getTechKpiFichaPresentation('aceptadaPendienteInicio').label;
    await waitFor(() => {
      expect(screen.getByText(kpiLabel)).toBeInTheDocument();
    });

    listCasesByOrganizationMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(kpiLabel, 'i') }));

    await waitFor(() => {
      expect(listCasesByOrganizationMock).toHaveBeenCalledWith(
        1,
        10,
        false,
        true,
        expect.objectContaining({
          techKpiStatuses: ['aceptadaPendienteInicio'],
          caseStatuses: [],
        }),
      );
    });

    expect(screen.getByRole('link', { name: /Ver Todo/i })).toHaveAttribute(
      'href',
      expect.stringContaining('techKpi=aceptadaPendienteInicio'),
    );
  });

  it('dentista: click KPI Propuesta Lista filtra carrusel con caseStatuses', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 'd1' },
      userProfile: { id: 'd1', role: 'dentista', organization: { id: 'org-1' } },
    });
    const dentistMetrics = initEmptyMetrics(DENTIST_DASHBOARD_METRICS);
    dentistMetrics.propuestaLista = 3;
    getDashboardMetricsActionMock.mockResolvedValue({
      role: 'dentista',
      metrics: dentistMetrics,
      totalCases: 3,
      serverNowMs: Date.now(),
    });

    render(<DashboardHome />);

    await waitFor(() => {
      expect(screen.getByText('Propuesta Lista')).toBeInTheDocument();
    });

    listCasesByOrganizationMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /Propuesta Lista/i }));

    await waitFor(() => {
      expect(listCasesByOrganizationMock).toHaveBeenCalledWith(
        1,
        10,
        false,
        true,
        expect.objectContaining({
          caseStatuses: ['propuestaLista'],
          techKpiStatuses: [],
        }),
      );
    });
  });

  it('muestra aviso de perfil incompleto para técnico sin habilidades', async () => {
    useAuthMock.mockReturnValue({
      user: { id: 't1' },
      userProfile: { id: 't1', role: 'tecnico', organization: { id: 'org-t' } },
    });

    render(<DashboardHome />);

    await waitFor(() => {
      expect(screen.getByText(/Tu perfil técnico está incompleto/i)).toBeInTheDocument();
    });
  });
});
