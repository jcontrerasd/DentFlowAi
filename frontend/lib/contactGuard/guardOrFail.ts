import { db } from '@/lib/db';
import { contactGuardAudit } from '@/lib/db/schema';
import { checkContactExposure, type GuardViolation } from './index';

export const CONTACT_GUARD_BLOCK_MESSAGE =
  'Fauchard detectó un intento de comunicación indebido. El mensaje debe cambiar; de lo contrario no podrá ser enviado. Fauchard ha registrado este evento en su historial.';

// Helpers de detección (prefix + isContactGuardError) se exportan desde
// './clientHelpers' para que Client Components puedan importarlos sin arrastrar
// dependencias de DB.
export { CONTACT_GUARD_USER_PREFIX, isContactGuardError } from './clientHelpers';

/**
 * Mapa de nombre técnico de campo → label visible al usuario.
 * Mantener sincronizado con los `field:` que pasan las server actions a guardTextOrFail.
 */
const FIELD_LABELS: Record<string, string> = {
  // cases.ts — createClinicalCaseAction
  doctorNotes: 'Instrucciones especiales',
  specialInstructions: 'Instrucciones especiales',
  notesEsthetic: 'Detalle estético',
  notesOclusal: 'Notas oclusales',
  // cases.ts — registerDispatchAction
  dispatchCourier: 'Courier',
  dispatchTracking: 'Número de seguimiento',
  // cases.ts — comentarios de entrega/revisión/cambios de flujo
  deliveryNotes: 'Notas de la entrega',
  revisionReason: 'Motivo de revisión',
  resumeComment: 'Comentario al reanudar',
  flowChangeReason: 'Motivo del cambio de flujo',
  // fauchard.ts / proposal.ts — interacción técnico ↔ dentista
  techNotes: 'Notas del técnico',
  dentistRejectionFeedback: 'Motivo del rechazo',
};

/**
 * Etiqueta amigable para cada regla ContactGuard (qué tipo de contenido se detectó).
 */
const RULE_LABELS: Record<string, string> = {
  email: 'una dirección de correo',
  telefono_cl_intl: 'un número de teléfono chileno',
  telefono_8plus_digitos: 'un número de teléfono (8+ dígitos)',
  url_http: 'un enlace web (http/https)',
  url_shortener: 'un enlace acortado',
  dominio_explicito: 'un dominio (ej. ejemplo.com)',
  handle_arroba: 'un usuario de red social (@usuario)',
  whatsapp: 'mención de WhatsApp',
  wsp: 'mención de WhatsApp (wsp)',
  wassap: 'mención de WhatsApp (wassap)',
  guasap: 'mención de WhatsApp (guasap)',
  telegram: 'mención de Telegram',
  signal: 'mención de Signal',
  instagram: 'mención de Instagram',
  fuera_plataforma: 'intento de operar fuera de la plataforma',
  por_fuera: 'intento de operar por fuera',
  directo_conmigo: 'intento de contacto directo',
  llamame: 'invitación a llamar',
  mi_numero: 'mención de un número personal',
  mi_celular: 'mención de un celular personal',
  escribeme: 'invitación a escribir por fuera',
  contactame: 'invitación a contactar por fuera',
};

function labelForField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function labelForRule(ruleName: string): string {
  return RULE_LABELS[ruleName] ?? ruleName;
}

/**
 * Construye el mensaje legible al usuario sin tocar DB (usado por la action
 * principal y por el precheck ligero del cliente).
 */
export function buildContactGuardUserMessage(
  field: string,
  violations: { ruleName: string; matchedText: string }[],
): string {
  const fieldLabel = labelForField(field);
  const uniqueRules = Array.from(new Map(violations.map(v => [v.ruleName, v])).values());
  const detailsHuman = uniqueRules
    .map(v => `${labelForRule(v.ruleName)} ("${v.matchedText}")`)
    .join(', ');
  return (
    `Detectamos contenido no permitido en el campo «${fieldLabel}»: ${detailsHuman}. ` +
    `Edita ese campo y vuelve a intentarlo. Este intento quedó registrado.`
  );
}

export type GuardIdentity = {
  id: string;
  orgId?: string | null;
  role?: string | null;
};

export type GuardFieldInput = {
  text: string | null | undefined;
  field: string;
};

export type GuardCallOptions = {
  actionName: string;
  caseId?: string | null;
  identity: GuardIdentity | null | undefined;
  fields: GuardFieldInput[];
};

/**
 * Valida 1..N campos de texto libre. Si alguno contiene contacto prohibido,
 * registra un evento en contact_guard_audit y devuelve { ok:false, error }.
 * Si pasan todos, devuelve { ok:true }.
 */
export async function guardTextOrFail(
  opts: GuardCallOptions,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!opts.identity?.id) return { ok: true };

  for (const f of opts.fields) {
    if (!f.text || !f.text.trim()) continue;
    const result = await checkContactExposure(f.text, {
      field: f.field,
      allowCourierUrls: f.field === 'dispatchTracking',
    });
    if (result.ok) continue;

    try {
      await db.insert(contactGuardAudit).values({
        userId: opts.identity.id,
        orgId: opts.identity.orgId ?? null,
        userRole: opts.identity.role ?? null,
        clinicalCaseId: opts.caseId ?? null,
        fieldName: f.field,
        actionName: opts.actionName,
        originalText: f.text,
        normalizedText: result.normalized,
        violatedRules: result.violations satisfies GuardViolation[],
      });
    } catch (e) {
      console.error('[ContactGuard] Error registrando auditoría:', e);
    }

    const userMessage = buildContactGuardUserMessage(f.field, result.violations);
    const uniqueRules = Array.from(
      new Map(result.violations.map(v => [v.ruleName, v])).values(),
    );

    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[ContactGuard] BLOCK action=${opts.actionName} field=${f.field} text=${JSON.stringify(f.text)} normalized=${JSON.stringify(result.normalized)} rules=${uniqueRules.map(v => v.ruleName).join(',')}`,
      );
    }

    return { ok: false, error: userMessage };
  }

  return { ok: true };
}
