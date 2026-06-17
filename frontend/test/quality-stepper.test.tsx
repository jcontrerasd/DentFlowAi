import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CaseWorkflowStepper from '@/components/cases/CaseWorkflowStepper';

describe('CaseWorkflowStepper — paso de Calidad por rol', () => {
  it('muestra el paso "Revisión calidad" al técnico', () => {
    render(<CaseWorkflowStepper currentStatus="enRevisionCalidad" viewerRole="tecnico" />);
    expect(screen.getByText(/Revisión calidad/i)).toBeInTheDocument();
  });

  it('muestra el paso "Revisión calidad" al revisor de Calidad', () => {
    render(<CaseWorkflowStepper currentStatus="enRevisionCalidad" viewerRole="calidad" />);
    expect(screen.getByText(/Revisión calidad/i)).toBeInTheDocument();
  });

  it('OCULTA el paso de Calidad al dentista (anonimato de la etapa)', () => {
    render(<CaseWorkflowStepper currentStatus="enRevisionCalidad" viewerRole="dentista" />);
    expect(screen.queryByText(/Revisión calidad/i)).not.toBeInTheDocument();
    // Para el dentista, enRevisionCalidad se presenta como "En ejecución".
    expect(screen.getByText(/En ejecución/i)).toBeInTheDocument();
  });
});
