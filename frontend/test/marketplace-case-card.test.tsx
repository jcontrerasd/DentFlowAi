import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard',
}));

vi.mock('@/lib/db/actions/cases', () => ({
  getSignedUrlAction: vi.fn().mockResolvedValue(null),
  getUploadUrlAction: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db/actions/files', () => ({
  updateFileThumbnailAction: vi.fn().mockResolvedValue(undefined),
}));

import MarketplaceCaseCard from '@/components/cases/MarketplaceCaseCard';

const baseCase = {
  id: 'case-1',
  internalName: 'Caso prueba',
  restorationType: 'Puente',
  urgency: 'normal',
  patientIdAnon: 'PAC-1',
  material: 'Zirconio',
  createdAt: new Date().toISOString(),
  files: [],
};

describe('MarketplaceCaseCard (técnico)', () => {
  it('muestra estado del caso En Revisión cuando la invitación está confirmada y el caso en revisión', () => {
    useAuthMock.mockReturnValue({
      userProfile: { id: 'tech-1', role: 'tecnico' },
    });

    render(
      <MarketplaceCaseCard
        c={{
          ...baseCase,
          status: 'enRevision',
          assignedTechnicianId: 'tech-1',
        }}
        myBid={{
          status: 'confirmed',
          isWinner: true,
          invitedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }}
        onSelectCase={() => {}}
        isDentist={false}
      />,
    );

    expect(screen.getByText('En Revisión')).toBeInTheDocument();
    expect(screen.queryByText('Oferta Aceptada')).not.toBeInTheDocument();
  });

  it('muestra DF antes de PAC en metadatos del caso', () => {
    useAuthMock.mockReturnValue({
      userProfile: { id: 'dent-1', role: 'dentista' },
    });

    render(
      <MarketplaceCaseCard
        c={{
          ...baseCase,
          caseNumber: 'DF-0001',
          patientIdAnon: 'PAC-99',
          status: 'borrador',
        }}
        onSelectCase={() => {}}
        isDentist
      />,
    );

    expect(screen.getByText(/DF-0001 · PAC: PAC-99/)).toBeInTheDocument();
  });

  it('muestra cotización en evaluación con invitación quoted y caso en evaluación', () => {
    useAuthMock.mockReturnValue({
      userProfile: { id: 'tech-1', role: 'tecnico' },
    });

    render(
      <MarketplaceCaseCard
        c={{
          ...baseCase,
          status: 'enEvaluacion',
          assignedTechnicianId: null,
        }}
        myBid={{
          status: 'quoted',
          isWinner: false,
          invitedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }}
        onSelectCase={() => {}}
        isDentist={false}
      />,
    );

    expect(screen.getByText(/Cotización enviada · en evaluación/i)).toBeInTheDocument();
  });

  it('muestra globo de no leídos junto al botón del Centro de control', () => {
    useAuthMock.mockReturnValue({
      userProfile: { id: 'tech-1', role: 'tecnico' },
    });

    render(
      <MarketplaceCaseCard
        c={{ ...baseCase, status: 'enEjecucion', assignedTechnicianId: 'tech-1' }}
        myBid={{
          status: 'confirmed',
          isWinner: true,
          invitedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }}
        onSelectCase={() => {}}
        isDentist={false}
        hubUchUnread={3}
      />,
    );

    const hubButton = screen.getByRole('button', { name: /centro de control: 3 mensajes sin leer/i });
    expect(hubButton).toBeInTheDocument();
    expect(screen.getByTitle(/3 mensajes sin leer en el Centro de control/i)).toHaveTextContent('3');
  });
});
