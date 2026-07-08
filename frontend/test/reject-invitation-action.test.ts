/**
 * Unit — rejectInvitationIndividualAction (v5.0, Fase 5).
 * Cubre validaciones: técnico correcto, status pending, motivo válido, "Otro" → comentario.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { identityMock, dbSelectMock, dbUpdateMock, logCaseEventMock, tryReplaceMock } =
  vi.hoisted(() => ({
    identityMock: vi.fn(),
    dbSelectMock: vi.fn(),
    dbUpdateMock: vi.fn(),
    logCaseEventMock: vi.fn(),
    tryReplaceMock: vi.fn(),
  }));

vi.mock('@/lib/db/actions/impersonation', () => ({ getServerIdentity: identityMock }));
vi.mock('@/lib/db/actions/cases', () => ({ logCaseEvent: logCaseEventMock }));
vi.mock('@/lib/db/actions/replacement', () => ({ tryReplaceAfterRejectAction: tryReplaceMock }));
vi.mock('@/lib/constants/availabilityFlags', () => ({
  isRejectionIndividualEnabled: () => true,
}));
vi.mock('@/lib/uchPresentation', () => ({ UCH_PAYLOAD_PRESENTATION_FAUCHARD: {} }));
vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
  },
}));

import { rejectInvitationIndividualAction } from '@/lib/db/actions/rejection';

// db.select() resuelve, en orden, los resultados de la cola.
function queueSelects(...resultBatches: unknown[][]) {
  let i = 0;
  dbSelectMock.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(resultBatches[i++] ?? []) }) }),
  }));
}

const TECH = 'tech-1';
const INV = {
  id: 'inv-1',
  clinicalCaseId: 'case-1',
  technicianId: TECH,
  status: 'pending',
};

describe('rejectInvitationIndividualAction (Fase 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue({ id: TECH, role: 'tecnico', isSystemAdmin: false });
    dbUpdateMock.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
    logCaseEventMock.mockResolvedValue(undefined);
    tryReplaceMock.mockResolvedValue({ success: true, replaced: true });
  });

  it('rechaza con motivo válido y status pending', async () => {
    queueSelects([INV], [{ id: 'r1', code: 'rej_001', isActive: true }]);
    const res = await rejectInvitationIndividualAction('inv-1', 'r1');
    expect(res.success).toBe(true);
    expect(dbUpdateMock).toHaveBeenCalled();
    expect(logCaseEventMock).toHaveBeenCalled();
  });

  it('el evento UCH es visible al técnico que rechazó y lleva el motivo', async () => {
    queueSelects([INV], [{ id: 'r1', code: 'rej_001', label: 'Sin disponibilidad', isActive: true }]);
    await rejectInvitationIndividualAction('inv-1', 'r1', 'No alcanzo el plazo');
    const evt = logCaseEventMock.mock.calls[0][0];
    // Visible al técnico (su propio carril), NO oculto como 'sistema', y sin voz Fauchard.
    expect(evt.payload.visibleTo).toBe('tecnico');
    expect(evt.payload.presentationAuthor).toBeUndefined();
    expect(evt.payload.rejectionReasonLabel).toBe('Sin disponibilidad');
    expect(evt.payload.rejectionComment).toBe('No alcanzo el plazo');
    // El contenido que ve el técnico incluye el motivo y su comentario.
    expect(evt.content).toContain('Sin disponibilidad');
    expect(evt.content).toContain('No alcanzo el plazo');
  });

  it('rechaza invitación de otro técnico → error de pertenencia', async () => {
    identityMock.mockResolvedValue({ id: 'otro-tech', role: 'tecnico', isSystemAdmin: false });
    queueSelects([INV]);
    const res = await rejectInvitationIndividualAction('inv-1', 'r1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/no te pertenece/i);
  });

  it('rechaza invitación no pendiente → error de estado', async () => {
    queueSelects([{ ...INV, status: 'quoted' }]);
    const res = await rejectInvitationIndividualAction('inv-1', 'r1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/pendiente/i);
  });

  it('motivo inválido / inactivo → error', async () => {
    queueSelects([INV], []);
    const res = await rejectInvitationIndividualAction('inv-1', 'rX');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/inválido/i);
  });

  it('motivo "Otro" sin comentario → error', async () => {
    queueSelects([INV], [{ id: 'r7', code: 'rej_007', isActive: true }]);
    const res = await rejectInvitationIndividualAction('inv-1', 'r7');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/comentario/i);
  });

  it('dispara reemplazo automático tras el rechazo', async () => {
    queueSelects([INV], [{ id: 'r1', code: 'rej_001', isActive: true }]);
    const res = await rejectInvitationIndividualAction('inv-1', 'r1');
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(tryReplaceMock).toHaveBeenCalledWith('inv-1');
    expect(res.replacementSent).toBe(true);
  });
});
