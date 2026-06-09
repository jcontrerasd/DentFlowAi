/**
 * Sanity check del transport EmailJS — Fase 0 del plan v5.0.
 *
 * Envía un email de prueba a la dirección configurada en TEST_EMAIL_TO
 * (default: dentflowai.oficial@gmail.com) usando la API REST de EmailJS.
 *
 * Lee credenciales de `.env.local` automáticamente vía `npx tsx`.
 *
 * Uso:
 *   cd frontend
 *   npx tsx scripts/test-emailjs.ts
 *   # o con destinatario custom:
 *   TEST_EMAIL_TO=otro@correo.com npx tsx scripts/test-emailjs.ts
 *
 * Falla con exit code 1 si:
 *   - falta alguna credencial EMAILJS_*
 *   - la API responde con status != 200
 *
 * Pasa este script ANTES de avanzar a Fase 1 del plan.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;
const TO_EMAIL = process.env.TEST_EMAIL_TO || 'dentflowai.oficial@gmail.com';

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!SERVICE_ID) fail('Falta EMAILJS_SERVICE_ID en .env.local');
if (!TEMPLATE_ID) fail('Falta EMAILJS_TEMPLATE_ID en .env.local');
if (!PUBLIC_KEY) fail('Falta EMAILJS_PUBLIC_KEY en .env.local');
if (!PRIVATE_KEY) fail('Falta EMAILJS_PRIVATE_KEY en .env.local (requerido por strict mode de EmailJS; generar en https://dashboard.emailjs.com/admin/account/security)');

const subject = '[Sanity check] EmailJS transport — DentFlowAi v5.0';
const body = `
<h2>Sanity check completado</h2>
<p>Este email confirma que el transport EmailJS está correctamente configurado y enviando correos.</p>
<ul>
  <li><strong>Service ID:</strong> ${SERVICE_ID}</li>
  <li><strong>Template ID:</strong> ${TEMPLATE_ID}</li>
  <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
</ul>
<p>Si recibiste este mensaje, la Fase 0 del plan v5.0 está validada.</p>
`.trim();

async function main() {
  console.log('→ Enviando email de prueba...');
  console.log(`  Destinatario: ${TO_EMAIL}`);
  console.log(`  Service:      ${SERVICE_ID}`);
  console.log(`  Template:     ${TEMPLATE_ID}`);
  console.log('');

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      accessToken: PRIVATE_KEY,
      template_params: { subject, to_email: TO_EMAIL, body },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    fail(`EmailJS respondió HTTP ${response.status}: ${text}`);
  }

  console.log(`✓ EmailJS respondió HTTP ${response.status}.`);
  console.log(`✓ Revisa la bandeja de ${TO_EMAIL} para confirmar la recepción.`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
