/**
 * Unit — getHubUnreadCountsForCasesAction: batching (agrupación de eventos por caso,
 * acceso del técnico precargado, cap por caso). La lógica de conteo/visibilidad se
 * mockea (tiene cobertura propia en uch-unread / caseEventsUchFilter); aquí se valida
 * que los eventos se enrutan al caso correcto sin fugas y que el total agrega bien.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { identityMock, dbSelectMock, findManyMock, totalUnreadMock } = vi.hoisted(() => ({
  identityMock: vi.fn(),
  dbSelectMock: vi.fn(),
  findManyMock: vi.fn(),
  totalUnreadMock: vi.fn(),
}));

vi.mock('@/lib/db/actions/impersonation', () => ({ getServerIdentity: identityMock }));
vi.mock('@/lib/db', () => ({
  db: {
    select: dbSelectMock,
    query: { clinicalCaseEvent: { findMany: findManyMock } },
  },
}));
// Conteo = nº de eventos enrutados al caso → permite verificar la agrupación.
vi.mock('@/lib/uchUnread', () => ({ totalUchHubUnread: (evts: unknown[]) => totalUnreadMock(evts) }));
vi.mock('@/lib/caseEventsUchFilter', () => ({ filterCaseEventsForUchViewer: (evts: unknown[]) => evts }));
vi.mock('@/lib/caseResponsibilityAttention', () => ({
  responsibilityAttentionBump: () => 0,
  isHubInboxSuppressedForCompletedCase: () => false,
}));
vi.mock('@/lib/db/caseListVisibility', () => ({ userCanAccessClinicalCase: () => Promise.resolve(true) }));
vi.mock('@/lib/db/caseUserArchiveHelpers', () => ({
  archiveVisibilityForUser: vi.fn(),
  getArchivedCaseIdsForUser: vi.fn(),
}));

import { getHubUnreadCountsForCasesAction } from '@/lib/db/actions/hubRead';

const TECH = 'tech-1';
const CASE_A = 'caseAAAAAAAAAAAAA';
const CASE_B = 'caseBBBBBBBBBBBBB';

// db.select().from().where() resuelve, en orden: caseRows, assignmentRows, readRows.
function queueSelects(...batches: unknown[][]) {
  let i = 0;
  dbSelectMock.mockImplementation(() => ({
    from: () => ({ where: () => Promise.resolve(batches[i++] ?? []) }),
  }));
}

function ev(caseId: string, createdAt: string) {
  return { clinicalCaseId: caseId, type: 'mensaje', action: 'X', userId: 'u', createdAt: new Date(createdAt), payload: {} };
}

describe('getHubUnreadCountsForCasesAction — batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue({ id: TECH, role: 'tecnico', orgId: 'o1' });
    totalUnreadMock.mockImplementation((evts: unknown[]) => (evts as unknown[]).length);
  });

  it('agrupa los eventos por caso sin fugas y agrega el total', async () => {
    queueSelects(
      // caseRows: técnico asignado a A, con asignación a B
      [
        { id: CASE_A, organizationId: 'o1', assignedTechnicianId: TECH, doctorId: 'd1', currentResponsibility: null, status: 'enEjecucion' },
        { id: CASE_B, organizationId: 'o1', assignedTechnicianId: null, doctorId: 'd1', currentResponsibility: null, status: 'enEvaluacion' },
      ],
      // assignmentRows del técnico: tiene asignación en B (y en A por assignedTechnicianId)
      [{ id: 'assign-b', clinicalCaseId: CASE_B }],
      // readRows: ninguno
      [],
    );
    // findMany devuelve TODOS los eventos de ambos casos en una sola query (desc).
    findManyMock.mockResolvedValue([
      ev(CASE_A, '2026-07-03T10:00:00Z'),
      ev(CASE_B, '2026-07-03T09:00:00Z'),
      ev(CASE_A, '2026-07-03T08:00:00Z'),
    ]);

    const res = await getHubUnreadCountsForCasesAction([CASE_A, CASE_B]);

    expect(res.byCaseId[CASE_A]).toBe(2); // dos eventos enrutados a A
    expect(res.byCaseId[CASE_B]).toBe(1); // uno a B
    expect(res.total).toBe(3);
    // Una sola query de eventos para ambos casos.
    expect(findManyMock).toHaveBeenCalledTimes(1);
  });

  it('excluye casos sin acceso del técnico (ni asignado ni con asignación)', async () => {
    queueSelects(
      [
        { id: CASE_A, organizationId: 'o1', assignedTechnicianId: TECH, doctorId: 'd1', currentResponsibility: null, status: 'enEjecucion' },
        { id: CASE_B, organizationId: 'o1', assignedTechnicianId: 'otro', doctorId: 'd1', currentResponsibility: null, status: 'enEvaluacion' },
      ],
      [], // el técnico no tiene asignación a ninguno de los dos por caseAssignment
      [],
    );
    findManyMock.mockResolvedValue([ev(CASE_A, '2026-07-03T10:00:00Z')]);

    const res = await getHubUnreadCountsForCasesAction([CASE_A, CASE_B]);

    expect(res.byCaseId[CASE_A]).toBe(1);
    expect(res.byCaseId[CASE_B]).toBeUndefined(); // sin acceso → no aparece
  });
});
