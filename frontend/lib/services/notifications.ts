import { db } from "@/lib/db";
import { user, clinicalCase } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { pushEmailPreview } from "@/lib/services/emailPreviewBuffer";

// ─── Transport: EmailJS (API REST server-side) ───────────────────────────────
// Reemplaza Resend (v5.0 / Fase 2). Las 3+1 credenciales son server-only (sin
// prefijo NEXT_PUBLIC_). Si las credenciales faltan o son 'stub', se loguea sin
// enviar (modo dev local). Best-effort: nunca reintenta ni bloquea la acción.

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

function emailJsConfig() {
  return {
    serviceId: process.env.EMAILJS_SERVICE_ID,
    templateId: process.env.EMAILJS_TEMPLATE_ID,
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY,
  };
}

function isStubMode(cfg: ReturnType<typeof emailJsConfig>): boolean {
  const required = [cfg.serviceId, cfg.templateId, cfg.publicKey];
  return required.some((v) => !v || v === 'stub');
}

/**
 * Interruptor maestro de envío real (seguridad por ambiente). Solo se envían correos
 * de verdad si `NOTIFICATIONS_LIVE === 'true'`. En cualquier otro caso (local, o
 * staging con datos clonados de prod) se loguea sin enviar, **aunque** haya
 * credenciales EmailJS válidas. Evita mandar correos a usuarios reales desde
 * ambientes que no son producción.
 */
function notificationsLive(): boolean {
  return process.env.NOTIFICATIONS_LIVE === 'true';
}

/**
 * Envía un correo vía la API REST de EmailJS. Mantiene el contrato del template
 * `te60drn` / `template_DentFlowAi`: `{{subject}}`, `{{to_email}}`, `{{body}}`.
 */
async function sendViaEmailJS(
  params: { subject: string; toEmail: string; body: string },
  /** Si true, ignora NOTIFICATIONS_LIVE y envía siempre que haya credenciales (p. ej. correos legalmente obligatorios). */
  force = false,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = emailJsConfig();
  if (isStubMode(cfg)) {
    console.log(`[STUB-EMAIL] (sin credenciales) To: ${params.toEmail} | Subject: ${params.subject}`);
    return { ok: true };
  }
  if (!force && !notificationsLive()) {
    console.log(`[STUB-EMAIL] (NOTIFICATIONS_LIVE!=true) To: ${params.toEmail} | Subject: ${params.subject}`);
    return { ok: true };
  }

  // Redirige todos los correos a EMAIL_OVERRIDE_TO cuando está definido (útil en local/dev
  // para recibir correos de usuarios de prueba en un inbox real). El asunto incluye el
  // destinatario original para distinguir de quién es cada correo.
  const overrideTo = process.env.EMAIL_OVERRIDE_TO;
  const effectiveEmail = overrideTo || params.toEmail;
  const effectiveSubject = overrideTo
    ? `[→ ${params.toEmail}] ${params.subject}`
    : params.subject;

  try {
    const response = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: cfg.serviceId,
        template_id: cfg.templateId,
        user_id: cfg.publicKey,
        accessToken: cfg.privateKey,
        template_params: { subject: effectiveSubject, to_email: effectiveEmail, body: params.body },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[EmailJS] HTTP ${response.status}: ${text}`);
      return { ok: false, error: `EmailJS HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    console.error('[EmailJS] Error de red:', error);
    return { ok: false, error: String(error) };
  }
}

/**
 * Fase 3/3.5 (ajuste login): envío de emails transaccionales de cuenta (verificación,
 * reset de contraseña) — NO pasa por `notifyUser()` ni por `notificationsLive()`. Esos
 * emails son de negocio (asignaciones, revisiones) y por diseño se silencian fuera de
 * producción para no spamear con datos clonados; verificación/reset son distintos: el
 * usuario los necesita para poder operar su cuenta. Reusa exactamente las mismas
 * credenciales EmailJS (`emailJsConfig()`) — el único gate que se mantiene es la falta
 * de credenciales (`isStubMode`), que es un fallback técnico, no un flag de producto.
 */
