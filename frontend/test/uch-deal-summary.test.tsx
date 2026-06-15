import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UchDealSummary from '@/components/cases/uch/UchDealSummary';

describe('UchDealSummary', () => {
  it('técnico vista rechazada: muestra cotización propia y mensaje no aplica en entrega', () => {
    render(
      <UchDealSummary
        caseStatus="enRevision"
        actingAsDentista={false}
        actingAsTecnico
        currentUserId="u-loser"
        techOfferRejectedView
        clinicalCase={{
          assignedTechnicianId: 'u-winner',
          workDeadline: '2028-05-12T12:00:00.000Z',
          proposedPrice: 999_000,
        }}
        invitation={{ compensation: 150_000, deadlineDays: 5 }}
      />,
    );
    expect(screen.getByText(/\$150\.000/)).toBeInTheDocument();
    expect(screen.getByText(/5 días hábiles/i)).toBeInTheDocument();
    expect(screen.queryByText(/total pactado/i)).not.toBeInTheDocument();
  });

  it('técnico en evaluación sin asignar: cabecera mínima (fecha envío sin prefijo) → Precio → Plazo', () => {
    render(
      <UchDealSummary
        caseStatus="enEvaluacion"
        actingAsDentista={false}
        actingAsTecnico
        currentUserId="u-tech"
        clinicalCase={{
          assignedTechnicianId: null,
          proposedPrice: null,
          workDeadline: null,
        }}
        invitation={{
          compensation: 125_000,
          deadlineDays: 7,
          status: 'pending',
          respondedAt: '2026-05-12T15:05:00.000Z',

        }}
      />,
    );
    expect(screen.getByTestId('uch-deal-summary')).toBeInTheDocument();
    expect(screen.getByText(/12 de mayo 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/\$125\.000/)).toBeInTheDocument();
    expect(screen.getByText(/7 días hábiles/i)).toBeInTheDocument();
    expect(screen.queryByText(/Enviada:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Tu oferta$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^En evaluación$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Comparativa$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nota de prueba/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compara las ofertas/i)).not.toBeInTheDocument();
  });

  it('técnico en propuesta lista sin asignar: misma cabecera mínima sin badge ni frase de comparativa', () => {
    render(
      <UchDealSummary
        caseStatus="propuestaLista"
        actingAsDentista={false}
        actingAsTecnico
        currentUserId="u-tech"
        clinicalCase={{
          assignedTechnicianId: null,
          proposedPrice: null,
          workDeadline: null,
        }}
        invitation={{
          compensation: 45_555,
          deadlineDays: 2,
          status: 'pending',
          respondedAt: '2026-05-12T15:03:00.000Z',
        }}
      />,
    );
    expect(screen.getByTestId('uch-deal-summary')).toBeInTheDocument();
    expect(screen.getByText(/12 de mayo 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/\$45\.555/)).toBeInTheDocument();
    expect(screen.getByText(/2 días hábiles/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Comparativa$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compara las ofertas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enviada:/i)).not.toBeInTheDocument();
  });

  it('técnico en propuesta lista: cabecera con total de la oferta', () => {
    render(
      <UchDealSummary
        caseStatus="propuestaLista"
        actingAsDentista={false}
        actingAsTecnico
        currentUserId="u-tech"
        clinicalCase={{ assignedTechnicianId: null, proposedPrice: null, workDeadline: null }}
        invitation={{
          compensation: 130_000,
          deadlineDays: 9,
          status: 'pending',
          respondedAt: '2026-05-12T12:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByText(/\$130\.000/)).toBeInTheDocument();
  });

  it('dentista en propuesta lista: cabecera sin comparativo (vive en el hilo)', () => {
    render(
      <UchDealSummary
        caseStatus="propuestaLista"
        actingAsDentista
        actingAsTecnico={false}
        clinicalCase={{ assignedTechnicianId: null, proposedPrice: null, workDeadline: null }}
      />,
    );
    expect(screen.getByText(/comparativo de ofertas está en el hilo/i)).toBeInTheDocument();
    expect(screen.queryByText(/Oferta #1/i)).not.toBeInTheDocument();
  });

  it('dentista tras aceptar oferta: cabecera muestra total pactado', () => {
    render(
      <UchDealSummary
        caseStatus="aceptadaPendienteInicio"
        actingAsDentista
        actingAsTecnico={false}
        clinicalCase={{
          assignedTechnicianId: 'u-tech',
          proposedPrice: 185_000,
          proposedDeliveryDays: 10,
          workDeadline: null,
        }}
      />,
    );
    expect(screen.getByText(/^Total$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$185\.000/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Oferta #/i)).not.toBeInTheDocument();
  });

  it('técnico asignado en aceptadaPendienteInicio sin precio pactado: sigue viendo cotización propia compacta', () => {
    render(
      <UchDealSummary
        caseStatus="aceptadaPendienteInicio"
        actingAsDentista={false}
        actingAsTecnico
        currentUserId="u-tech"
        clinicalCase={{
          assignedTechnicianId: 'u-tech',
          proposedPrice: null,
          workDeadline: null,
        }}
        invitation={{
          compensation: 88_000,
          deadlineDays: 5,
          status: 'accepted',
          respondedAt: '2026-05-10T10:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByTestId('uch-deal-summary')).toBeInTheDocument();
    expect(screen.getByText(/10 de mayo 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/\$88\.000/)).toBeInTheDocument();
    expect(screen.getByText(/5 días hábiles/i)).toBeInTheDocument();
    expect(screen.queryByText(/La oferta y la fecha de entrega se mostrarán aquí/i)).not.toBeInTheDocument();
  });
});
