import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getServerIdentityMock, userCanAccessMock, selectLimitMock, insertReturningMock } = vi.hoisted(() => ({
  getServerIdentityMock: vi.fn(),
  userCanAccessMock: vi.fn(),
  selectLimitMock: vi.fn(),
  insertReturningMock: vi.fn(),
}));

// db.select().from().where().limit()  y  db.insert().values().returning()
const insertValuesSpy = vi.fn(() => ({ returning: insertReturningMock }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: selectLimitMock }) }),
    }),
    insert: () => ({ values: insertValuesSpy }),
  },
}));

vi.mock('@/lib/db/actions/impersonation', () => ({
  getServerIdentity: (...a: unknown[]) => getServerIdentityMock(...a),
}));

vi.mock('@/lib/db/caseListVisibility', () => ({
  userCanAccessClinicalCase: (...a: unknown[]) => userCanAccessMock(...a),
}));

vi.mock('@/lib/services/gcp-storage', () => ({ default: {} }));

import { registerFileAction } from '@/lib/db/actions/files';

const BASE_INPUT = {
  caseId: 'case-1',
  filename: 'scan.stl',
  category: 'scan',
  size: 100,
  mimeType: 'model/stl',
  gcsPath: 'organizations/o1/cases/case-1/scans/scan.stl',
};

describe('registerFileAction — autorización', () => {
  beforeEach(() => {
    getServerIdentityMock.mockReset();
    userCanAccessMock.mockReset();
    selectLimitMock.mockReset();
    insertReturningMock.mockReset();
    insertValuesSpy.mockClear();
    insertReturningMock.mockResolvedValue([{ id: 'file-1' }]);
  });

  it('sin identidad → No autorizado, no inserta', async () => {
    getServerIdentityMock.mockResolvedValue(null);
    const res = await registerFileAction(BASE_INPUT);
    expect(res).toEqual({ success: false, error: 'No autorizado' });
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it('caso inexistente → error, no inserta', async () => {
    getServerIdentityMock.mockResolvedValue({ id: 'u1', role: 'dentista', orgId: 'o1' });
    selectLimitMock.mockResolvedValue([]);
    const res = await registerFileAction(BASE_INPUT);
    expect(res).toEqual({ success: false, error: 'Caso no encontrado' });
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it('sin acceso al caso (otra org) → No autorizado, no inserta', async () => {
    getServerIdentityMock.mockResolvedValue({ id: 'u1', role: 'dentista', orgId: 'o1' });
    selectLimitMock.mockResolvedValue([{ organizationId: 'o2', doctorId: 'x', status: 'borrador', assignedTechnicianId: null }]);
    userCanAccessMock.mockResolvedValue(false);
    const res = await registerFileAction(BASE_INPUT);
    expect(res).toEqual({ success: false, error: 'No autorizado' });
    expect(insertValuesSpy).not.toHaveBeenCalled();
  });

  it('con acceso → inserta con orgId/uploaderId de la identidad, ignorando cualquier valor del cliente', async () => {
    getServerIdentityMock.mockResolvedValue({ id: 'u1', role: 'dentista', orgId: 'o1' });
    selectLimitMock.mockResolvedValue([{ organizationId: 'o1', doctorId: 'u1', status: 'borrador', assignedTechnicianId: null }]);
    userCanAccessMock.mockResolvedValue(true);

    const res = await registerFileAction(BASE_INPUT);

    expect(res).toEqual({ success: true, data: { id: 'file-1' } });
    const inserted = (insertValuesSpy.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(inserted.organizationId).toBe('o1');
    expect(inserted.uploaderId).toBe('u1');
    expect(inserted.clinicalCaseId).toBe('case-1');
  });
});