export async function sendCriticalAuthEmail(params: { toEmail: string; subject: string; body: string }): Promise<{ ok: boolean; error?: string }> {
  pushEmailPreview({ to: params.toEmail, subject: params.subject, body: params.body, type: 'AUTH_CRITICAL' });

  const cfg = emailJsConfig();
  if (isStubMode(cfg)) {
    console.log(`[STUB-EMAIL] (sin credenciales) To: ${params.toEmail} | Subject: ${params.subject}`);
    return { ok: true };
  }

  try {
    const response = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: cfg.serviceId,
        template_id: cfg.templateId,
        user_id: cfg.publicKey,
        accessToken: cfg.privateKey,
        template_params: { subject: params.subject, to_email: params.toEmail, body: params.body },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[EmailJS] HTTP ${response.status}: ${text}`);
      return { ok: false, error: `EmailJS HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    console.error('[EmailJS] Error de red (sendCriticalAuthEmail):', error);
    return { ok: false, error: String(error) };
  }
}

// ─── Preferencias de notificaciones por email ────────────────────────────────

export type EmailNotifCategory =
  | 'actividad_caso'       // Dentista: entregas, plazos, inicio
  | 'resolucion'           // Dentista: trabajo aprobado / comparativo expirado
  | 'gestion_busqueda'     // Dentista: pool check-in
  | 'nuevas_asignaciones'  // Técnico: NUEVA_ASIGNACION
  | 'progreso_caso'        // Técnico: cambios, aprobación, calidad
  | 'disponibilidad'       // Técnico: sanciones, auto-OFF, recordatorios
  | 'entregas_pendientes'  // Calidad: certificar, derivación
  | 'plazos_revision'      // Calidad: SLA por vencer / vencido
  | 'calificacion_pendiente' // Calidad: caso completado sin calificar
  | 'alertas_operativas';  // Admin: fallos de asignación

export type EmailNotificationPrefs = Partial<Record<EmailNotifCategory, boolean>>;

export const NOTIFICATION_CATEGORY_MAP: Partial<Record<NotificationType, EmailNotifCategory>> = {
  // Dentista
  ASIGNACION_ACEPTADA:            'actividad_caso',
  FAUCHARD_INICIO_PLAZO_DENTISTA: 'actividad_caso',
  REVISION_PENDIENTE:             'actividad_caso',
  REVISION_PLAZO_POR_VENCER:      'actividad_caso',
  REVISION_PLAZO_VENCIDO:         'actividad_caso',
  COMPARATIVO_EXPIRADO_DENTISTA:  'resolucion',
  CHECK_IN_DENTISTA:              'gestion_busqueda',
  // Técnico
  NUEVA_ASIGNACION:               'nuevas_asignaciones',
  TRABAJO_CONFIRMADO:             'progreso_caso',
  CAMBIOS_SOLICITADOS:            'progreso_caso',
  TRABAJO_APROBADO:               'progreso_caso',
  CALIDAD_CERTIFICO:              'progreso_caso',
  CALIDAD_SOLICITO_AJUSTES:       'progreso_caso',
  PROPUESTA_RECHAZADA_DENTISTA:   'progreso_caso',
  CASO_ASIGNADO_OTRO:             'progreso_caso',
  SUSPENSION_TEMPORAL:            'disponibilidad',
  NIVEL_2_ALCANZADO:              'disponibilidad',
  NIVEL_3_AUTO_OFF:               'disponibilidad',
  AUTO_OFF_PREVENTIVO:            'disponibilidad',
  RECORDATORIO_ACTIVIDAD:         'disponibilidad',
  PERDON_ADMIN:                   'disponibilidad',
  // Calidad
  REVISION_PENDIENTE_CALIDAD:     'entregas_pendientes',
  CASO_DERIVADO_CALIDAD:          'entregas_pendientes',
  DERIVACION_CALIDAD_ACEPTADA:    'entregas_pendientes',
  DERIVACION_CALIDAD_RECHAZADA:   'entregas_pendientes',
  QUALITY_PLAZO_POR_VENCER:       'plazos_revision',
  QUALITY_PLAZO_VENCIDO:          'plazos_revision',
  CALIDAD_POR_CALIFICAR:          'calificacion_pendiente',
  // Admin
  SIN_COTIZACIONES_FALLO:         'alertas_operativas',
  // v5.31 — Cancelación
  CASO_CANCELADO_DENTISTA_TECNICO: 'progreso_caso',
  ASIGNACION_ANULADA:              'progreso_caso',
  // v5.32 — Retiro y reasignación
  RETIRO_DECISION_REQUERIDA:       'gestion_busqueda',
  REASIGNACION_CONTINUADA_TIMEOUT: 'gestion_busqueda',
  FECHA_FIRME_ACTUALIZADA:         'actividad_caso',
};

