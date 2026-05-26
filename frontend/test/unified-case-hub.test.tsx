import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import UnifiedCaseHub from '@/components/cases/UnifiedCaseHub';
import UchEventBubble from '@/components/cases/uch/UchEventBubble';
import type { InvitationItem } from '@/lib/db/actions/invitations';
import { ToastProvider } from '@/context/ToastContext';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) =>
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />,
}));

vi.mock('@/lib/db/actions/cases', () => ({
  getUploadUrlAction: vi.fn().mockResolvedValue('https://example/upload'),
  getSignedUrlAction: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db/actions/fauchard', () => ({
  submitQuoteAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/db/actions/proposal', () => ({
  startWorkAction: vi.fn().mockResolvedValue({ success: true }),
}));

const revisionEvent = {
  id: 'ev-1',
  type: 'tecnico' as const,
  action: 'REVISION_ENVIADA',
  content: 'v1',
  payload: { files: ['path/model.stl'] },
  stateChange: null,
  createdAt: new Date().toISOString(),
  user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
};

const techClinicalCase = {
  status: 'enEjecucion',
  organizationId: 'org-1',
  doctorId: 'u-dent',
  assignedTechnicianId: 'u-tech',
  workStartedAt: new Date().toISOString(),
  caseNumber: 'T-002',
};

function renderHub() {
  return render(
    <ToastProvider>
      <UnifiedCaseHub
        caseId="case-1"
        initialEvents={[]}
        currentUser={{ id: 'u-dent', fullName: 'Dra. Prueba' }}
        actingAsDentista
        actingAsTecnico={false}
        onClose={() => {}}
        caseStatus="borrador"
        clinicalCase={{ status: 'borrador', organizationId: 'org-1', doctorId: 'u-dent', caseNumber: 'T-001' }}
      />
    </ToastProvider>,
  );
}

function activityScroll() {
  return screen.getByTestId('uch-timeline-scroll');
}

function renderDentistHubWithEvents(initialEvents: Parameters<typeof UnifiedCaseHub>[0]['initialEvents']) {
  return render(
    <ToastProvider>
      <UnifiedCaseHub
        caseId="case-1"
        initialEvents={initialEvents}
        currentUser={{ id: 'u-dent', fullName: 'Dra. Prueba' }}
        actingAsDentista
        actingAsTecnico={false}
        onClose={() => {}}
        caseStatus="enEjecucion"
        clinicalCase={{
          status: 'enEjecucion',
          organizationId: 'org-1',
          doctorId: 'u-dent',
          assignedTechnicianId: 'u-tech',
          caseNumber: 'D-ORD',
        }}
      />
    </ToastProvider>,
  );
}

function renderTechHub(overrides?: {
  onActionTriggered?: (action: string, data?: unknown) => Promise<unknown>;
  initialEvents?: Parameters<typeof UnifiedCaseHub>[0]['initialEvents'];
}) {
  return render(
    <ToastProvider>
      <UnifiedCaseHub
        caseId="case-1"
        initialEvents={overrides?.initialEvents ?? [revisionEvent]}
        currentUser={{ id: 'u-tech', fullName: 'Téc. Prueba' }}
        actingAsDentista={false}
        actingAsTecnico
        onClose={() => {}}
        caseStatus="enEjecucion"
        clinicalCase={techClinicalCase}
        onActionTriggered={overrides?.onActionTriggered}
      />
    </ToastProvider>,
  );
}

