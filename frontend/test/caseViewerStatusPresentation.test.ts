import { describe, expect, it } from 'vitest';
import {
  isTechKanbanProductionCase,
  resolveTechnicianViewerStripe,
} from '@/lib/cases/caseViewerStatusPresentation';

describe('caseViewerStatusPresentation', () => {
  it('perdedor en aceptadaPendienteInicio muestra oferta no seleccionada', () => {
    const model = resolveTechnicianViewerStripe({
      caseStatus: 'aceptadaPendienteInicio',
      assignedTechnicianId: 'other-tech',
      technicianUserId: 'me',
      invitationStatus: 'quoted',
    });
    expect(model.kpiId).toBe('ofertaNoSeleccionada');
    expect(model.label).toMatch(/no seleccionada/i);
  });

  it('ganador en aceptadaPendienteInicio muestra esperando inicio', () => {
    const model = resolveTechnicianViewerStripe({
      caseStatus: 'aceptadaPendienteInicio',
      assignedTechnicianId: 'me',
      technicianUserId: 'me',
      invitationStatus: 'confirmed',
    });
    expect(model.kpiId).toBe('aceptadaPendienteInicio');
    expect(model.label).toMatch(/esperando inicio/i);
  });

  it('isTechKanbanProductionCase excluye cotización enviada', () => {
    expect(
      isTechKanbanProductionCase({
        caseStatus: 'propuestaLista',
        assignedTechnicianId: null,
        technicianUserId: 'me',
        invitationStatus: 'quoted',
      }),
    ).toBe(false);
  });

  it('isTechKanbanProductionCase incluye ganador en ejecución', () => {
    expect(
      isTechKanbanProductionCase({
        caseStatus: 'enEjecucion',
        assignedTechnicianId: 'me',
        technicianUserId: 'me',
        invitationStatus: 'confirmed',
      }),
    ).toBe(true);
  });
});