// ─────────────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'NUEVA_ASIGNACION'
  | 'ASIGNACION_ACEPTADA'
  | 'TRABAJO_CONFIRMADO'
  /** Dentista: Fauchard confirma que la contraparte técnica inició el plazo (no usar TRABAJO_CONFIRMADO, es plantilla de técnico). */
  | 'FAUCHARD_INICIO_PLAZO_DENTISTA'
  | 'REVISION_PENDIENTE'
  | 'CAMBIOS_SOLICITADOS'
  | 'TRABAJO_APROBADO'
  | 'PROPUESTA_RECHAZADA_DENTISTA'
  /** Dentista: ventana comparativa venció (no confundir con rechazo de oferta hacia laboratorio). */
  | 'COMPARATIVO_EXPIRADO_DENTISTA'
  | 'SUSPENSION_TEMPORAL'
  | 'SIN_COTIZACIONES_FALLO'
  | 'CASO_ASIGNADO_OTRO'
  // ─── v5.0 — Disponibilidad y sanción rolling (tono informativo, no punitivo) ───
  | 'NIVEL_2_ALCANZADO'
  | 'NIVEL_3_AUTO_OFF'
  | 'AUTO_OFF_PREVENTIVO'
  | 'RECORDATORIO_ACTIVIDAD'
  | 'PERDON_ADMIN'
  | 'CHECK_IN_DENTISTA'
  /** Dentista: plazo de revisión de entrega por vencer / vencido (§4.2, sin auto-acción). */
  | 'REVISION_PLAZO_POR_VENCER'
  | 'REVISION_PLAZO_VENCIDO'
  // ─── v5.19 — Compuerta de Calidad (gated por QUALITY_GATE_ENABLED) ───
  /** Calidad: nueva entrega del técnico pendiente de certificar. */
  | 'REVISION_PENDIENTE_CALIDAD'
  /** Técnico: Calidad certificó la entrega; ya puede enviarla al dentista. */
  | 'CALIDAD_CERTIFICO'
  /** Técnico: Calidad solicitó ajustes antes de certificar. */
  | 'CALIDAD_SOLICITO_AJUSTES'
  /** Calidad: un caso le fue derivado por otro revisor de Calidad. */
  | 'CASO_DERIVADO_CALIDAD'
  /** Calidad: SLA de revisión por vencer / vencido (sin auto-acción). */
  | 'QUALITY_PLAZO_POR_VENCER'
  | 'QUALITY_PLAZO_VENCIDO'
  /** Calidad: el caso se completó y queda pendiente la calificación del técnico. */
  | 'CALIDAD_POR_CALIFICAR'
  /** Calidad (origen): el destino aceptó la derivación. */
  | 'DERIVACION_CALIDAD_ACEPTADA'
  /** Calidad (origen): el destino rechazó la derivación. */
  | 'DERIVACION_CALIDAD_RECHAZADA'
  /** Portabilidad (Ley 21.719): el ZIP con los datos del usuario está listo para descargar. */
  | 'DATOS_EXPORTACION_LISTA'
  // ─── v5.31 — Cancelación unilateral del dentista ───
  /** Técnico: el dentista cerró el caso tras haber aceptado el trabajo; compensación registrada. */
  | 'CASO_CANCELADO_DENTISTA_TECNICO'
  /** Técnico: su asignación pendiente fue anulada porque el dentista canceló el caso (sin sanción). */
  | 'ASIGNACION_ANULADA'
  // ─── v5.32 — Retiro del técnico + reasignación diferida ───
  /** Dentista: el técnico se retiró; debe decidir continuar (nueva fecha estimada) o cancelar sin costo. */
  | 'RETIRO_DECISION_REQUERIDA'
  /** Dentista: venció el plazo de decisión sin respuesta; Fauchard continúa buscando reemplazo. */
  | 'REASIGNACION_CONTINUADA_TIMEOUT'
  /** Dentista: el técnico de reemplazo aceptó; la fecha comprometida quedó re-anclada. */
  | 'FECHA_FIRME_ACTUALIZADA';

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || '';

