/**
 * Seed dedicado para la DEMO del flujo completo + funnel Fauchard.
 *
 * Crea (idempotente):
 *  - 1 organización de demo
 *  - 1 dentista (con dirección, para el badge de ubicación en casos integrales)
 *  - 10 técnicos `tecnico_prueba1..10@test1.cl` (password `dent2026`), liga bronce,
 *    con habilidad `corona_posterior` (design/fab variados) y disponibilidad
 *    CAD ∧ CAM en la categoría coronas → elegibles para un caso integral BÁSICO.
 *  - Ajusta la config Fauchard activa: nInvited=5, tQuoteMinutes=240 (ventana holgada
 *    para cotizar en vivo sin que expiren las invitaciones).
 *
 * Uso:  cd frontend && npx tsx scripts/seed-demo-tecnicos.ts
 *
 * Requiere `.env.local` apuntando a la DB (local Docker por defecto).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import bcrypt from 'bcryptjs';

// Técnicos de la demo: design/fab variados para que el score y las probabilidades
// difieran de forma visible en el funnel. Todos ≥1 (cumple MIN_SKILL_FOR_CATEGORY['bronce']=1).
const TECHS = [
  { n: 1, design: 7, fab: 7 },
  { n: 2, design: 6, fab: 6 },
  { n: 3, design: 5, fab: 5 },
  { n: 4, design: 4, fab: 4 },
  { n: 5, design: 3, fab: 3 },
  { n: 6, design: 6, fab: 5 },
  { n: 7, design: 5, fab: 4 },
  { n: 8, design: 2, fab: 2 },
  { n: 9, design: 4, fab: 3 },
  { n: 10, design: 7, fab: 6 },
];

const WORK_TYPE = 'corona_posterior'; // restauración "Corona Unitaria" → corona_posterior
const ORG_ID = '88888888-8888-8888-8888-888888888888';
const DENTIST_ID = 'dentista_prueba';

async function seed() {
  const { db } = await import('../lib/db');
  const { user, organization, technicianSkill, technicianAvailability, fauchardConfig } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  console.log('--- Seed DEMO Fauchard (10 técnicos + dentista) ---');

  const now = new Date();
  const hashedPassword = await bcrypt.hash('dent2026', 10);

  // 1. Organización de demo
  await db.insert(organization).values({
    id: ORG_ID,
    name: 'Clínica Demo DentFlow',
    rut: '88.888.888-8',
    type: 'clinica',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  console.log('Organización de demo verificada/creada');

  // 2. Dentista de demo (con dirección → badge de ubicación en casos integrales)
  await db.insert(user).values({
    id: DENTIST_ID,
    email: 'dentista_prueba@test1.cl',
    fullName: 'Dra. Demo (Prueba)',
    role: 'dentista',
    organizationId: ORG_ID,
    isActive: true,
    isAvailable: true,
    hashedPassword,
    onboardingStep: 100,
    country: 'CL',
    region: 'CL-RM',
    comuna: 'CL-RM-PRO',
    address: 'Av. Providencia',
    addressNumber: '1234',
    addressOffice: '501',
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [user.id],
    set: { hashedPassword, onboardingStep: 100, updatedAt: now },
  });
  console.log('Dentista de demo verificado/creado');

  // 3. Técnicos + habilidad + disponibilidad CAD∧CAM
  for (const t of TECHS) {
    const id = `tecnico_prueba${t.n}`;
    const email = `tecnico_prueba${t.n}@test1.cl`;

    await db.insert(user).values({
      id,
      email,
      fullName: `Técnico Prueba ${t.n}`,
      role: 'tecnico',
      organizationId: ORG_ID,
      leagueLevel: 'bronce',
      isActive: true,
      isAvailable: true,
      hashedPassword,
      onboardingStep: 100,
      country: 'CL',
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [user.id],
      set: { hashedPassword, onboardingStep: 100, isAvailable: true, leagueLevel: 'bronce', updatedAt: now },
    });

    // Habilidad en corona_posterior (design/fab variados)
    await db.insert(technicianSkill).values({
      userId: id,
      workType: WORK_TYPE,
      designLevel: t.design,
      fabricationLevel: t.fab,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [technicianSkill.userId, technicianSkill.workType],
      set: { designLevel: t.design, fabricationLevel: t.fab, updatedAt: now },
    });

    // Disponibilidad: caso integral exige CAD ∧ CAM (level_cad/level_cam vienen false
    // por defecto → hay que activarlos explícitamente). cat_coronas_* ya vienen en true.
    await db.insert(technicianAvailability).values({
      userId: id,
      levelGlobal: true,
      levelCad: true,
      levelCam: true,
      catCoronasCad: true,
      catCoronasCam: true,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [technicianAvailability.userId],
      set: { levelGlobal: true, levelCad: true, levelCam: true, catCoronasCad: true, catCoronasCam: true, updatedAt: now },
    });
  }
  console.log(`${TECHS.length} técnicos (skill + disponibilidad CAD∧CAM) verificados/creados`);

  // 4. Config Fauchard activa: nInvited=5 + ventana de cotización holgada (240 min)
  const [config] = await db.select().from(fauchardConfig).where(eq(fauchardConfig.isActive, true)).limit(1);
  if (config) {
    await db.update(fauchardConfig)
      .set({ nInvited: 5, tQuoteMinutes: 240, updatedAt: now })
      .where(eq(fauchardConfig.id, config.id));
    console.log('Config Fauchard activa ajustada (nInvited=5, tQuoteMinutes=240)');
  } else {
    await db.insert(fauchardConfig).values({
      isActive: true,
      alphaQuality: '0.250',
      alphaPunctuality: '0.200',
      alphaExperience: '0.200',
      alphaLoad: '0.200',
      alphaBonus: '0.150',
      nInvited: 5,
      tQuoteMinutes: 240,
      tProposalHours: 2,
      platformFee: '0.1500',
      createdAt: now,
      updatedAt: now,
    });
    console.log('Config Fauchard creada (nInvited=5, tQuoteMinutes=240)');
  }

  console.log('--- Seed DEMO finalizado con éxito ---');
  console.log('Login: dentista_prueba@test1.cl / dent2026 · tecnico_prueba1..10@test1.cl / dent2026');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed-demo-tecnicos:', err);
  process.exit(1);
});
