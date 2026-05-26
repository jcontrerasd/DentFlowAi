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
});