/**
 * Reglas de canal por tipo (v5.0, §9.5). `email` controla el envío real por
 * EmailJS; `inApp` documenta la intención (el feed in-app se materializa en una
 * fase posterior). Regla del modelo de disponibilidad:
 *  - Nivel 1 (warning) → solo in-app, NO email (no existe tipo dedicado: el aviso
 *    se refleja en el badge; aquí queda la regla por si se agrega un tipo).
 *  - Nivel 2 / Nivel 3 / auto-OFF / recordatorio / perdón / check-in dentista /
 *    republicar → email + in-app.
 * Tipos no listados (legacy) usan el default `email + in-app`.
 */
export type NotificationChannels = { email: boolean; inApp: boolean };
const DEFAULT_CHANNELS: NotificationChannels = { email: true, inApp: true };

const NOTIFICATION_CHANNELS: Partial<Record<NotificationType, NotificationChannels>> = {
  NIVEL_2_ALCANZADO: { email: true, inApp: true },
  NIVEL_3_AUTO_OFF: { email: true, inApp: true },
  AUTO_OFF_PREVENTIVO: { email: true, inApp: true },
  RECORDATORIO_ACTIVIDAD: { email: true, inApp: true },
  PERDON_ADMIN: { email: true, inApp: true },
  CHECK_IN_DENTISTA: { email: true, inApp: true },
  REVISION_PLAZO_POR_VENCER: { email: true, inApp: true },
  REVISION_PLAZO_VENCIDO: { email: true, inApp: true },
  REVISION_PENDIENTE_CALIDAD: { email: true, inApp: true },
  CALIDAD_CERTIFICO: { email: true, inApp: true },
  CALIDAD_SOLICITO_AJUSTES: { email: true, inApp: true },
  CASO_DERIVADO_CALIDAD: { email: true, inApp: true },
  QUALITY_PLAZO_POR_VENCER: { email: true, inApp: true },
  QUALITY_PLAZO_VENCIDO: { email: true, inApp: true },
  CALIDAD_POR_CALIFICAR: { email: true, inApp: true },
  // Portabilidad legal — email obligatorio, nunca in-app ni desactivable por preferencias
  DATOS_EXPORTACION_LISTA: { email: true, inApp: false },
  CASO_CANCELADO_DENTISTA_TECNICO: { email: true, inApp: true },
  ASIGNACION_ANULADA: { email: false, inApp: true },
  RETIRO_DECISION_REQUERIDA: { email: true, inApp: true },
  REASIGNACION_CONTINUADA_TIMEOUT: { email: true, inApp: true },
  FECHA_FIRME_ACTUALIZADA: { email: true, inApp: true },
};

export function channelsForNotification(type: NotificationType): NotificationChannels {
  return NOTIFICATION_CHANNELS[type] ?? DEFAULT_CHANNELS;
}

