import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import bcrypt from 'bcryptjs';

async function seed() {
  const { db } = await import('../lib/db');
  const { user, organization, technicianSkill, fauchardConfig } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  console.log('--- Iniciando Seed de UAT ---');

  const now = new Date();
  const hashedPassword = await bcrypt.hash('dentflow123', 10);

  // 1. Crear Organización de Prueba
  const orgId = '77777777-7777-7777-7777-777777777777';
  try {
    await db.insert(organization).values({
      id: orgId,
      name: 'Clínica UAT DentFlow',
      rut: '77.777.777-7',
      type: 'clinica',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    console.log('Organización verificada/creada');
  } catch (e) {
    console.log('Org ya existía o error leve');
  }

  // 2. Crear Dentista (Uploader)
  const dentistId = 'dentist-uat-001';
  await db.insert(user).values({
    id: dentistId,
    email: 'dentist@uat.com',
    fullName: 'Dr. Smith (UAT)',
    role: 'dentista',
    organizationId: orgId,
    isActive: true,
    isAvailable: true,
    hashedPassword,
    onboardingStep: 100,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [user.id],
    set: { hashedPassword, onboardingStep: 100, updatedAt: now }
  });
  console.log('Dentista verificado/creado');

  // 3. Crear Técnicos
  const techs = [
    { id: 'tech-oro-001', name: 'Lab Oro A', league: 'oro', skill: 'corona_posterior', level: 6 },
    { id: 'tech-plata-001', name: 'Lab Plata B', league: 'plata', skill: 'puente_3u', level: 4 },
    { id: 'tech-bronce-001', name: 'Lab Bronce C', league: 'bronce', skill: 'corona_posterior', level: 2 },
  ];

  for (const t of techs) {
    await db.insert(user).values({
      id: t.id,
      email: `${t.id}@uat.com`,
      fullName: t.name,
      role: 'tecnico',
      organizationId: orgId,
      leagueLevel: t.league,
      isActive: true,
      isAvailable: true,
      hashedPassword,
      onboardingStep: 100,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [user.id],
      set: { hashedPassword, onboardingStep: 100, updatedAt: now }
    });

    await db.insert(technicianSkill).values({
      userId: t.id,
      workType: t.skill,
      designLevel: t.level,
      fabricationLevel: t.level,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }
  console.log('Técnicos verificados/creados');

  // 4. Config Algorithm
  const [config] = await db.select().from(fauchardConfig).where(eq(fauchardConfig.isActive, true)).limit(1);
  if (!config) {
    await db.insert(fauchardConfig).values({
      isActive: true,
      alphaQuality: '0.250',
      alphaPunctuality: '0.200',
      alphaExperience: '0.200',
      alphaLoad: '0.200',
      alphaBonus: '0.150',
      nInvited: 3,
      tQuoteMinutes: 60,
      tProposalHours: 2,
      platformFee: '0.1500',
      createdAt: now,
      updatedAt: now,
    });
    console.log('Configuración de algoritmo creada');
  }

  console.log('--- Seed de UAT Finalizado con Éxito ---');
  process.exit(0);
}

seed().catch(err => {
  console.error('Error in seed:', err);
  process.exit(1);
});
