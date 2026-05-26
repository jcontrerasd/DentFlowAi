import { describe, it, expect, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  clinicalCase,
  caseInvitation,
  user,
  technicianSkill,
  fauchardConfig,
  organization,
  file,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createClinicalCaseAction } from '@/lib/db/actions/cases';
import {
  submitCaseToFauchardAction,
  submitQuoteAction,
  evaluateQuotesAction,
  sendInvitationsAction,
} from '@/lib/db/actions/fauchard';
import { acceptProposalAction, startWorkAction } from '@/lib/db/actions/proposal';
import { forceIdentity } from '@/lib/db/actions/test-identity';

vi.mock('next/headers', () => ({
  headers: () => new Map(),
  cookies: () => ({ get: () => undefined }),
}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn().mockResolvedValue({ success: true }),
  notifyOrganizationDentists: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Orchestration simulation (cotización comparativa)', () => {
  const dentistId = 'dentist-uat-001';
  const techId = 'tech-uat-001';
  const orgId = '77777777-7777-7777-7777-777777777777';

  let testCaseId: string;

  it('Setup técnico y config', async () => {
    await db
      .insert(organization)
      .values({
        id: orgId,
        name: 'Organización prueba UAT DentFlowAi',
        rut: 'UAT-7777777777777777',
        type: 'clinica',
        isActive: true,
      })
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: 'Organización prueba UAT DentFlowAi', isActive: true, updatedAt: new Date() },
      });

    await db.delete(caseInvitation).where(eq(caseInvitation.technicianId, techId));

    await db.insert(user).values({
      id: dentistId,
      email: 'dentist-uat@test.cl',
      fullName: 'Dentista UAT',
      role: 'dentista',
      isActive: true,
      organizationId: orgId,
    }).onConflictDoUpdate({
      target: user.id,
      set: { isActive: true, organizationId: orgId },
    });

    await db.insert(user).values({
      id: techId,
      email: 'tech@uat.cl',
      fullName: 'Tecnico UAT',
      role: 'tecnico',
      isActive: true,
      isAvailable: true,
      leagueLevel: 'bronce',
      organizationId: orgId,
      lastLoginAt: new Date(),
    }).onConflictDoUpdate({
      target: user.id,
      set: {
        isActive: true,
        isAvailable: true,
        lastInvitedAt: null,
        suspendedUntil: null,
        consecutiveNoResponse: 0,
        lastLoginAt: new Date(),
      },
    });

    await db.insert(technicianSkill).values({
      userId: techId,
      workType: 'corona_posterior',
      designLevel: 5,
      fabricationLevel: 5,
    }).onConflictDoUpdate({
      target: [technicianSkill.userId, technicianSkill.workType],
      set: { designLevel: 5, fabricationLevel: 5 },
    });

    const [activeConfig] = await db
      .select()
      .from(fauchardConfig)
      .where(eq(fauchardConfig.isActive, true))
      .limit(1);

    if (activeConfig) {
      await db
        .update(fauchardConfig)
        .set({
          nInvited: 3,
          nFloor: 1,
          tQuoteMinutes: 90,
          tProposalHours: 2,
          updatedAt: new Date(),
        })
        .where(eq(fauchardConfig.id, activeConfig.id));
    } else {
      await db.insert(fauchardConfig).values({
        isActive: true,
        nInvited: 3,
        nFloor: 1,
        tQuoteMinutes: 90,
        tProposalHours: 2,
      });
    }
  });

  it('Crea borrador', async () => {
    forceIdentity({
      id: dentistId,
      role: 'dentista',
      orgId,
      fullName: `User ${dentistId}`,
      email: `${dentistId}@test.com`,
      isSimulating: false,
      isSystemAdmin: false,
    });

    const newCase = await createClinicalCaseAction({
      internalName: 'Simulación UAT - ' + Date.now(),
      patientIdAnon: 'PAT-SIM-001',
      restorationType: 'Corona Unitaria',
      teeth: [11],
      urgency: 'alta',
      needsFabrication: true,
    });
    expect(newCase.status).toBe('borrador');
    testCaseId = newCase.id;

    await db.insert(file).values([
      {
        clinicalCaseId: testCaseId,
        organizationId: orgId,
        filename: 'bite_uat.stl',
        mimeType: 'model/stl',
        uploaderId: dentistId,
        category: 'scan_superior',
        size: 100_000,
      },
      {
        clinicalCaseId: testCaseId,
        organizationId: orgId,
        filename: 'lower_uat.ply',
        mimeType: 'model/ply',
        uploaderId: dentistId,
        category: 'scan_inferior',
        size: 200_000,
      },
    ]);
  });

  it('Ejecuta Fauchard desde borrador → invita', async () => {
    forceIdentity({
      id: dentistId,
      role: 'dentista',
      orgId,
      fullName: `User ${dentistId}`,
      email: `${dentistId}@test.com`,
      isSimulating: false,
      isSystemAdmin: false,
    });

    const res = await submitCaseToFauchardAction(testCaseId);
    expect(res.success, res.error ?? '').toBe(true);
    const [updatedCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, testCaseId)).limit(1);
    expect(updatedCase.internalStatus === 'cotizacionesAbiertas' || updatedCase.status === 'enEvaluacion').toBeTruthy();

    const invitations = await db
      .select()
      .from(caseInvitation)
      .where(eq(caseInvitation.clinicalCaseId, testCaseId));
    expect(invitations.length).toBeGreaterThanOrEqual(1);

    if (!invitations.some((inv) => inv.technicianId === techId) && updatedCase.fauchardConfigId) {
      const add = await sendInvitationsAction(testCaseId, [techId], {
        fauchardConfigId: updatedCase.fauchardConfigId,
      });
      expect(add.success, add.error ?? '').toBe(true);
    }
  });

  it('Técnico cotiza y se abre comparativo dental', async () => {
    forceIdentity({
      id: techId,
      role: 'tecnico',
      orgId,
      fullName: 'Tech',
      email: `${techId}@test.com`,
      isSimulating: false,
      isSystemAdmin: false,
    });

    const [invitation] = await db
      .select()
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, testCaseId), eq(caseInvitation.technicianId, techId)))
      .limit(1);
    expect(invitation).toBeDefined();

    const quoteRes = await submitQuoteAction(invitation!.id, 150000, 3, 'Mi oferta UAT');
    expect(quoteRes.success).toBe(true);

    const stillPending = await db
      .select()
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, testCaseId), eq(caseInvitation.status, 'pending')));
    for (const p of stillPending) {
      await db.update(caseInvitation).set({ status: 'expired', updatedAt: new Date() }).where(eq(caseInvitation.id, p.id));
    }
    await evaluateQuotesAction(testCaseId);

    const [caseAfter] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, testCaseId)).limit(1);
    expect(caseAfter.status).toBe('propuestaLista');
    expect(caseAfter.assignedTechnicianId).toBeNull();
  });

  it('Dentista acepta oferta cotizada → técnico confirma inicio', async () => {
    forceIdentity({
      id: dentistId,
      role: 'dentista',
      orgId,
      fullName: `User ${dentistId}`,
      email: `${dentistId}@test.com`,
      isSimulating: false,
      isSystemAdmin: false,
    });

    const [winnerInv] = await db
      .select()
      .from(caseInvitation)
      .where(
        and(
          eq(caseInvitation.clinicalCaseId, testCaseId),
          eq(caseInvitation.status, 'quoted'),
          eq(caseInvitation.technicianId, techId),
        ),
      )
      .limit(1);

    expect(winnerInv).toBeDefined();
    const accept = await acceptProposalAction(testCaseId, winnerInv!.id);
    expect(accept.success).toBe(true);

    const [caseMid] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, testCaseId)).limit(1);
    expect(caseMid.status).toBe('aceptadaPendienteInicio');

    forceIdentity({
      id: techId,
      role: 'tecnico',
      orgId,
      fullName: 'Tech',
      email: `${techId}@test.com`,
      isSimulating: false,
      isSystemAdmin: false,
    });
    await startWorkAction(testCaseId);
    const [finalCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, testCaseId)).limit(1);
    expect(finalCase.status).toBe('enEjecucion');
  });
});
