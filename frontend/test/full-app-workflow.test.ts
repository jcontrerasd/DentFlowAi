import { describe, it, expect, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  clinicalCase, caseInvitation, user, technicianSkill,
  fauchardConfig, clinicalCaseEvent, clinicalCaseDelivery, file, organization
} from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

// Server Actions reales
import { createClinicalCaseAction, submitReviewAction, approveWorkAction, resumeWorkAction } from '@/lib/db/actions/cases';
import { submitCaseToFauchardAction, submitQuoteAction, evaluateQuotesAction, sendInvitationsAction } from '@/lib/db/actions/fauchard';
import {
  acceptProposalAction,
  rejectInvitationOfferAction,
  startWorkAction,
  withdrawQuoteAction,
} from '@/lib/db/actions/proposal';
import { CASE_EVENTS } from '@/lib/constants/caseEvents';
import { forceIdentity, clearForcedIdentity } from '@/lib/db/actions/test-identity';

// ─── Mocks globales ──────────────────────────────────────────────────────────
vi.mock('next/headers', () => ({
  headers: () => new Map(),
  cookies: () => ({ get: () => undefined }),
}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/services/notifications', () => ({
  notifyUser: vi.fn().mockResolvedValue({ success: true }),
  notifyOrganizationDentists: vi.fn().mockResolvedValue({ success: true }),
}));

// ─── Constantes ──────────────────────────────────────────────────────────────
const orgId = '77777777-7777-7777-7777-777777777777';
const dentistId = 'e2e-dentist-001';
const tech1Id = 'e2e-tech-001';
const tech2Id = 'e2e-tech-002';

const mockAs = (id: string, role: string) => {
  forceIdentity({
    id, role, orgId,
    fullName: `${role} ${id}`,
    email: `${id}@e2e.cl`,
    isSimulating: false,
    isSystemAdmin: role === 'admin',
  });
};

