import { describe, it, expect } from 'vitest';
import { responsibilityAttentionBump } from '@/lib/caseResponsibilityAttention';

describe('responsibilityAttentionBump', () => {
  it('dentista + turno dentista → 1', () => {
    expect(
      responsibilityAttentionBump({
        viewerRole: 'dentista',
        viewerId: 'd1',
        currentResponsibility: 'dentista',
        assignedTechnicianId: 't1',
      }),
    ).toBe(1);
  });

  it('dentista + turno técnico → 0', () => {
    expect(
      responsibilityAttentionBump({
        viewerRole: 'dentista',
        viewerId: 'd1',
        currentResponsibility: 'tecnico',
        assignedTechnicianId: 't1',
      }),
    ).toBe(0);
  });

  it('técnico asignado + turno técnico → 1', () => {
    expect(
      responsibilityAttentionBump({
        viewerRole: 'tecnico',
        viewerId: 't1',
        currentResponsibility: 'tecnico',
        assignedTechnicianId: 't1',
      }),
    ).toBe(1);
  });

  it('técnico no asignado + turno técnico → 0', () => {
    expect(
      responsibilityAttentionBump({
        viewerRole: 'tecnico',
        viewerId: 't1',
        currentResponsibility: 'tecnico',
        assignedTechnicianId: 't2',
      }),
    ).toBe(0);
  });

  it('admin sin ramos dentista/técnico explícitos → 0', () => {
    expect(
      responsibilityAttentionBump({
        viewerRole: 'admin',
        viewerId: 'a1',
        currentResponsibility: 'dentista',
        assignedTechnicianId: null,
      }),
    ).toBe(0);
  });

  it('caso completado: sin bump aunque BD dejara turno dentista', () => {
    expect(
      responsibilityAttentionBump({
        viewerRole: 'dentista',
        viewerId: 'd1',
        currentResponsibility: 'dentista',
        assignedTechnicianId: 't1',
        caseStatus: 'completado',
      }),
    ).toBe(0);
  });

  it('caso completado: técnico asignado sin bump aunque turno técnico', () => {
    expect(
      responsibilityAttentionBump({
        viewerRole: 'tecnico',
        viewerId: 't1',
        currentResponsibility: 'tecnico',
        assignedTechnicianId: 't1',
        caseStatus: 'completado',
      }),
    ).toBe(0);
  });
});