const TEMPLATES: Record<NotificationType, { subject: string; body: (data: any) => string }> = {
  NUEVA_ASIGNACION: {
    subject: 'Fauchard: nueva asignación de trabajo',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que tienes una nueva asignación de diseño en DentFlowAi. Responde antes de las ${data.deadline}.\n\nVer casos: ${baseUrl()}/dashboard/cases?preset=nuevas`,
  },
  ASIGNACION_ACEPTADA: {
    subject: 'Fauchard: asignación aceptada — trabajo en curso',
    body: (data) => `Hola,\n\nFauchard confirma que un técnico aceptó la asignación del caso ${data.caseNumber || data.caseId}. El trabajo puede iniciar.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  TRABAJO_CONFIRMADO: {
    subject: 'Fauchard: tu propuesta fue seleccionada',
    body: (data) => `Hola ${data.name},\n\nFauchard confirma que el solicitante del caso aceptó tu propuesta (${data.caseNumber || data.caseId}). Ya puedes comenzar el trabajo.\n\nAcceder al caso: ${baseUrl()}/dashboard/bids/${data.caseId}`,
  },
  FAUCHARD_INICIO_PLAZO_DENTISTA: {
    subject: 'Fauchard: inicio formal del trabajo en tu caso',
    body: (data) => `Hola,\n\nFauchard te informa que la contraparte técnica confirmó el inicio formal del trabajo en el caso ${data.caseNumber || data.caseId}. El plazo acordado comienza a regir; revisa el Hub del caso para los hitos.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  REVISION_PENDIENTE: {
    subject: 'Fauchard: nueva entrega lista para revisión',
    body: (data) => `Hola,\n\nFauchard te informa que hay una nueva versión del diseño lista para revisión en el caso ${data.caseNumber || data.caseId}. Ingresa al Hub del caso para aprobar o solicitar ajustes.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  CAMBIOS_SOLICITADOS: {
    subject: 'Fauchard: solicitud de ajustes en el caso',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que el solicitante del caso ${data.caseNumber || data.caseId} solicitó ajustes al diseño. Revisa la bitácora del caso.\n\nVer caso: ${baseUrl()}/dashboard/bids/${data.caseId}`,
  },
  TRABAJO_APROBADO: {
    subject: 'Fauchard: diseño aprobado por el solicitante',
    body: (data) => `Hola ${data.name},\n\nFauchard confirma que el solicitante aprobó el diseño del caso ${data.caseNumber || data.caseId}. Revisa los próximos pasos en tu panel.\n\nVer caso: ${baseUrl()}/dashboard/bids/${data.caseId}`,
  },
  PROPUESTA_RECHAZADA_DENTISTA: {
    subject: 'Fauchard: actualización en tu invitación',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que el solicitante no avanzó con tu oferta en el caso ${data.caseNumber || data.caseId}. Puedes seguir recibiendo nuevas invitaciones.\n\nVer casos: ${baseUrl()}/dashboard/cases?preset=nuevas`,
  },
  COMPARATIVO_EXPIRADO_DENTISTA: {
    subject: 'Fauchard: ventana comparativa cerrada',
    body: (data) => `Hola,\n\nFauchard te informa que venció el plazo para elegir una oferta en el caso ${data.caseNumber || data.caseId}. El caso quedó cerrado en esta ronda; puedes crear un nuevo caso si lo necesitas.\n\nVer panel: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  SUSPENSION_TEMPORAL: {
    subject: 'Fauchard: cuenta pausada temporalmente',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que tu cuenta fue pausada automáticamente por no responder a 3 invitaciones consecutivas. Puedes reactivarla desde tu panel actualizando tu disponibilidad.`,
  },
  SIN_COTIZACIONES_FALLO: {
    subject: '⚠️ Alerta: Caso sin cotizaciones disponibles',
    body: (data) => `Atención Admin,\n\nEl caso ${data.caseNumber || data.caseId} no ha podido ser asignado por falta de técnicos disponibles en el pool. Requiere intervención manual.`,
  },
  CASO_ASIGNADO_OTRO: {
    subject: 'Fauchard: caso asignado a otra oferta',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que el caso ${data.caseNumber || data.caseId} ya fue asignado a otra oferta. Gracias por participar; seguirás recibiendo nuevas invitaciones.\n\nVer casos: ${baseUrl()}/dashboard/cases?preset=nuevas`,
  },
  // ─── v5.0 — Disponibilidad y sanción rolling (informativo, nunca punitivo) ───
  NIVEL_2_ALCANZADO: {
    subject: 'Fauchard: estado de tus respuestas',
    body: (data) => `Hola ${data.name},\n\nHas dejado de responder ${data.count ?? 2} invitaciones recientes en los últimos ${data.windowDays ?? 14} días. Esto puede afectar la prioridad con la que recibes nuevas invitaciones. Las no-respuestas salen solas de la ventana con el tiempo.\n\nVer mi historial de respuesta: ${baseUrl()}/dashboard/profile/availability`,
  },
  NIVEL_3_AUTO_OFF: {
    subject: 'Fauchard: pusimos tu disponibilidad en pausa',
    body: (data) => `Hola ${data.name},\n\nComo no se registraron respuestas a varias invitaciones recientes, pusimos tu disponibilidad en pausa para evitar que acumules más. Puedes reactivarla cuando estés disponible.\n\nReactivar disponibilidad: ${baseUrl()}/dashboard/profile/availability`,
  },
  AUTO_OFF_PREVENTIVO: {
    subject: 'Fauchard: tu disponibilidad quedó en pausa',
    body: (data) => `Hola ${data.name},\n\nNotamos que tu disponibilidad estuvo activa sin actividad por más de ${data.days ?? 30} días, así que la pusimos en pausa por seguridad. Vuelve a activarla cuando quieras recibir invitaciones.\n\nGestionar disponibilidad: ${baseUrl()}/dashboard/profile/availability`,
  },
  RECORDATORIO_ACTIVIDAD: {
    subject: 'Fauchard: ¿sigues disponible?',
    body: (data) => `Hola ${data.name},\n\nTu disponibilidad lleva ${data.days ?? 7} días activa sin actividad reciente. Si sigues disponible no necesitas hacer nada; si prefieres pausar, puedes hacerlo desde tu panel.\n\nGestionar disponibilidad: ${baseUrl()}/dashboard/profile/availability`,
  },
  PERDON_ADMIN: {
    subject: 'Fauchard: actualización en tu historial de respuesta',
    body: (data) => `Hola ${data.name},\n\nUn administrador perdonó ${data.count ?? 1} no-respuesta(s) en tu historial. Tu nivel actual es ahora Nivel ${data.level ?? 1}.\n\nVer mi historial de respuesta: ${baseUrl()}/dashboard/profile/availability`,
  },
  CHECK_IN_DENTISTA: {
    subject: 'Fauchard: tu caso sigue buscando técnicos',
    body: (data) => `Hola,\n\nTu caso ${data.caseNumber || data.caseId} lleva un tiempo esperando técnicos disponibles. ¿Sigues necesitándolo? Si no haces nada, seguiremos buscando; también puedes cancelar la publicación.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  REVISION_PLAZO_POR_VENCER: {
    subject: 'Fauchard: tienes una entrega por revisar',
    body: (data) => `Hola,\n\nTu caso ${data.caseNumber || data.caseId} tiene una entrega esperando tu revisión y el plazo está por vencer. Ingresa para aprobar o solicitar ajustes.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  REVISION_PLAZO_VENCIDO: {
    subject: 'Fauchard: el plazo para revisar tu entrega venció',
    body: (data) => `Hola,\n\nEl plazo para revisar la entrega de tu caso ${data.caseNumber || data.caseId} venció. No se aprobó ni rechazó nada automáticamente; el técnico sigue esperando tu respuesta. Te recomendamos revisarla cuanto antes.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  REVISION_PENDIENTE_CALIDAD: {
    subject: 'Calidad: nueva entrega pendiente de certificar',
    body: (data) => `Hola,\n\nHay una nueva entrega del técnico esperando tu revisión de Calidad en el caso ${data.caseNumber || data.caseId}. Ingresa para certificarla o solicitar ajustes.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  CALIDAD_CERTIFICO: {
    subject: 'Fauchard: tu entrega fue certificada',
    body: (data) => `Hola ${data.name || ''},\n\nTu entrega del caso ${data.caseNumber || data.caseId} fue certificada y ya puedes enviarla al solicitante desde el Hub del caso.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  CALIDAD_SOLICITO_AJUSTES: {
    subject: 'Fauchard: solicitud de ajustes en tu entrega',
    body: (data) => `Hola ${data.name || ''},\n\nSe solicitaron ajustes a tu entrega del caso ${data.caseNumber || data.caseId} antes de certificarla. Revisa el Hub del caso para ver el detalle.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  CASO_DERIVADO_CALIDAD: {
    subject: 'Calidad: se te derivó un caso para revisión',
    body: (data) => `Hola,\n\nUn caso (${data.caseNumber || data.caseId}) fue derivado a ti para revisión de Calidad. Revisa el motivo y el comentario en el Hub del caso.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  QUALITY_PLAZO_POR_VENCER: {
    subject: 'Calidad: tienes una entrega por certificar',
    body: (data) => `Hola,\n\nEl caso ${data.caseNumber || data.caseId} tiene una entrega esperando tu revisión de Calidad y el plazo está por vencer. Ingresa para certificar o solicitar ajustes.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  QUALITY_PLAZO_VENCIDO: {
    subject: 'Calidad: el plazo para certificar venció',
    body: (data) => `Hola,\n\nEl plazo de revisión de Calidad del caso ${data.caseNumber || data.caseId} venció. No se certificó ni rechazó nada automáticamente; el técnico sigue esperando tu respuesta.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  CALIDAD_POR_CALIFICAR: {
    subject: 'Calidad: tienes un caso por calificar',
    body: (data) => `Hola,\n\nEl caso ${data.caseNumber || data.caseId} se completó y queda pendiente tu calificación de Calidad al técnico. Ingresa al Hub del caso para enviarla.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  DERIVACION_CALIDAD_ACEPTADA: {
    subject: 'Calidad: tu derivación fue aceptada',
    body: (data) => `Hola,\n\nLa derivación del caso ${data.caseNumber || data.caseId} fue aceptada. El nuevo revisor asumirá la revisión de Calidad.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  DERIVACION_CALIDAD_RECHAZADA: {
    subject: 'Calidad: tu derivación fue rechazada',
    body: (data) => `Hola,\n\nLa derivación del caso ${data.caseNumber || data.caseId} fue rechazada. El caso permanece contigo para su revisión. Ingresa al Hub para ver el motivo.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  DATOS_EXPORTACION_LISTA: {
    subject: 'Tus datos personales están listos para descargar',
    body: (data) => `Hola ${data.name},\n\nTu solicitud de exportación de datos (Ley 21.719 — derecho de acceso y portabilidad) está lista.\n\nDescarga tu archivo aquí:\n${data.downloadUrl}\n\nEste enlace estará disponible hasta el ${data.expiresAt}. Después de esa fecha el archivo será eliminado de forma permanente.\n\nSi no solicitaste esta descarga, puedes ignorar este correo.`,
  },
  // ─── v5.31 — Cancelación unilateral del dentista ───
  CASO_CANCELADO_DENTISTA_TECNICO: {
    subject: 'Fauchard: el dentista cerró el caso',
    body: (data) => `Hola,\n\nEl dentista cerró el caso ${data.caseNumber || data.caseId}. Ya habías aceptado este trabajo, así que tu compensación queda registrada íntegramente.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  ASIGNACION_ANULADA: {
    subject: 'Fauchard: una asignación ya no está disponible',
    body: (data) => `Hola,\n\nLa asignación del caso ${data.caseNumber || data.caseId} ya no está disponible; el dentista canceló el caso antes de que respondieras. No cuenta como no-respuesta en tu historial.\n\nVer casos: ${baseUrl()}/dashboard/cases?preset=nuevas`,
  },
  // ─── v5.32 — Retiro del técnico + reasignación diferida ───
  RETIRO_DECISION_REQUERIDA: {
    subject: 'Fauchard: tu caso requiere reasignación',
    body: (data) => `Hola,\n\nTu caso ${data.caseNumber || data.caseId} requiere reasignación producto de una contingencia técnica. Nueva fecha estimada: ${data.estimatedDate}. Puedes continuar buscando un reemplazo o cancelar sin costo.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  REASIGNACION_CONTINUADA_TIMEOUT: {
    subject: 'Fauchard: seguimos buscando reemplazo para tu caso',
    body: (data) => `Hola,\n\nNo recibimos respuesta a tiempo, así que seguimos buscando un técnico de reemplazo para tu caso ${data.caseNumber || data.caseId}.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  FECHA_FIRME_ACTUALIZADA: {
    subject: 'Fauchard: nueva fecha comprometida para tu caso',
    body: (data) => `Hola,\n\nUn técnico aceptó continuar con tu caso ${data.caseNumber || data.caseId}. Nueva fecha comprometida: ${data.deliveryDate}.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
};

/**
 * Servicio central de notificaciones por email (transport EmailJS).
 */
export async function notifyUser(userId: string, type: NotificationType, data: any) {
  try {
    // 1. Obtener email del usuario
    const [userData] = await db
      .select({ email: user.email, fullName: user.fullName, emailNotificationPrefs: user.emailNotificationPrefs })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    // Resolver caseNumber desde DB si se pasó caseId pero no caseNumber
    if (data?.caseId && !data?.caseNumber) {
      const [caseRow] = await db
        .select({ caseNumber: clinicalCase.caseNumber })
        .from(clinicalCase)
        .where(eq(clinicalCase.id, data.caseId))
        .limit(1);
      if (caseRow?.caseNumber) data = { ...data, caseNumber: caseRow.caseNumber };
    }

    if (!userData?.email) return { success: false, error: 'User email not found' };

    const template = TEMPLATES[type];
    if (!template) return { success: false, error: 'Template not found' };

    // 1.b Regla de canal (§9.5): si el tipo no usa email, no se envía (el aviso vive
    //      solo en el canal in-app / badge).
    if (!channelsForNotification(type).email) {
      return { success: true };
    }

    // 1.c Preferencias del usuario: si la categoría del tipo está desactivada, no se envía.
    //      Tipos sin categoría en el mapa (como DATOS_EXPORTACION_LISTA) son obligatorios y
    //      no pueden ser desactivados por el usuario.
    const userPrefs = userData.emailNotificationPrefs as EmailNotificationPrefs | null;
    if (userPrefs) {
      const category = NOTIFICATION_CATEGORY_MAP[type];
      if (category && userPrefs[category] === false) {
        return { success: true };
      }
    }

    const subject = `Fauchard · DentFlowAi: ${template.subject}`;
    const body = template.body({ ...data, name: userData.fullName });

    // 1.c DEMO (temporal): registra el correo que se enviaría para mostrarlo en pantalla.
    //      Gated por NEXT_PUBLIC_DEMO_EMAIL_PREVIEW; independiente de NOTIFICATIONS_LIVE.
    pushEmailPreview({ to: userData.email, subject, body, type });

    // Tipos sin categoría (DATOS_EXPORTACION_LISTA) son legalmente obligatorios:
    // se envían aunque NOTIFICATIONS_LIVE esté off, siempre que haya credenciales.
    const forceSend = !NOTIFICATION_CATEGORY_MAP[type];

    // 2. Enviar vía EmailJS (modo stub interno loguea sin enviar en dev local).
    const result = await sendViaEmailJS({ subject, toEmail: userData.email, body }, forceSend);

    if (!result.ok) return { success: false, error: result.error };
    return { success: true };
  } catch (error) {
    console.error("Error in notification service:", error);
    return { success: false, error: String(error) };
  }
}