/** Helper: Lleva un caso desde creación hasta propuestaLista */
async function createCaseAndGetProposal(caseName: string): Promise<string> {
  mockAs(dentistId, 'dentista');
  const newCase = await createClinicalCaseAction({
    internalName: caseName,
    patientIdAnon: 'PAT-' + Date.now(),
    restorationType: 'Corona Unitaria',
    teeth: [46],
    urgency: 'alta',
    needsFabrication: true,
  });
  const caseId = newCase.id;

  // Algoritmo selecciona técnicos
  await submitCaseToFauchardAction(caseId);

  // Encontrar todas las invitaciones pendientes y responderlas/expirarlas
  const invitations = await db.select().from(caseInvitation)
    .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending')));

  for (const inv of invitations) {
    if (inv.technicianId === tech1Id) {
      mockAs(tech1Id, 'tecnico');
      await submitQuoteAction(inv.id, 150000, 3, 'Oferta automatizada');
    } else {
      // Expirar las invitaciones de otros técnicos para que el algoritmo evalúe
      await db.update(caseInvitation).set({ status: 'expired', updatedAt: new Date() }).where(eq(caseInvitation.id, inv.id));
    }
  }

  // Forzar evaluación si no se disparó automáticamente
  const [check] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
  if (check.status !== 'propuestaLista') {
    await evaluateQuotesAction(caseId);
  }

  return caseId;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SETUP GLOBAL
// ═══════════════════════════════════════════════════════════════════════════════
describe('SETUP', () => {
  it('Preparar usuarios, habilidades y configuración', async () => {
    await db
      .insert(organization)
      .values({
        id: orgId,
        name: 'Organización prueba E2E DentFlowAi',
        rut: 'E2E-7777777777777777',
        type: 'clinica',
        isActive: true,
      })
      .onConflictDoUpdate({
        target: organization.id,
        set: { name: 'Organización prueba E2E DentFlowAi', isActive: true, updatedAt: new Date() },
      });

    // Limpiar invitaciones previas de técnicos de test
    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id, tech2Id]));

    // Dentista
    await db.insert(user).values({
      id: dentistId, email: 'dentista@e2e.cl', role: 'dentista',
      organizationId: orgId, isActive: true, fullName: 'Dr. E2E',
    }).onConflictDoUpdate({
      target: user.id,
      set: { isActive: true },
    });

    // Técnico
    await db.insert(user).values({
      id: tech1Id, email: 'tech1@e2e.cl', role: 'tecnico',
      organizationId: orgId, isActive: true, isAvailable: true,
      leagueLevel: 'bronce', fullName: 'Lab E2E 1', lastLoginAt: new Date(),
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

    // Habilidad
    await db.insert(technicianSkill).values({
      userId: tech1Id, workType: 'corona_posterior', designLevel: 5, fabricationLevel: 5,
    }).onConflictDoUpdate({
      target: [technicianSkill.userId, technicianSkill.workType],
      set: { designLevel: 5, fabricationLevel: 5 },
    });

    await db.insert(user).values({
      id: tech2Id, email: 'tech2@e2e.cl', role: 'tecnico',
      organizationId: orgId, isActive: true, isAvailable: true,
      leagueLevel: 'bronce', fullName: 'Lab E2E 2', lastLoginAt: new Date(),
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
      userId: tech2Id, workType: 'corona_posterior', designLevel: 5, fabricationLevel: 5,
    }).onConflictDoUpdate({
      target: [technicianSkill.userId, technicianSkill.workType],
      set: { designLevel: 5, fabricationLevel: 5 },
    });

    // Config
    const configs = await db.select().from(fauchardConfig).where(eq(fauchardConfig.isActive, true));
    expect(configs.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE A — HAPPY PATH: Creación → Entrega → Aprobación
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE A — Happy Path: Full Lifecycle', () => {
  let caseId: string;

  it('A1: Dentista crea caso con archivos STL', async () => {
    mockAs(dentistId, 'dentista');
    const newCase = await createClinicalCaseAction({
      internalName: 'E2E-HP-' + Date.now(),
      patientIdAnon: 'PAT-HP-001',
      restorationType: 'Corona Unitaria',
      teeth: [46],
      urgency: 'alta',
      needsFabrication: true,
    });
    caseId = newCase.id;
    expect(newCase.status).toBe('borrador');

    // Simular archivos STL
    await db.insert(file).values([
      { clinicalCaseId: caseId, organizationId: orgId, filename: 'bite_pieza12.stl', mimeType: 'model/stl', uploaderId: dentistId, category: 'scan_superior', size: 744612 },
      { clinicalCaseId: caseId, organizationId: orgId, filename: 'lower-scanbody.ply', mimeType: 'model/ply', uploaderId: dentistId, category: 'scan_inferior', size: 4449791 },
    ]);

    // Evento UCH de creación
    const events = await db.select().from(clinicalCaseEvent).where(eq(clinicalCaseEvent.clinicalCaseId, caseId));
    expect(events.some(e => e.action === 'CREACION' || e.action === 'CASO_CREADO')).toBe(true);
  });

  it('A2: Algoritmo clasifica e invita técnicos', async () => {
    mockAs(dentistId, 'dentista');
    const pub = await submitCaseToFauchardAction(caseId);
    expect(pub.success, pub.error ?? '').toBe(true);
    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(['enEvaluacion', 'propuestaLista']).toContain(c.status);
    expect(c.fauchardConfigId, 'caso anclado a la fila fauchard_config usada al publicar').toBeTruthy();

    const invitations = await db.select().from(caseInvitation).where(eq(caseInvitation.clinicalCaseId, caseId));
    expect(invitations.length).toBeGreaterThanOrEqual(1);
  });

  it('A3: Técnico cotiza → propuesta generada', async () => {
    // Responder nuestra invitación y expirar las demás
    const invitations = await db.select().from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending')));

    for (const inv of invitations) {
      if (inv.technicianId === tech1Id) {
        mockAs(tech1Id, 'tecnico');
        await submitQuoteAction(inv.id, 185000, 4, 'Corona posterior zirconia monolítica');
      } else {
        await db.update(caseInvitation).set({ status: 'expired' }).where(eq(caseInvitation.id, inv.id));
      }
    }

    // Forzar evaluación
    const [check] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    if (check.status !== 'propuestaLista') {
      await evaluateQuotesAction(caseId);
    }

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('propuestaLista');
    expect(c.assignedTechnicianId).toBeNull();
    const quoted = await db.select().from(caseInvitation).where(
      and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted'))
    );
    expect(quoted.length).toBeGreaterThan(0);
  });

  it('A4: Dentista acepta propuesta → aceptadaPendienteInicio', async () => {
    mockAs(dentistId, 'dentista');
    const [winInv] = await db.select({ id: caseInvitation.id }).from(caseInvitation).where(
      and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted'))
    ).limit(1);
    expect(winInv).toBeDefined();
    const res = await acceptProposalAction(caseId, winInv!.id);
    expect(res.success).toBe(true);

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('aceptadaPendienteInicio');
    expect(c.currentResponsibility).toBe('tecnico');
  });

  it('A5: Técnico inicia trabajo', async () => {
    mockAs(tech1Id, 'tecnico');
    const res = await startWorkAction(caseId);
    expect(res.success).toBe(true);

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('enEjecucion');

    const events = await db.select().from(clinicalCaseEvent).where(eq(clinicalCaseEvent.clinicalCaseId, caseId));
    expect(events.some(e => e.action === 'TRABAJO_INICIADO')).toBe(true);
  });

  it('A6: Técnico envía entrega → caso en revisión', async () => {
    mockAs(tech1Id, 'tecnico');
    const res = await submitReviewAction(caseId, 'Diseño final listo para revisión.', ['corona_46_final.stl']);
    expect(res.success).toBe(true);

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('enRevision');
    expect(c.currentResponsibility).toBe('dentista');

    const deliveries = await db.select().from(clinicalCaseDelivery).where(eq(clinicalCaseDelivery.clinicalCaseId, caseId));
    expect(deliveries.length).toBe(1);
  });

  it('A7: Dentista aprueba → diseño aprobado', async () => {
    mockAs(dentistId, 'dentista');
    const res = await approveWorkAction(caseId);
    expect(res.success).toBe(true);

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('enFabricacion');

    // Verificar trazabilidad UCH completa
    const events = await db.select().from(clinicalCaseEvent).where(eq(clinicalCaseEvent.clinicalCaseId, caseId));
    const actions = events.map(e => e.action);
    expect(actions.some(a => a === 'CREACION' || a === 'CASO_CREADO')).toBe(true);
    expect(actions).toContain('TRABAJO_INICIADO');
    expect(actions).toContain('REVISION_ENVIADA');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE B — Rechazo de propuesta
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE B — Dentist Rejects Proposal', () => {
  let caseId: string;

  it('B0: Setup limpio', async () => {
    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id, tech2Id]));
    await db
      .update(user)
      .set({ lastInvitedAt: null, consecutiveNoResponse: 0, lastLoginAt: new Date() })
      .where(eq(user.id, tech1Id));
  });

  it('B1: Crear caso y obtener propuesta', async () => {
    caseId = await createCaseAndGetProposal('E2E-REJECT-' + Date.now());
    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('propuestaLista');
  });

  it('B2: Dentista rechaza la única oferta activa', async () => {
    mockAs(dentistId, 'dentista');
    const [q] = await db.select({ id: caseInvitation.id }).from(caseInvitation).where(
      and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted'))
    ).limit(1);
    expect(q).toBeDefined();
    const res = await rejectInvitationOfferAction(caseId, q!.id, 'Precio demasiado alto para este tratamiento.');
    expect(res.success).toBe(true);
    expect('closedCase' in res && res.closedCase).toBe(true);

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('cerrado');

    const events = await db.select().from(clinicalCaseEvent).where(eq(clinicalCaseEvent.clinicalCaseId, caseId));
    expect(events.some(e => e.action === 'OFERTA_RECHAZADA')).toBe(true);
    expect(events.some(e => e.action === 'CASO_OFERTAS_TODAS_RECHAZADAS')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE E — Pre-rechazado en comparativo + aceptación de otra oferta (OFERTA_NO_SELECCIONADA)
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE E — Pre-rechazado + aceptación otra oferta', () => {
  let caseId: string;
  let loserInvId: string;
  let winnerInvId: string;

  it('E0: Setup limpio (incluye tech2 para que SUITE E sea autocontenida con -t SUITE E)', async () => {
    await db.insert(user).values({
      id: tech2Id, email: 'tech2@e2e.cl', role: 'tecnico',
      organizationId: orgId, isActive: true, isAvailable: true,
      leagueLevel: 'bronce', fullName: 'Lab E2E 2', lastLoginAt: new Date(),
    }).onConflictDoUpdate({
      target: user.id,
      set: {
        isActive: true,
        isAvailable: true,
        organizationId: orgId,
        lastInvitedAt: null,
        suspendedUntil: null,
        consecutiveNoResponse: 0,
        lastLoginAt: new Date(),
      },
    });
    await db.insert(technicianSkill).values({
      userId: tech2Id, workType: 'corona_posterior', designLevel: 5, fabricationLevel: 5,
    }).onConflictDoUpdate({
      target: [technicianSkill.userId, technicianSkill.workType],
      set: { designLevel: 5, fabricationLevel: 5 },
    });

    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id, tech2Id]));
    await db
      .update(user)
      .set({ lastInvitedAt: null, consecutiveNoResponse: 0, lastLoginAt: new Date() })
      .where(inArray(user.id, [tech1Id, tech2Id]));
  });

  it('E1: Dos cotizaciones activas en comparativo', async () => {
    mockAs(dentistId, 'dentista');
    const newCase = await createClinicalCaseAction({
      internalName: 'E2E-2QUOTES-' + Date.now(),
      patientIdAnon: 'PAT-2Q-' + Date.now(),
      restorationType: 'Corona Unitaria',
      teeth: [46],
      urgency: 'alta',
      needsFabrication: true,
    });
    caseId = newCase.id;
    const pub = await submitCaseToFauchardAction(caseId);
    expect(pub.success, pub.error ?? '').toBe(true);

    let pending = await db
      .select()
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending')));

    const [cRow] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    const fcId = cRow.fauchardConfigId;
    expect(fcId, 'caso con config Fauchard').toBeTruthy();

    mockAs(dentistId, 'dentista');
    const targetTechs = new Set([tech1Id, tech2Id]);
    if (!pending.some((p) => p.technicianId === tech2Id)) {
      const add2 = await sendInvitationsAction(caseId, [tech2Id], { fauchardConfigId: fcId! });
      expect(add2.success, add2.error ?? '').toBe(true);
    }
    if (!pending.some((p) => p.technicianId === tech1Id)) {
      const add1 = await sendInvitationsAction(caseId, [tech1Id], { fauchardConfigId: fcId! });
      expect(add1.success, add1.error ?? '').toBe(true);
    }

    pending = await db
      .select()
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending')));

    const ours = pending.filter((p) => targetTechs.has(p.technicianId));
    expect(ours.length).toBeGreaterThanOrEqual(2);

    for (const inv of pending) {
      if (targetTechs.has(inv.technicianId)) continue;
      await db.update(caseInvitation).set({ status: 'expired', updatedAt: new Date() }).where(eq(caseInvitation.id, inv.id));
    }

    pending = await db
      .select()
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending')));

    for (const inv of pending) {
      if (!targetTechs.has(inv.technicianId)) continue;
      mockAs(inv.technicianId, 'tecnico');
      await submitQuoteAction(inv.id, inv.technicianId === tech1Id ? 160000 : 155000, 4, 'Cotización E2E comparativa');
    }

    const [check] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    if (check.status !== 'propuestaLista') {
      await evaluateQuotesAction(caseId);
    }

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('propuestaLista');

    const quoted = await db
      .select()
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted')));

    const q1 = quoted.find((q) => q.technicianId === tech1Id);
    const q2 = quoted.find((q) => q.technicianId === tech2Id);
    expect(q1, 'cotización tech1').toBeTruthy();
    expect(q2, 'cotización tech2').toBeTruthy();
    loserInvId = q1!.id;
    winnerInvId = q2!.id;
  });

  it('E2: Rechazo individual a tech1 y aceptación de tech2 emite OFERTA_NO_SELECCIONADA al pre-rechazado', async () => {
    mockAs(dentistId, 'dentista');
    const rej = await rejectInvitationOfferAction(caseId, loserInvId, 'Precio elevado para el presupuesto acordado con el paciente.');
    expect(rej.success).toBe(true);

    const acc = await acceptProposalAction(caseId, winnerInvId);
    expect(acc.success).toBe(true);

    const rowEvents = await db.select().from(clinicalCaseEvent).where(eq(clinicalCaseEvent.clinicalCaseId, caseId));
    const forLoserInv = rowEvents.filter((e) => {
      const p = e.payload as { invitationId?: string; visibleTo?: string } | null;
      return p?.invitationId === loserInvId && p?.visibleTo === 'tecnico';
    });
    expect(forLoserInv.some((e) => e.action === 'OFERTA_RECHAZADA')).toBe(true);
    expect(forLoserInv.some((e) => e.action === 'OFERTA_NO_SELECCIONADA')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE C — Iteración: Dentista pide ajustes
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE C — Iteration: Request Adjustments', () => {
  let caseId: string;

  it('C0: Setup limpio', async () => {
    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id, tech2Id]));
    await db
      .update(user)
      .set({ lastInvitedAt: null, consecutiveNoResponse: 0, lastLoginAt: new Date() })
      .where(eq(user.id, tech1Id));
  });

  it('C1: Llevar caso hasta enRevision', async () => {
    caseId = await createCaseAndGetProposal('E2E-ITER-' + Date.now());

    mockAs(dentistId, 'dentista');
    const [quotedInv] = await db.select({ id: caseInvitation.id }).from(caseInvitation).where(
      and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted'))
    ).limit(1);
    await acceptProposalAction(caseId, quotedInv!.id);

    mockAs(tech1Id, 'tecnico');
    await startWorkAction(caseId);
    await submitReviewAction(caseId, 'Primera entrega — versión preliminar', ['design_v1.stl']);

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('enRevision');
  });

  it('C2: Dentista pide ajustes → técnico corrige → aprobación', async () => {
    // Dentista pide ajustes
    mockAs(dentistId, 'dentista');
    await resumeWorkAction(caseId, 'Ajustar contacto oclusal en pieza 21', true);

    const [c1] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c1.status).toBe('enEjecucion');

    // Técnico corrige
    mockAs(tech1Id, 'tecnico');
    await submitReviewAction(caseId, 'Corregido contacto oclusal.', ['design_v2.stl']);

    const [c2] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c2.status).toBe('enRevision');

    // 2 versiones de entrega
    const deliveries = await db.select().from(clinicalCaseDelivery).where(eq(clinicalCaseDelivery.clinicalCaseId, caseId));
    expect(deliveries.length).toBe(2);

    // Dentista aprueba
    mockAs(dentistId, 'dentista');
    await approveWorkAction(caseId);

    const [c3] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c3.status).toBe('enFabricacion');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE D — Seguridad y permisos
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE D — Security & Permissions', () => {
  it('D1: Dentista no puede aceptar propuesta inexistente', async () => {
    mockAs(dentistId, 'dentista');
    const res = await acceptProposalAction('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002');
    expect(res.success).toBe(false);
  });

  it('D2: Sin identidad → error de autenticación', async () => {
    clearForcedIdentity();
    const res = await acceptProposalAction('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('No autorizado');
    }
    mockAs(dentistId, 'dentista');
  });

  it('D3: Técnico no puede aceptar una propuesta', async () => {
    mockAs(tech1Id, 'tecnico');
    const res = await acceptProposalAction('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006');
    expect(res.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE G — Oferta integral desglosada (QuoteInput.split)
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE G — Oferta integral desglosada (Fase 4.2)', () => {
  let caseId: string;
  let invitationId: string;

  it('G0: Setup limpio y crear caso integral', async () => {
    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id, tech2Id]));
    await db
      .update(user)
      .set({ lastInvitedAt: null, consecutiveNoResponse: 0, lastLoginAt: new Date() })
      .where(eq(user.id, tech1Id));

    mockAs(dentistId, 'dentista');
    const newCase = await createClinicalCaseAction({
      internalName: 'E2E-INT-SPLIT-' + Date.now(),
      patientIdAnon: 'PAT-IS-' + Date.now(),
      restorationType: 'Corona Unitaria',
      teeth: [46],
      urgency: 'alta',
      needsFabrication: true,
    });
    caseId = newCase.id;
    await submitCaseToFauchardAction(caseId);

    const [pending] = await db.select().from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending'), eq(caseInvitation.technicianId, tech1Id)))
      .limit(1);
    expect(pending, 'invitación pendiente para tech1').toBeTruthy();
    invitationId = pending!.id;
  });

  it('G1: Rechaza kind:flat para integral cuando se usa la firma nueva (objeto)', async () => {
    mockAs(tech1Id, 'tecnico');
    const res = await submitQuoteAction(invitationId, {
      kind: 'flat', price: 200000, deliveryDays: 6, notes: 'No debería pasar',
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/desglose/i);
  });

  it('G2: Acepta kind:split y persiste total = suma del desglose', async () => {
    mockAs(tech1Id, 'tecnico');
    const res = await submitQuoteAction(invitationId, {
      kind: 'split',
      designPrice: 80000,
      designDays: 2,
      fabricationPrice: 120000,
      fabricationDays: 4, shippingPrice: 0, shippingDays: 0,
      notes: 'Cotización integral con desglose',
    });
    expect(res.success, (res as any).error ?? '').toBe(true);

    const [inv] = await db.select().from(caseInvitation).where(eq(caseInvitation.id, invitationId)).limit(1);
    expect(inv.status).toBe('quoted');
    expect(inv.quotedPrice).toBe(200000);
    expect(inv.quotedDays).toBe(6);
    expect(inv.quotedDesignPrice).toBe(80000);
    expect(inv.quotedDesignDays).toBe(2);
    expect(inv.quotedFabricationPrice).toBe(120000);
    expect(inv.quotedFabricationDays).toBe(4);
  });

  it('G3: Firma legacy (flat para integral) sigue funcionando por retrocompat', async () => {
    // Crear otra invitación para esta validación
    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id]));
    await db.update(user).set({ lastInvitedAt: null, consecutiveNoResponse: 0 }).where(eq(user.id, tech1Id));

    mockAs(dentistId, 'dentista');
    const newCase = await createClinicalCaseAction({
      internalName: 'E2E-INT-LEGACY-' + Date.now(),
      patientIdAnon: 'PAT-IL-' + Date.now(),
      restorationType: 'Corona Unitaria',
      teeth: [46],
      urgency: 'alta',
      needsFabrication: true,
    });
    await submitCaseToFauchardAction(newCase.id);
    const [pend] = await db.select().from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, newCase.id), eq(caseInvitation.status, 'pending'), eq(caseInvitation.technicianId, tech1Id)))
      .limit(1);

    mockAs(tech1Id, 'tecnico');
    const res = await submitQuoteAction(pend!.id, 175000, 5, 'Legacy compat');
    expect(res.success, (res as any).error ?? '').toBe(true);
    const [inv] = await db.select().from(caseInvitation).where(eq(caseInvitation.id, pend!.id)).limit(1);
    expect(inv.quotedPrice).toBe(175000);
    expect(inv.quotedDesignPrice).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE H — Retiro de oferta del técnico (withdrawQuoteAction)
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE H — Retiro de oferta del técnico (withdrawQuoteAction)', () => {
  let caseId: string;
  let invitationId: string;

  it('H0: Setup — caso integral en evaluación con cotización split', async () => {
    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id, tech2Id]));
    await db
      .update(user)
      .set({ lastInvitedAt: null, consecutiveNoResponse: 0, lastLoginAt: new Date() })
      .where(eq(user.id, tech1Id));

    mockAs(dentistId, 'dentista');
    const newCase = await createClinicalCaseAction({
      internalName: 'E2E-WITHDRAW-' + Date.now(),
      patientIdAnon: 'PAT-WD-' + Date.now(),
      restorationType: 'Corona Unitaria',
      teeth: [46],
      urgency: 'alta',
      needsFabrication: true,
    });
    caseId = newCase.id;
    await submitCaseToFauchardAction(caseId);

    const [pending] = await db
      .select()
      .from(caseInvitation)
      .where(
        and(
          eq(caseInvitation.clinicalCaseId, caseId),
          eq(caseInvitation.status, 'pending'),
          eq(caseInvitation.technicianId, tech1Id),
        ),
      )
      .limit(1);
    expect(pending, 'invitación pendiente para tech1').toBeTruthy();
    invitationId = pending!.id;

    mockAs(tech1Id, 'tecnico');
    const quoteRes = await submitQuoteAction(invitationId, {
      kind: 'split',
      designPrice: 70_000,
      designDays: 2,
      fabricationPrice: 110_000,
      fabricationDays: 5, shippingPrice: 0, shippingDays: 0,
      notes: 'Primera cotización',
    });
    expect(quoteRes.success, (quoteRes as { error?: string }).error ?? '').toBe(true);
  });

  it('H1: Retira oferta → pending, limpia campos y registra OFERTA_RETIRADA con snapshot', async () => {
    mockAs(tech1Id, 'tecnico');
    const res = await withdrawQuoteAction(invitationId);
    expect(res.success, (res as { error?: string }).error ?? '').toBe(true);

    const [inv] = await db
      .select()
      .from(caseInvitation)
      .where(eq(caseInvitation.id, invitationId))
      .limit(1);
    expect(inv.status).toBe('pending');
    expect(inv.quotedPrice).toBeNull();
    expect(inv.quotedDays).toBeNull();
    expect(inv.quotedDesignPrice).toBeNull();
    expect(inv.quotedFabricationPrice).toBeNull();
    expect(inv.respondedAt).toBeNull();
    expect(inv.techNotes).toBeNull();

    const events = await db
      .select()
      .from(clinicalCaseEvent)
      .where(eq(clinicalCaseEvent.clinicalCaseId, caseId));
    const retirada = events.find((e) => e.action === CASE_EVENTS.OFERTA_RETIRADA);
    expect(retirada, 'evento OFERTA_RETIRADA').toBeTruthy();
    const payload = retirada!.payload as Record<string, unknown>;
    expect(payload.invitationId).toBe(invitationId);
    expect(payload.visibleTo).toBe('tecnico');
    expect(payload.quotedPrice).toBe(180_000);
    expect(payload.quotedDesignPrice).toBe(70_000);
    expect(payload.quotedFabricationPrice).toBe(110_000);
    expect(payload.techNotes).toBe('Primera cotización');
  });

  it('H2: No permite retirar dos veces (ya está pending)', async () => {
    mockAs(tech1Id, 'tecnico');
    const res = await withdrawQuoteAction(invitationId);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/ya enviaste/i);
  });

  it('H3: Recotiza tras retiro con nuevo desglose', async () => {
    mockAs(tech1Id, 'tecnico');
    const res = await submitQuoteAction(invitationId, {
      kind: 'split',
      designPrice: 90_000,
      designDays: 3,
      fabricationPrice: 100_000,
      fabricationDays: 4, shippingPrice: 0, shippingDays: 0,
      notes: 'Segunda cotización',
    });
    expect(res.success, (res as { error?: string }).error ?? '').toBe(true);

    const [inv] = await db
      .select()
      .from(caseInvitation)
      .where(eq(caseInvitation.id, invitationId))
      .limit(1);
    expect(inv.status).toBe('quoted');
    expect(inv.quotedPrice).toBe(190_000);
    expect(inv.quotedDesignPrice).toBe(90_000);
    expect(inv.quotedFabricationPrice).toBe(100_000);
    expect(inv.techNotes).toBe('Segunda cotización');
  });

  it('H4: Dentista no puede retirar la oferta del técnico', async () => {
    mockAs(dentistId, 'dentista');
    const res = await withdrawQuoteAction(invitationId);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/autorizado|No autorizado/i);
  });
});

