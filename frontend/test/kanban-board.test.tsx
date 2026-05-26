/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import KanbanBoard from '@/components/cases/KanbanBoard';

describe('KanbanBoard', () => {
  const winnerCase = {
    id: 'c1',
    caseNumber: 'DF-001',
    internalName: 'Caso A',
    status: 'enEjecucion',
    assignedTechnicianId: 'tech-1',
    restorationType: 'Corona',
    material: 'Zirconia',
    createdAt: new Date().toISOString(),
    viewerInvitation: { status: 'confirmed', technicianId: 'tech-1' },
  };

  const loserCase = {
    id: 'c2',
    caseNumber: 'DF-002',
    internalName: 'Caso B',
    status: 'aceptadaPendienteInicio',
    assignedTechnicianId: 'other',
    restorationType: 'Corona',
    material: 'Zirconia',
    createdAt: new Date().toISOString(),
    viewerInvitation: { status: 'quoted', technicianId: 'tech-1' },
  };

  it('técnico solo muestra casos en producción (ganador)', () => {
    render(<KanbanBoard cases={[winnerCase, loserCase]} role="tecnico" userId="tech-1" />);
    expect(screen.getByText('Caso A')).toBeTruthy();
    expect(screen.queryByText('Caso B')).toBeNull();
  });

  it('dentista muestra todos los casos cargados', () => {
    render(<KanbanBoard cases={[winnerCase, loserCase]} role="dentista" userId="d1" />);
    expect(screen.getByText('Caso A')).toBeTruthy();
    expect(screen.getByText('Caso B')).toBeTruthy();
  });
});