describe('UnifiedCaseHub', () => {
  it('no muestra compositor libre de mensajes al pie (flujo guiado por Fauchard)', () => {
    renderHub();
    expect(screen.queryByPlaceholderText(/Mensaje al hilo/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar mensaje/i })).not.toBeInTheDocument();
  });

  it('vista única: región Actividad del caso sin pestañas Resumen/Actividad', () => {
    renderHub();
    expect(screen.queryByRole('tablist', { name: /secciones del centro de control/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^resumen$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /actividad del caso/i })).toBeInTheDocument();
    expect(screen.getByText(/^fase$/i)).toBeInTheDocument();
  });

  it('dentista en evaluación: aviso compacto sin tarjeta «Más sobre el caso»; eventos ordenados en el hilo', () => {
    const evOld = {
      id: 'ev-ctx-old',
      type: 'tecnico' as const,
      action: 'COMENTARIO_TECNICO',
      content: 'Antiguo',
      payload: {},
      stateChange: {},
      createdAt: '2020-01-05T10:00:00.000Z',
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    const evNew = {
      id: 'ev-ctx-new',
      type: 'tecnico' as const,
      action: 'COMENTARIO_TECNICO',
      content: 'Reciente',
      payload: {},
      stateChange: {},
      createdAt: '2025-01-10T15:00:00.000Z',
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[evOld, evNew]}
          currentUser={{ id: 'u-dent', fullName: 'Dra. Prueba' }}
          actingAsDentista
          actingAsTecnico={false}
          onClose={() => {}}
          caseStatus="enEvaluacion"
          clinicalCase={{
            status: 'enEvaluacion',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            caseNumber: 'CTX-1',
            publishedAt: '2025-01-01T10:00:00.000Z',
          }}
        />
      </ToastProvider>,
    );
    expect(screen.queryByTestId('uch-context-card')).not.toBeInTheDocument();
    expect(screen.queryByText(/Más sobre el caso/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Estamos analizando tu caso/i)).toBeInTheDocument();
    const panel = activityScroll();
    const ordered = Array.from(panel.querySelectorAll('[data-testid^="uch-activity-event-"]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(ordered).toEqual(['uch-activity-event-ev-ctx-new', 'uch-activity-event-ev-ctx-old']);
  });

  it('técnico en evaluación con oferta enviada: resumen en encabezado y fila Fauchard en el hilo', async () => {
    const quotedInvitation: InvitationItem = {
      id: 'inv-q-1',
      caseId: 'case-1',
      caseNumber: 'E-1',
      internalName: null,
      restorationType: 'CORONA UNITARIA',
      material: null,
      urgency: 'alta',
      caseComplexity: 'BASICO',
      serviceType: null,
      status: 'quoted',
      invitedAt: new Date(),
      expiresAt: null,
      quotedPrice: 99_999,
      quotedDays: 15,
      techNotes: 'super perdedor',
      respondedAt: new Date('2026-05-12T15:05:00.000Z'),
      isWinner: false,
      caseStatus: 'enEvaluacion',
      teeth: [],
      archivedByCurrentUser: false,
    };
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[]}
          currentUser={{ id: 'u-tech', fullName: 'Téc. Prueba' }}
          actingAsDentista={false}
          actingAsTecnico
          onClose={() => {}}
          caseStatus="enEvaluacion"
          clinicalCase={{
            status: 'enEvaluacion',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            assignedTechnicianId: null,
            caseNumber: 'E-1',
          }}
          myInvitation={quotedInvitation}
        />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('uch-case-actions-inline')).toBeInTheDocument();
    });
    expect(screen.getByTestId('uch-deal-summary')).toBeInTheDocument();
    const summary = screen.getByTestId('uch-deal-summary');
    expect(within(summary).getByText(/\$99\.999/)).toBeInTheDocument();
    expect(screen.getByTestId('uch-withdraw-quote-open')).toBeInTheDocument();
  });

  it('técnico en propuesta lista con oferta enviada: resumen en encabezado y fila Fauchard en el hilo', async () => {
    const quotedInvitation: InvitationItem = {
      id: 'inv-q-pl',
      caseId: 'case-1',
      caseNumber: 'PL-1',
      internalName: null,
      restorationType: 'CORONA UNITARIA',
      material: null,
      urgency: 'normal',
      caseComplexity: 'BASICO',
      serviceType: null,
      status: 'quoted',
      invitedAt: new Date(),
      expiresAt: null,
      quotedPrice: 45_555,
      quotedDays: 2,
      techNotes: null,
      respondedAt: new Date('2026-05-12T15:03:00.000Z'),
      isWinner: false,
      caseStatus: 'propuestaLista',
      teeth: [],
      archivedByCurrentUser: false,
    };
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[]}
          currentUser={{ id: 'u-tech', fullName: 'Téc. Prueba' }}
          actingAsDentista={false}
          actingAsTecnico
          onClose={() => {}}
          caseStatus="propuestaLista"
          clinicalCase={{
            status: 'propuestaLista',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            assignedTechnicianId: null,
            caseNumber: 'PL-1',
          }}
          myInvitation={quotedInvitation}
        />
      </ToastProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('uch-case-actions-inline')).toBeInTheDocument();
    });
    expect(screen.getByTestId('uch-deal-summary')).toBeInTheDocument();
    const summary = screen.getByTestId('uch-deal-summary');
    expect(within(summary).getByText(/\$45\.555/)).toBeInTheDocument();
    expect(screen.getByTestId('uch-withdraw-quote-open')).toBeInTheDocument();
  });

  it('el hilo ordena eventos del más reciente al más antiguo', () => {
    const evOld = {
      id: 'ev-old',
      type: 'tecnico' as const,
      action: 'COMENTARIO_TECNICO',
      content: 'Mensaje antiguo',
      payload: {},
      stateChange: {},
      createdAt: '2020-01-05T10:00:00.000Z',
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    const evMid = {
      id: 'ev-mid',
      type: 'tecnico' as const,
      action: 'TRABAJO_INICIADO',
      content: 'Medio',
      payload: {},
      stateChange: {},
      createdAt: '2024-06-01T12:00:00.000Z',
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    const evNew = {
      id: 'ev-new',
      type: 'tecnico' as const,
      action: 'REVISION_ENVIADA',
      content: 'Reciente',
      payload: {},
      stateChange: {},
      createdAt: '2025-01-10T15:00:00.000Z',
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    renderDentistHubWithEvents([evOld, evNew, evMid]);
    const panel = activityScroll();
    const rows = within(panel).getAllByTestId(/^uch-activity-event-/);
    expect(rows.map((el) => el.getAttribute('data-testid'))).toEqual([
      'uch-activity-event-ev-new',
      'uch-activity-event-ev-mid',
      'uch-activity-event-ev-old',
    ]);
    for (const row of rows) {
      expect(row.querySelector('.rounded-2xl')).toBeTruthy();
    }
  });

  it('filtro Diseño mantiene orden descendente dentro de la fase', () => {
    const evPropuesta = {
      id: 'ev-prop',
      type: 'tecnico' as const,
      action: 'COTIZACION_RECIBIDA',
      content: 'Oferta',
      payload: {},
      stateChange: {},
      createdAt: '2025-02-01T10:00:00.000Z',
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    const evDisenoViejo = {
      id: 'ev-dis-old',
      type: 'tecnico' as const,
      action: 'TRABAJO_INICIADO',
      content: 'Inicio trabajo',
      payload: {},
      stateChange: {},
      createdAt: '2024-01-01T08:00:00.000Z',
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    const evDisenoNuevo = {
      id: 'ev-dis-new',
      type: 'tecnico' as const,
      action: 'REVISION_ENVIADA',
      content: 'Entrega',
      payload: {},
      stateChange: {},
      createdAt: '2025-01-15T12:00:00.000Z',
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    renderDentistHubWithEvents([evDisenoViejo, evPropuesta, evDisenoNuevo]);
    fireEvent.click(screen.getByRole('button', { name: /^diseño$/i }));
    const panel = activityScroll();
    const rows = within(panel).getAllByTestId(/^uch-activity-event-/);
    expect(rows.map((el) => el.getAttribute('data-testid'))).toEqual([
      'uch-activity-event-ev-dis-new',
      'uch-activity-event-ev-dis-old',
    ]);
  });

  it('desempata mismo createdAt por id (estable)', () => {
    const same = '2025-03-01T10:00:00.000Z';
    const evA = {
      id: 'ev-tie-a',
      type: 'tecnico' as const,
      action: 'COMENTARIO_TECNICO',
      content: 'A',
      payload: {},
      stateChange: {},
      createdAt: same,
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    const evZ = {
      id: 'ev-tie-z',
      type: 'tecnico' as const,
      action: 'COMENTARIO_TECNICO',
      content: 'Z',
      payload: {},
      stateChange: {},
      createdAt: same,
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    renderDentistHubWithEvents([evA, evZ]);
    const panel = activityScroll();
    const rows = within(panel).getAllByTestId(/^uch-activity-event-/);
    expect(rows.map((el) => el.getAttribute('data-testid'))).toEqual([
      'uch-activity-event-ev-tie-z',
      'uch-activity-event-ev-tie-a',
    ]);
  });

  it('técnico asignado ve el panel de entrega de diseño en el hilo (región, no modal centrado)', () => {
    renderTechHub();
    expect(screen.getByRole('region', { name: /entrega de diseño/i })).toBeInTheDocument();
  });

  it('no existe el botón agregador «Acciones del caso»', () => {
    renderTechHub();
    expect(screen.queryByRole('button', { name: /acciones del caso/i })).not.toBeInTheDocument();
  });

  it('colapsa el panel de entrega con Cerrar', () => {
    renderTechHub();
    const region = screen.getByRole('region', { name: /entrega de diseño/i });
    fireEvent.click(within(region).getByRole('button', { name: /^cerrar$/i }));
    expect(screen.queryByRole('region', { name: /entrega de diseño/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('uch-delivery-collapsed')).toBeInTheDocument();
  });

  it('colapsa el panel de entrega con Cancelar', () => {
    renderTechHub();
    const region = screen.getByRole('region', { name: /entrega de diseño/i });
    fireEvent.click(within(region).getByRole('button', { name: /^cancelar$/i }));
    expect(screen.queryByRole('region', { name: /entrega de diseño/i })).not.toBeInTheDocument();
  });

  it('en el panel de entrega, enviar permanece deshabilitado solo con notas (faltan archivos)', () => {
    renderTechHub();
    const region = screen.getByRole('region', { name: /entrega de diseño/i });
    const submit = within(region).getByRole('button', { name: /enviar para revisión/i });
    expect(submit).toBeDisabled();
    const notes = region.querySelector('#uch-delivery-notes') as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: 'Mensaje de prueba' } });
    expect(notes).toHaveValue('Mensaje de prueba');
    expect(submit).toBeDisabled();
  });

  it('muestra comentario del técnico en COMENTARIO_TECNICO', () => {
    const commentEv = {
      id: 'ev-com',
      type: 'tecnico' as const,
      action: 'COMENTARIO_TECNICO',
      content: 'Alineación lista para revisión.',
      payload: { visibleTo: 'ambos' },
      stateChange: {},
      createdAt: new Date().toISOString(),
      user: { id: 'u-tech', fullName: 'Téc. Prueba', role: 'tecnico' },
    };
    renderTechHub({ initialEvents: [revisionEvent, commentEv] });
    const panel = activityScroll();
    expect(within(panel).getByText(/Comentario del técnico/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Alineación lista para revisión/i)).toBeInTheDocument();
  });

  it('muestra detalle de ajuste desde payload comentarioDelSolicitante si hiciera falta', () => {
    const adjEvent = {
      id: 'ev-adj2',
      userId: 'u-dent',
      type: 'sistema' as const,
      action: 'REVISION_SOLICITADA',
      content: '',
      payload: {
        visibleTo: 'tecnico',
        presentationAuthor: 'fauchard',
        comentarioDelSolicitante: 'Subcontorno mesial 0.2 mm',
      },
      stateChange: {},
      createdAt: new Date().toISOString(),
      user: { id: '__fauchard__', fullName: 'Fauchard', role: 'sistema' },
    };
    renderTechHub({ initialEvents: [revisionEvent, adjEvent] });
    const panel = activityScroll();
    expect(within(panel).getByText(/Detalle del ajuste/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Subcontorno mesial 0.2 mm/i)).toBeInTheDocument();
  });

  it('técnico asignado ve la solicitud de ajustes (userId real + presentación Fauchard)', () => {
    const adjEvent = {
      id: 'ev-adj',
      userId: 'u-dent',
      type: 'sistema' as const,
      action: 'REVISION_SOLICITADA',
      content: 'Reducir contorno distal',
      payload: { visibleTo: 'tecnico', presentationAuthor: 'fauchard' },
      stateChange: {},
      createdAt: new Date().toISOString(),
      user: { id: '__fauchard__', fullName: 'Fauchard', role: 'sistema' },
    };
    renderTechHub({ initialEvents: [revisionEvent, adjEvent] });
    const panel = activityScroll();
    expect(within(panel).getByText(/Ajustes solicitados/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Reducir contorno distal/i)).toBeInTheDocument();
  });

  it('REVISION_ENVIADA: técnico asignado descarga ZIP desde la burbuja (sin tarjeta Más sobre el caso)', () => {
    const entrega = {
      ...revisionEvent,
      payload: { files: ['organizations/org-1/cases/case-1/deliveries/model.stl'], deliveryVersion: 1 },
    };
    renderTechHub({
      initialEvents: [entrega],
    });
    const panel = activityScroll();
    expect(within(panel).getByRole('button', { name: /descargar v1 \(zip\)/i })).toBeInTheDocument();
    expect(screen.queryByTestId('uch-context-card')).not.toBeInTheDocument();
    expect(within(panel).queryByText(/Más sobre el caso/i)).not.toBeInTheDocument();
  });

  it('dentista ve en el hilo su solicitud de ajustes (REVISION_SOLICITADA con visibleTo ambos)', () => {
    const solicitud = {
      id: 'ev-rev-sol-dent',
      userId: 'u-dent',
      type: 'sistema' as const,
      action: 'REVISION_SOLICITADA',
      content: 'Reducir vértice incisal',
      payload: {
        reason: 'Reducir vértice incisal',
        visibleTo: 'ambos',
        presentationAuthor: 'fauchard',
      },
      stateChange: {},
      createdAt: new Date().toISOString(),
      user: { id: 'u-dent', fullName: 'Dra. Prueba', role: 'dentista' },
    };
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[revisionEvent, solicitud]}
          currentUser={{ id: 'u-dent', fullName: 'Dra. Prueba' }}
          actingAsDentista
          actingAsTecnico={false}
          onClose={() => {}}
          caseStatus="cambiosEnProceso"
          clinicalCase={{
            status: 'cambiosEnProceso',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            assignedTechnicianId: 'u-tech',
            caseNumber: 'D-001',
          }}
        />
      </ToastProvider>,
    );
    const panel = activityScroll();
    expect(within(panel).getByText('Ajustes solicitados')).toBeInTheDocument();
    expect(within(panel).getByText(/Reducir vértice incisal/i)).toBeInTheDocument();
  });

  it('dentista en revisión: no lista «Versiones anteriores» en el hub; el panel de revisión ofrece ZIP de la entrega pendiente', () => {
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[]}
          currentUser={{ id: 'u-dent', fullName: 'Dra. Prueba' }}
          actingAsDentista
          actingAsTecnico={false}
          onClose={() => {}}
          caseStatus="enRevision"
          clinicalCase={{
            status: 'enRevision',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            caseNumber: 'D-001',
            deliveries: [
              { id: 'd1', version: 1, files: ['organizations/org-1/cases/case-1/a.stl'], status: 'rejected' },
              { id: 'd2', version: 2, files: ['organizations/org-1/cases/case-1/b.stl'], status: 'pending' },
            ],
          }}
        />
      </ToastProvider>,
    );
    expect(screen.queryByText(/Versiones anteriores/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('uch-dentist-review-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /v2 zip/i })).toBeInTheDocument();
  });

  it('muestra banner de instrucciones vía Fauchard en cambiosEnProceso para el técnico asignado', () => {
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[revisionEvent]}
          currentUser={{ id: 'u-tech', fullName: 'Téc. Prueba' }}
          actingAsDentista={false}
          actingAsTecnico
          onClose={() => {}}
          caseStatus="cambiosEnProceso"
          clinicalCase={{
            ...techClinicalCase,
            status: 'cambiosEnProceso',
            doctorNotes: 'Unificar contactos proximales.',
          }}
        />
      </ToastProvider>,
    );
    expect(screen.getByText(/Indicaciones del solicitante/i)).toBeInTheDocument();
    expect(screen.getByText(/Unificar contactos proximales/i)).toBeInTheDocument();
  });

  it('técnico en cambiosEnProceso: ajustes desde entrega rechazada e instrucciones desde specialInstructions', () => {
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[revisionEvent]}
          currentUser={{ id: 'u-tech', fullName: 'Téc. Prueba' }}
          actingAsDentista={false}
          actingAsTecnico
          onClose={() => {}}
          caseStatus="cambiosEnProceso"
          clinicalCase={{
            ...techClinicalCase,
            status: 'cambiosEnProceso',
            doctorNotes: 'Texto legado que no debe mostrarse como indicaciones',
            specialInstructions: 'Unificar contactos proximales.',
            deliveries: [
              { version: 2, status: 'rejected', reviewComment: 'Afilar incisal central' },
              { version: 1, status: 'approved', reviewComment: null },
            ],
          }}
        />
      </ToastProvider>,
    );
    const alerts = screen.getByTestId('uch-inline-alerts');
    expect(within(alerts).getByText(/Ajustes solicitados/i)).toBeInTheDocument();
    expect(within(alerts).getByText(/Afilar incisal central/i)).toBeInTheDocument();
    expect(within(alerts).getByText(/Unificar contactos proximales/i)).toBeInTheDocument();
    expect(within(alerts).queryByText(/Texto legado que no debe mostrarse/i)).not.toBeInTheDocument();
  });

  const minimalWinnerInvitation: InvitationItem = {
    id: 'inv-winner-q',
    caseId: 'case-1',
    caseNumber: 'W-1',
    internalName: null,
    restorationType: null,
    material: null,
    urgency: 'alta',
    caseComplexity: null,
    serviceType: null,
    status: 'confirmed',
    invitedAt: new Date(),
    expiresAt: null,
    quotedPrice: 50000,
    quotedDays: 3,
    isWinner: true,
    caseStatus: 'aceptadaPendienteInicio',
    teeth: [],
    archivedByCurrentUser: false,
  };

  it('técnico ganador: sin panel Fauchard en hilo si ya existe TRABAJO_INICIADO (resultado en eventos)', () => {
    const trabajoIniciado = {
      id: 'ev-ti',
      type: 'sistema' as const,
      action: 'TRABAJO_INICIADO',
      content: 'Inicio registrado',
      payload: {},
      stateChange: {},
      createdAt: '2025-02-01T12:00:00.000Z',
      user: { id: 'u-sys', fullName: 'Sistema', role: 'sistema' },
    };
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[trabajoIniciado]}
          currentUser={{ id: 'u-tech', fullName: 'Téc. Prueba' }}
          actingAsDentista={false}
          actingAsTecnico
          onClose={() => {}}
          caseStatus="aceptadaPendienteInicio"
          clinicalCase={{
            status: 'aceptadaPendienteInicio',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            assignedTechnicianId: 'u-tech',
            caseNumber: 'W-1',
            workStartedAt: null,
          }}
          myInvitation={minimalWinnerInvitation}
        />
      </ToastProvider>,
    );
    expect(screen.queryByTestId('uch-case-actions-inline')).not.toBeInTheDocument();
  });

  const minimalLoserInvitation: InvitationItem = {
    id: 'inv-loser-q',
    caseId: 'case-1',
    caseNumber: 'L-9',
    internalName: null,
    restorationType: null,
    material: null,
    urgency: 'alta',
    caseComplexity: null,
    serviceType: null,
    status: 'rejected',
    invitedAt: new Date(),
    expiresAt: null,
    quotedPrice: 1000,
    quotedDays: 5,
    isWinner: false,
    caseStatus: 'aceptadaPendienteInicio',
    teeth: [],
    archivedByCurrentUser: false,
  };

  it('técnico perdedor: no muestra pie duplicado si el hilo ya tiene OFERTA_RECHAZADA', () => {
    const rejectEv = {
      id: 'ev-rej-footer',
      type: 'sistema' as const,
      action: 'OFERTA_RECHAZADA',
      content: 'Tu oferta no fue seleccionada en esta ocasión.',
      payload: { visibleTo: 'tecnico', invitationId: 'inv-loser-q' },
      stateChange: null,
      createdAt: new Date().toISOString(),
      user: { id: 'u-dent', fullName: 'Dr.', role: 'dentista' },
    };
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[rejectEv]}
          currentUser={{ id: 'u-loser', fullName: 'Lab perdedor' }}
          actingAsDentista={false}
          actingAsTecnico
          onClose={() => {}}
          caseStatus="aceptadaPendienteInicio"
          clinicalCase={{
            status: 'aceptadaPendienteInicio',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            assignedTechnicianId: 'u-winner',
            caseNumber: 'L-9',
          }}
          myInvitation={minimalLoserInvitation}
        />
      </ToastProvider>,
    );
    expect(screen.queryByText(/Caso ya fue Asignado/i)).not.toBeInTheDocument();
  });

  it('técnico perdedor techOfferRejectedView: oculta actividad del técnico asignado (p. ej. REVISION_ENVIADA visibleTo ambos)', () => {
    const winnerRevision = {
      id: 'ev-winner-rev',
      type: 'tecnico' as const,
      action: 'REVISION_ENVIADA',
      content: 'Entrega v1 enviada a revisión',
      payload: { visibleTo: 'ambos', files: ['x.stl'], deliveryVersion: 1 },
      stateChange: null,
      createdAt: new Date().toISOString(),
      userId: 'u-winner',
      user: { id: 'u-winner', fullName: 'Técnico 3', role: 'tecnico' },
    };
    const rejectEv = {
      id: 'ev-rej',
      type: 'sistema' as const,
      action: 'OFERTA_NO_SELECCIONADA',
      content: 'Otra oferta fue elegida.',
      payload: { visibleTo: 'tecnico', invitationId: 'inv-loser-q' },
      stateChange: null,
      createdAt: new Date().toISOString(),
      user: { id: 'u-dent', fullName: 'Dr.', role: 'dentista' },
    };
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[winnerRevision, rejectEv]}
          currentUser={{ id: 'u-loser', fullName: 'Lab perdedor' }}
          actingAsDentista={false}
          actingAsTecnico
          onClose={() => {}}
          caseStatus="enRevision"
          clinicalCase={{
            status: 'enRevision',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            assignedTechnicianId: 'u-winner',
            caseNumber: 'L-9',
          }}
          myInvitation={minimalLoserInvitation}
          techOfferRejectedView
        />
      </ToastProvider>,
    );
    expect(screen.queryByText(/Entrega v1 enviada a revisión/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Técnico 3/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('uch-activity-event-ev-winner-rev')).not.toBeInTheDocument();
    expect(screen.getByTestId('uch-activity-event-ev-rej')).toBeInTheDocument();
  });

  it('técnico no asignado: no muestra tarjeta «Más sobre el caso» solo por workDeadline del caso', () => {
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[]}
          currentUser={{ id: 'u-loser', fullName: 'Lab no asignado' }}
          actingAsDentista={false}
          actingAsTecnico
          onClose={() => {}}
          caseStatus="enRevision"
          clinicalCase={{
            status: 'enRevision',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            assignedTechnicianId: 'u-winner',
            caseNumber: 'L-Z',
            workDeadline: '2026-05-12T21:00:00.000Z',
          }}
        />
      </ToastProvider>,
    );
    expect(screen.queryByTestId('uch-context-card')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Plazo de entrega$/m)).not.toBeInTheDocument();
  });

  it('UchEventBubble: carril thread vs self (data-uch-lane)', () => {
    const { rerender } = render(
      <UchEventBubble
        event={{
          id: 'ev-fc-lane',
          type: 'tecnico',
          action: 'COMENTARIO_TECNICO',
          content: 'Mensaje orquestado',
          payload: {},
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: '__fauchard__', fullName: 'Fauchard', role: 'sistema' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-fc-lane')).toHaveAttribute('data-uch-lane', 'thread');

    rerender(
      <UchEventBubble
        event={{
          id: 'ev-h-lane',
          type: 'tecnico',
          action: 'COMENTARIO_TECNICO',
          content: 'Otro técnico',
          payload: {},
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: 'u-peer', fullName: 'Lab X', role: 'tecnico' },
        }}
        currentUser={{ id: 'u-self' }}
        actingAsDentista={false}
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-h-lane')).toHaveAttribute('data-uch-lane', 'thread');
  });

  it('UchEventBubble: sistema con actor = viewer usa carril self', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-sys-me',
          type: 'sistema',
          action: 'OFERTA_ACEPTADA',
          content: 'He aceptado una oferta. Esperando confirmación.',
          payload: {},
          stateChange: {},
          createdAt: new Date().toISOString(),
          userId: 'u-dent',
          user: { id: 'u-dent', fullName: 'Dr. X', role: 'dentista' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-sys-me')).toHaveAttribute('data-uch-lane', 'self');
    expect(screen.getByText('Yo')).toBeInTheDocument();
  });

  it('UchEventBubble: máscara Fauchard + userId viewer sigue siendo carril self y Yo', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-mask-self',
          type: 'sistema',
          action: 'OFERTA_ACEPTADA',
          content: 'He aceptado una oferta.',
          payload: { visibleTo: 'dentista' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          userId: 'u-dent',
          user: { id: '__fauchard__', fullName: 'Fauchard', role: 'sistema' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-mask-self')).toHaveAttribute('data-uch-lane', 'self');
    expect(screen.getByText('Yo')).toBeInTheDocument();
  });

  it('UchEventBubble: CASO_PUBLICADO dentista va a hilo como Fauchard con burbuja completa', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-sys-anon',
          type: 'sistema',
          action: 'CASO_PUBLICADO',
          content: 'He publicado el caso. Estamos buscando el laboratorio ideal para tu caso.',
          payload: { visibleTo: 'dentista', presentationAuthor: 'fauchard' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          userId: 'u-dent',
          user: { id: 'u-dent', fullName: 'Dra. Prueba', role: 'dentista' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-sys-anon')).toHaveAttribute('data-uch-lane', 'thread');
    expect(screen.getByText('Fauchard')).toBeInTheDocument();
    expect(screen.queryByText('Yo')).not.toBeInTheDocument();
    expect(
      screen.getByText(/He publicado el caso\. Estamos buscando el laboratorio ideal para tu caso\./i),
    ).toBeInTheDocument();
  });

  it('UchEventBubble: INVITACION_RECIBIDA técnico es Fauchard con burbuja completa (no píldora)', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-inv-full',
          type: 'sistema',
          action: 'INVITACION_RECIBIDA',
          content: 'Te llegó una invitación para cotizar este caso.',
          payload: { visibleTo: 'tecnico', presentationAuthor: 'fauchard' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          userId: 'u-tech',
          user: { id: 'u-tech', fullName: 'Lab', role: 'tecnico' },
        }}
        currentUser={{ id: 'u-tech' }}
        actingAsDentista={false}
        actingAsTecnico
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-inv-full')).toHaveAttribute('data-uch-lane', 'thread');
    expect(screen.getByText('Fauchard')).toBeInTheDocument();
    expect(screen.getByText(/Te llegó una invitación para cotizar este caso\./i)).toBeInTheDocument();
  });

  it('UchEventBubble: técnico ve título unificado y comentario del solicitante en OFERTA_RECHAZADA', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-bub',
          type: 'sistema',
          action: 'OFERTA_RECHAZADA',
          content: 'Tu oferta no fue seleccionada en esta ocasión.',
          payload: { visibleTo: 'tecnico', invitationId: 'x', feedbackDentista: 'Precio fuera de rango.' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: 'u-dent', fullName: 'Dr.', role: 'dentista' },
        }}
        currentUser={{ id: 'u-tech' }}
        actingAsDentista={false}
        actingAsTecnico
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 'hora'}
      />,
    );
    expect(screen.getByText('Otra oferta fue elegida')).toBeInTheDocument();
    expect(screen.getByText(/Comentario del solicitante/i)).toBeInTheDocument();
    expect(screen.getByText(/Precio fuera de rango/i)).toBeInTheDocument();
  });

  it('UchEventBubble: OFERTA_RECHAZADA técnico-only con user enmascarado va a hilo como Fauchard (no «Yo»)', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-tech-rej-mask',
          type: 'sistema',
          action: 'OFERTA_RECHAZADA',
          content: 'Tu oferta no fue seleccionada.',
          payload: { visibleTo: 'tecnico', invitationId: 'inv-y' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: '__fauchard__', fullName: 'Fauchard', role: 'sistema' },
        }}
        currentUser={{ id: 'u-tech' }}
        actingAsDentista={false}
        actingAsTecnico
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-tech-rej-mask')).toHaveAttribute('data-uch-lane', 'thread');
    expect(screen.getByText('Fauchard')).toBeInTheDocument();
    expect(screen.queryByText('Yo')).not.toBeInTheDocument();
  });

  it('UchEventBubble: dentista TRABAJO_INICIADO orquestado va a hilo como Fauchard', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-ti-dent',
          userId: 'u-dent',
          type: 'sistema',
          action: 'TRABAJO_INICIADO',
          content: 'El laboratorio asignado confirmó el inicio.',
          payload: { visibleTo: 'dentista', presentationAuthor: 'fauchard' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: 'u-dent', fullName: 'Dra. Prueba', role: 'dentista' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-ti-dent')).toHaveAttribute('data-uch-lane', 'thread');
    expect(screen.getByText('Fauchard')).toBeInTheDocument();
    expect(screen.queryByText('Yo')).not.toBeInTheDocument();
  });

  it('UchEventBubble: dentista ve costo, plazo y comentario del oferente en OFERTA_RECHAZADA', () => {
    const priceLabel = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(125000);
    render(
      <UchEventBubble
        event={{
          id: 'ev-dent-rej',
          type: 'sistema',
          action: 'OFERTA_RECHAZADA',
          content: 'Rechazaste una oferta. Tu comentario fue enviado al laboratorio.',
          payload: {
            visibleTo: 'dentista',
            invitationId: 'inv-1',
            feedback: 'Muy caro',
            quotedPrice: 125000,
            quotedDays: 5,
            techNotes: 'Incluye corona temporal.',
          },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 'hora'}
      />,
    );
    expect(screen.getByText('Oferta rechazada')).toBeInTheDocument();
    expect(screen.getByText(/Rechazaste una oferta/i)).toBeInTheDocument();
    expect(screen.getByText(priceLabel)).toBeInTheDocument();
    expect(screen.getByText(/5 días hábiles/i)).toBeInTheDocument();
    expect(screen.getByText(/Comentario del oferente/i)).toBeInTheDocument();
    expect(screen.getByText(/Incluye corona temporal/i)).toBeInTheDocument();
  });

  it('UchEventBubble: OFERTA_RECHAZADA dentista-only con user enmascarado y sin userId va a self', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-dent-rej-mask',
          type: 'sistema',
          action: 'OFERTA_RECHAZADA',
          content: 'Rechazaste una oferta.',
          payload: { visibleTo: 'dentista', invitationId: 'inv-x' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: '__fauchard__', fullName: 'Fauchard', role: 'sistema' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-dent-rej-mask')).toHaveAttribute('data-uch-lane', 'self');
    expect(screen.getByText('Yo')).toBeInTheDocument();
  });

  it('UchEventBubble: CASO_OFERTAS_TODAS_RECHAZADAS dentista-only sin userId va a self', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-all-rej',
          type: 'sistema',
          action: 'CASO_OFERTAS_TODAS_RECHAZADAS',
          content: 'He rechazado todas las ofertas.',
          payload: { visibleTo: 'dentista' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: '__fauchard__', fullName: 'Fauchard', role: 'sistema' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByTestId('uch-activity-event-ev-all-rej')).toHaveAttribute('data-uch-lane', 'self');
  });

  it('UchEventBubble: dentista acepta quotedPrice y quotedDays como string en JSON', () => {
    const priceLabel = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(99000);
    render(
      <UchEventBubble
        event={{
          id: 'ev-dent-rej-str',
          type: 'sistema',
          action: 'OFERTA_RECHAZADA',
          content: 'Rechazaste una oferta. Tu comentario fue enviado al laboratorio.',
          payload: {
            visibleTo: 'dentista',
            invitationId: 'inv-s',
            feedback: 'x',
            quotedPrice: '99000',
            quotedDays: '3',
            techNotes: '',
          },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 'hora'}
      />,
    );
    expect(screen.getByText(priceLabel)).toBeInTheDocument();
    expect(screen.getByText(/3 días hábiles/i)).toBeInTheDocument();
  });

  it('UchEventBubble: dentista OFERTA_RECHAZADA sin snapshot en payload muestra em dash y sin comentario', () => {
    render(
      <UchEventBubble
        event={{
          id: 'ev-dent-rej-old',
          type: 'sistema',
          action: 'OFERTA_RECHAZADA',
          content: 'Rechazaste una oferta. Tu comentario fue enviado al laboratorio.',
          payload: { visibleTo: 'dentista', invitationId: 'inv-old', feedback: 'Ok' },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 'hora'}
      />,
    );
    expect(screen.getByText('Oferta rechazada')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Sin comentario del oferente/i)).toBeInTheDocument();
  });

  it('UchEventBubble: técnico ve costo, plazo y comentario en OFERTA_ENVIADA', () => {
    const priceLabel = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(88000);
    render(
      <UchEventBubble
        event={{
          id: 'ev-off-sent',
          userId: 'u-tech',
          type: 'sistema',
          action: 'OFERTA_ENVIADA',
          content: 'He enviado la Oferta.',
          payload: {
            visibleTo: 'tecnico',
            invitationId: 'inv-1',
            quotedPrice: 88000,
            quotedDays: 7,
            techNotes: 'Incluye prueba de color.',
          },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: 'u-tech', fullName: 'Téc.', role: 'tecnico' },
        }}
        currentUser={{ id: 'u-tech' }}
        actingAsDentista={false}
        actingAsTecnico
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByText(/Cotización enviada/i)).toBeInTheDocument();
    expect(screen.getByText(priceLabel)).toBeInTheDocument();
    expect(screen.getByText(/7 días hábiles/i)).toBeInTheDocument();
    expect(screen.getByText(/Incluye prueba de color/i)).toBeInTheDocument();
  });

  it('UchEventBubble: dentista ve detalle en OFERTA_NO_SELECCIONADA al elegir otra oferta', () => {
    const priceLabel = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(70000);
    render(
      <UchEventBubble
        event={{
          id: 'ev-ns-dent',
          userId: 'u-dent',
          type: 'sistema',
          action: 'OFERTA_NO_SELECCIONADA',
          content: 'Esta oferta quedó fuera al elegir otra propuesta para el caso.',
          payload: {
            visibleTo: 'dentista',
            invitationId: 'inv-x',
            quotedPrice: 70000,
            quotedDays: 3,
            techNotes: 'Zirconia monolítica.',
          },
          stateChange: {},
          createdAt: new Date().toISOString(),
          user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
        }}
        currentUser={{ id: 'u-dent' }}
        actingAsDentista
        revisionVersionMap={new Map()}
        formatActivityTimestamp={() => 't'}
      />,
    );
    expect(screen.getByText('Oferta no seleccionada')).toBeInTheDocument();
    expect(screen.getByText(priceLabel)).toBeInTheDocument();
    expect(screen.getByText(/3 días hábiles/i)).toBeInTheDocument();
    expect(screen.getByText(/Zirconia monolítica/i)).toBeInTheDocument();
  });

  it('UCH: muestra CASO_CREADO y CASO_PUBLICADO en el hilo (dentista)', () => {
    const casoCreado = {
      id: 'ev-cc',
      userId: 'u-dent',
      type: 'sistema' as const,
      action: 'CASO_CREADO',
      content: 'He creado el caso.',
      payload: { visibleTo: 'dentista' },
      stateChange: {},
      createdAt: '2020-01-01T10:00:00.000Z',
      user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
    };
    const casoPublicado = {
      id: 'ev-cp',
      userId: 'u-dent',
      type: 'sistema' as const,
      action: 'CASO_PUBLICADO',
      content: 'He publicado el caso.',
      payload: { visibleTo: 'dentista', presentationAuthor: 'fauchard' },
      stateChange: {},
      createdAt: '2020-01-02T10:00:00.000Z',
      user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
    };
    renderDentistHubWithEvents([casoPublicado, casoCreado]);
    const panel = activityScroll();
    expect(within(panel).getByText(/He creado el caso/i)).toBeInTheDocument();
    expect(within(panel).getByText(/He publicado el caso/i)).toBeInTheDocument();
  });

  it('UCH: botón «Cargar historial anterior» llama onLoadOlderUchEvents con el id más antiguo', async () => {
    const onLoadOlder = vi.fn().mockResolvedValue(undefined);
    const casoCreado = {
      id: 'ev-old',
      userId: 'u-dent',
      type: 'sistema' as const,
      action: 'CASO_CREADO',
      content: 'Antiguo',
      payload: { visibleTo: 'dentista' },
      stateChange: {},
      createdAt: '2019-06-01T00:00:00.000Z',
      user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
    };
    const casoPublicado = {
      id: 'ev-new',
      userId: 'u-dent',
      type: 'sistema' as const,
      action: 'CASO_PUBLICADO',
      content: 'Reciente',
      payload: { visibleTo: 'dentista', presentationAuthor: 'fauchard' },
      stateChange: {},
      createdAt: '2020-01-02T00:00:00.000Z',
      user: { id: 'u-dent', fullName: 'Dra.', role: 'dentista' },
    };
    render(
      <ToastProvider>
        <UnifiedCaseHub
          caseId="case-1"
          initialEvents={[casoCreado, casoPublicado]}
          uchHasMoreOlder
          onLoadOlderUchEvents={onLoadOlder}
          currentUser={{ id: 'u-dent', fullName: 'Dra.' }}
          actingAsDentista
          actingAsTecnico={false}
          onClose={() => {}}
          caseStatus="enEvaluacion"
          clinicalCase={{
            status: 'enEvaluacion',
            organizationId: 'org-1',
            doctorId: 'u-dent',
            caseNumber: 'D-99',
          }}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId('uch-load-older'));
    await waitFor(() => expect(onLoadOlder).toHaveBeenCalledWith('ev-old'));
  });
});
