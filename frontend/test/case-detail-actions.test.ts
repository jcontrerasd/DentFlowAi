import { describe, expect, it } from 'vitest';
import { getCaseDetailActionState } from '@/lib/cases/caseDetailActions';
import { CASE_STATUSES } from '@/lib/constants/dental';

describe('getCaseDetailActionState', () => {
  it('dentista en borrador: publicar habilitado sin publishedAt', () => {
    const a = getCaseDetailActionState({
      status: CASE_STATUSES.BORRADOR,
      publishedAt: null,
      role: 'dentista',
      isEditing: true,
      isFormDirty: true,
      canDelete: true,
    });
    expect(a.edit.enabled).toBe(true);
    expect(a.publish.enabled).toBe(true);
    expect(a.save.enabled).toBe(true);
    expect(a.archive.enabled).toBe(false);
    expect(a.createCopy.enabled).toBe(false);
  });

  it('dentista en borrador sin modo edición: grabar deshabilitado', () => {
    const a = getCaseDetailActionState({
      status: CASE_STATUSES.BORRADOR,
      publishedAt: null,
      role: 'dentista',
      isEditing: false,
      isFormDirty: true,
    });
    expect(a.edit.enabled).toBe(true);
    expect(a.save.enabled).toBe(false);
  });

  it('dentista en borrador con publishedAt: publicar deshabilitado', () => {
    const a = getCaseDetailActionState({
      status: CASE_STATUSES.BORRADOR,
      publishedAt: new Date(),
      role: 'dentista',
    });
    expect(a.publish.enabled).toBe(false);
    expect(a.publish.disabledReason).toMatch(/ya fue publicado/i);
  });

  it('dentista terminal: archivar y crear copia habilitados', () => {
    const a = getCaseDetailActionState({
      status: CASE_STATUSES.COMPLETADO,
      publishedAt: new Date(),
      role: 'dentista',
      isArchivedByUser: false,
    });
    expect(a.archive.enabled).toBe(true);
    expect(a.createCopy.enabled).toBe(true);
    expect(a.publish.enabled).toBe(false);
  });

  it('intermedio: acciones de borrador visibles pero deshabilitadas', () => {
    const a = getCaseDetailActionState({
      status: CASE_STATUSES.EN_EJECUCION,
      publishedAt: new Date(),
      role: 'dentista',
    });
    expect(a.save.visible).toBe(true);
    expect(a.save.enabled).toBe(false);
    expect(a.archive.enabled).toBe(false);
  });

  it('admin en borrador: sin editar/publicar; solo supervisión', () => {
    const a = getCaseDetailActionState({
      status: CASE_STATUSES.BORRADOR,
      publishedAt: null,
      role: 'admin',
    });
    expect(a.edit.visible).toBe(false);
    expect(a.save.visible).toBe(false);
    expect(a.publish.visible).toBe(false);
    expect(a.delete.visible).toBe(false);
    expect(a.archive.enabled).toBe(false);
    expect(a.createCopy.enabled).toBe(false);
  });

  it('admin en caso terminal: archivar y crear copia', () => {
    const a = getCaseDetailActionState({
      status: CASE_STATUSES.COMPLETADO,
      role: 'admin',
      isArchivedByUser: false,
    });
    expect(a.archive.enabled).toBe(true);
    expect(a.createCopy.enabled).toBe(true);
  });

  it('técnico con invitación rejected: puede archivar', () => {
    const a = getCaseDetailActionState({
      status: CASE_STATUSES.PROPUESTA_LISTA,
      role: 'tecnico',
      invitationStatus: 'rejected',
      viewerId: 'tech-1',
    });
    expect(a.archive.enabled).toBe(true);
    expect(a.publish.visible).toBe(false);
  });
});
