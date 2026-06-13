import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/actions/proposal', () => ({
  acceptProposalAction: vi.fn(),
  rejectInvitationOfferAction: vi.fn(),
}));
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));
vi.mock('@/components/ui/FocusTrap', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ComparativeOffersPanel from '@/components/cases/ComparativeOffersPanel';

const futureDeadline = Date.now() + 5 * 60 * 1000;

describe('ComparativeOffersPanel (Fase 4.4)', () => {
  it('muestra precio total y plazo (cotización flat, sin desglose)', () => {
    render(
      <ComparativeOffersPanel
        caseId="c-flat-2"
        offers={[
          {
            invitationId: 'inv-1',
            rank: 1,
            totalPriceCLP: 230000,
            quotedDays: 6,
            techNotes: null,
            respondedAt: new Date('2026-05-14T10:00:00Z'),
          },
        ]}
        proposalDeadlineMs={futureDeadline}
        onUpdated={async () => {}}
      />,
    );

    expect(screen.queryByText(/^Diseño$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Fabricación$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/230/)).toBeInTheDocument();
    expect(screen.getByText(/6 días hábiles/i)).toBeInTheDocument();
  });

  it('omite desglose cuando la oferta es flat (sin campos integrales)', () => {
    render(
      <ComparativeOffersPanel
        caseId="c-flat-1"
        offers={[
          {
            invitationId: 'inv-1',
            rank: 1,
            totalPriceCLP: 120000,
            quotedDays: 3,
            techNotes: null,
            respondedAt: new Date('2026-05-14T10:00:00Z'),
          },
        ]}
        proposalDeadlineMs={futureDeadline}
        onUpdated={async () => {}}
      />,
    );

    expect(screen.queryByText(/^Diseño$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Fabricación$/i)).not.toBeInTheDocument();
  });

  it('modal Contratar oferta: cotización flat con costo total y plazo', () => {
    render(
      <ComparativeOffersPanel
        caseId="c-flat-modal"
        offers={[
          {
            invitationId: 'inv-1',
            rank: 1,
            totalPriceCLP: 230_000,
            quotedDays: 6,
            techNotes: null,
            respondedAt: new Date('2026-05-14T10:00:00Z'),
          },
        ]}
        proposalDeadlineMs={futureDeadline}
        onUpdated={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /elegir oferta/i }));
    const modalQuote = screen.getByTestId('uch-accept-offer-quote');
    expect(within(modalQuote).queryByText(/^Diseño$/i)).not.toBeInTheDocument();
    expect(within(modalQuote).queryByText(/^Fabricación$/i)).not.toBeInTheDocument();
    expect(within(modalQuote).getByText(/\$230\.000/)).toBeInTheDocument();
    expect(within(modalQuote).getByText(/6 días hábiles/i)).toBeInTheDocument();
  });

  it('modal Contratar oferta: oferta flat (CAD o CAM) muestra costo total y plazo', () => {
    render(
      <ComparativeOffersPanel
        caseId="c-flat-modal"
        offers={[
          {
            invitationId: 'inv-1',
            rank: 1,
            totalPriceCLP: 120_000,
            quotedDays: 3,
            techNotes: null,
            respondedAt: new Date('2026-05-14T10:00:00Z'),
          },
        ]}
        proposalDeadlineMs={futureDeadline}
        onUpdated={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /elegir oferta/i }));
    const modalQuote = screen.getByTestId('uch-accept-offer-quote');
    expect(within(modalQuote).queryByText(/^Diseño$/i)).not.toBeInTheDocument();
    expect(within(modalQuote).getByTestId('uch-quote-breakdown')).toBeInTheDocument();
    expect(within(modalQuote).getByText(/\$120\.000/)).toBeInTheDocument();
    expect(within(modalQuote).getByText(/3 días hábiles/i)).toBeInTheDocument();
  });
});