describe('SUITE H-bis — Retiro en propuestaLista', () => {
  it('H5: Tras propuestaLista el técnico puede retirar y deja de estar quoted', async () => {
    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id, tech2Id]));
    await db
      .update(user)
      .set({ lastInvitedAt: null, consecutiveNoResponse: 0, lastLoginAt: new Date() })
      .where(eq(user.id, tech1Id));

    mockAs(dentistId, 'dentista');
    const newCase = await createClinicalCaseAction({
      internalName: 'E2E-WITHDRAW-PL-' + Date.now(),
      patientIdAnon: 'PAT-WDPL-' + Date.now(),
      restorationType: 'Corona Unitaria',
      teeth: [46],
      urgency: 'alta',
      needsFabrication: true,
    });
    const plCaseId = newCase.id;
    await submitCaseToFauchardAction(plCaseId);

    const invitations = await db
      .select()
      .from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, plCaseId), eq(caseInvitation.status, 'pending')));

    let tech1InvId: string | null = null;
    for (const inv of invitations) {
      if (inv.technicianId === tech1Id) {
        tech1InvId = inv.id;
        mockAs(tech1Id, 'tecnico');
        await submitQuoteAction(inv.id, 160_000, 4, 'Oferta comparativo E2E');
      } else {
        await db
          .update(caseInvitation)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(caseInvitation.id, inv.id));
      }
    }
    expect(tech1InvId, 'invitación tech1 para cotizar').toBeTruthy();

    const [beforeEval] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, plCaseId)).limit(1);
    if (beforeEval.status !== 'propuestaLista') {
      await evaluateQuotesAction(plCaseId);
    }

    const [cCase] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, plCaseId)).limit(1);
    expect(cCase.status).toBe('propuestaLista');

    const [quoted] = await db
      .select()
      .from(caseInvitation)
      .where(
        and(
          eq(caseInvitation.clinicalCaseId, plCaseId),
          eq(caseInvitation.technicianId, tech1Id),
          eq(caseInvitation.status, 'quoted'),
        ),
      )
      .limit(1);
    expect(quoted, 'tech1 cotizado en comparativo').toBeTruthy();

    mockAs(tech1Id, 'tecnico');
    const res = await withdrawQuoteAction(quoted!.id);
    expect(res.success, (res as { error?: string }).error ?? '').toBe(true);

    const [inv] = await db
      .select()
      .from(caseInvitation)
      .where(eq(caseInvitation.id, quoted!.id))
      .limit(1);
    expect(inv.status).toBe('pending');

    const stillQuoted = await db
      .select({ id: caseInvitation.id })
      .from(caseInvitation)
      .where(
        and(eq(caseInvitation.clinicalCaseId, plCaseId), eq(caseInvitation.id, quoted!.id), eq(caseInvitation.status, 'quoted')),
      );
    expect(stillQuoted).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE F — Solo diseño cierra en `completado`
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE F — Solo diseño cierra en completado', () => {
  let caseId: string;

  it('F0: Setup limpio', async () => {
    await db.delete(caseInvitation).where(inArray(caseInvitation.technicianId, [tech1Id, tech2Id]));
    await db
      .update(user)
      .set({ lastInvitedAt: null, consecutiveNoResponse: 0, lastLoginAt: new Date() })
      .where(eq(user.id, tech1Id));
  });

  it('F1: Crear caso solo_diseno (needsFabrication=false) y llevar a enRevision', async () => {
    mockAs(dentistId, 'dentista');
    const newCase = await createClinicalCaseAction({
      internalName: 'E2E-SOLO-DIS-' + Date.now(),
      patientIdAnon: 'PAT-SD-' + Date.now(),
      restorationType: 'Corona Unitaria',
      teeth: [46],
      urgency: 'alta',
      needsFabrication: false,
    });
    caseId = newCase.id;

    await submitCaseToFauchardAction(caseId);

    const invitations = await db.select().from(caseInvitation)
      .where(and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'pending')));
    for (const inv of invitations) {
      if (inv.technicianId === tech1Id) {
        mockAs(tech1Id, 'tecnico');
        await submitQuoteAction(inv.id, 120000, 3, 'Oferta solo diseño');
      } else {
        await db.update(caseInvitation).set({ status: 'expired' }).where(eq(caseInvitation.id, inv.id));
      }
    }
    const [check] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    if (check.status !== 'propuestaLista') {
      await evaluateQuotesAction(caseId);
    }

    mockAs(dentistId, 'dentista');
    const [winInv] = await db.select({ id: caseInvitation.id }).from(caseInvitation).where(
      and(eq(caseInvitation.clinicalCaseId, caseId), eq(caseInvitation.status, 'quoted'))
    ).limit(1);
    await acceptProposalAction(caseId, winInv!.id);

    mockAs(tech1Id, 'tecnico');
    await startWorkAction(caseId);
    await submitReviewAction(caseId, 'Diseño listo.', ['design_solo.stl']);

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('enRevision');
    expect(c.serviceType).toBe('solo_diseno');
  });

  it('F2: Dentista aprueba → caso completado (no se queda en disenoAprobado)', async () => {
    mockAs(dentistId, 'dentista');
    const res = await approveWorkAction(caseId);
    expect(res.success).toBe(true);

    const [c] = await db.select().from(clinicalCase).where(eq(clinicalCase.id, caseId)).limit(1);
    expect(c.status).toBe('completado');
    expect(c.completedAt).not.toBeNull();
    expect(c.currentResponsibility).toBeNull();
  });

  it('F3: Evento UCH TRABAJO_APROBADO con stateChange a completado', async () => {
    const events = await db.select().from(clinicalCaseEvent).where(eq(clinicalCaseEvent.clinicalCaseId, caseId));
    const approval = events.find(e => e.action === 'TRABAJO_APROBADO');
    expect(approval).toBeDefined();
    const stateChange = approval!.stateChange as { from?: string; to?: string } | null;
    expect(stateChange?.to).toBe('completado');
    expect(typeof approval!.content === 'string' && approval!.content.includes('completado')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SUITE E — Auditoría: Trazabilidad completa
// ═══════════════════════════════════════════════════════════════════════════════
describe('SUITE E — Audit Trail', () => {
  it('E1: Todo caso tiene trazabilidad completa en clinical_case_event', async () => {
    const cases = await db.select().from(clinicalCase).where(eq(clinicalCase.doctorId, dentistId));
    const hpCase = cases.find(c => c.internalName?.startsWith('E2E-HP-'));
    if (!hpCase) return;

    const events = await db.select().from(clinicalCaseEvent).where(eq(clinicalCaseEvent.clinicalCaseId, hpCase.id));
    expect(events.length).toBeGreaterThanOrEqual(5);

    for (const ev of events) {
      expect(ev.userId).toBeDefined();
      expect(ev.type).toBeDefined();
      expect(ev.action).toBeDefined();
    }
  });
});
