import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusBadge from '@/components/ui/StatusBadge';

describe('StatusBadge', () => {
  it('muestra etiqueta conocida para estado mapeado', () => {
    render(<StatusBadge status="enEvaluacion" />);
    expect(screen.getByText('En Evaluación')).toBeInTheDocument();
  });

  it('muestra etiqueta legible para aceptada pendiente de inicio', () => {
    render(<StatusBadge status="aceptadaPendienteInicio" />);
    expect(screen.getByText('Esperando inicio')).toBeInTheDocument();
  });

  it('usa el valor crudo como etiqueta si no hay mapeo', () => {
    render(<StatusBadge status="estadoDesconocido" />);
    expect(screen.getByText('estadoDesconocido')).toBeInTheDocument();
  });

  it('mapea certificadoCalidad a "Certificado"', () => {
    render(<StatusBadge status="certificadoCalidad" />);
    expect(screen.getByText('Certificado')).toBeInTheDocument();
  });

  it('enmascara la etapa de Calidad como En Ejecución para el dentista', () => {
    render(<StatusBadge status="certificadoCalidad" viewerRole="dentista" />);
    expect(screen.getByText('En Ejecución')).toBeInTheDocument();
    expect(screen.queryByText('Certificado')).not.toBeInTheDocument();
  });

  it('no enmascara la etapa de Calidad para calidad/técnico/admin', () => {
    render(<StatusBadge status="certificadoCalidad" viewerRole="calidad" />);
    expect(screen.getByText('Certificado')).toBeInTheDocument();
  });
});
