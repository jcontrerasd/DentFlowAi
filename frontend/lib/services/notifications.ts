import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Resend } from 'resend';

let resendInstance: Resend | null = null;
function getResend() {
  if (!resendInstance) {
    resendInstance = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build_purposes');
  }
  return resendInstance;
}

const FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL || 'DentFlowAi <notifications@dentflow.ai>';

export type NotificationType =
  | 'NUEVA_INVITACION'
  | 'TRABAJO_CONFIRMADO'
  /** Dentista: Fauchard confirma que la contraparte técnica inició el plazo (no usar TRABAJO_CONFIRMADO, es plantilla de técnico). */
  | 'FAUCHARD_INICIO_PLAZO_DENTISTA'
  | 'PROPUESTA_LISTA'
  | 'REVISION_PENDIENTE'
  | 'CAMBIOS_SOLICITADOS'
  | 'TRABAJO_APROBADO'
  | 'CASO_DESPACHADO'
  | 'RECEPCION_CONFIRMADA'
  | 'PROPUESTA_RECHAZADA_DENTISTA'
  /** Dentista: ventana comparativa venció (no confundir con rechazo de oferta hacia laboratorio). */
  | 'COMPARATIVO_EXPIRADO_DENTISTA'
  | 'SUSPENSION_TEMPORAL'
  | 'FALLO_SELECCION_DENTISTA'
  | 'SIN_COTIZACIONES_FALLO'
  | 'FABRICACION_INICIADA'
  | 'CASO_ASIGNADO_OTRO';

const baseUrl = () => process.env.NEXT_PUBLIC_APP_URL || '';

const TEMPLATES: Record<NotificationType, { subject: string; body: (data: any) => string }> = {
  NUEVA_INVITACION: {
    subject: 'Fauchard: nueva invitación de trabajo',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que tienes una nueva invitación para cotizar un caso en DentFlowAi. Responde antes de las ${data.deadline} para participar.\n\nVer casos: ${baseUrl()}/dashboard/cases?preset=nuevas`,
  },
  TRABAJO_CONFIRMADO: {
    subject: 'Fauchard: tu propuesta fue seleccionada',
    body: (data) => `Hola ${data.name},\n\nFauchard confirma que el solicitante del caso aceptó tu propuesta (${data.caseNumber || data.caseId}). Ya puedes comenzar el trabajo.\n\nAcceder al caso: ${baseUrl()}/dashboard/bids/${data.caseId}`,
  },
  FAUCHARD_INICIO_PLAZO_DENTISTA: {
    subject: 'Fauchard: inicio formal del trabajo en tu caso',
    body: (data) => `Hola,\n\nFauchard te informa que la contraparte técnica confirmó el inicio formal del trabajo en el caso ${data.caseNumber || data.caseId}. El plazo acordado comienza a regir; revisa el Hub del caso para los hitos.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  PROPUESTA_LISTA: {
    subject: 'Fauchard: comparativo listo para tu revisión',
    body: (data) => `Hola,\n\nFauchard te informa que tu caso ${data.caseId} ya tiene ofertas comparativas listas para revisión. Ingresa al panel para evaluarlas.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  REVISION_PENDIENTE: {
    subject: 'Fauchard: nueva entrega lista para revisión',
    body: (data) => `Hola,\n\nFauchard te informa que hay una nueva versión del diseño lista para revisión en el caso ${data.caseId}. Ingresa al Hub del caso para aprobar o solicitar ajustes.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  CAMBIOS_SOLICITADOS: {
    subject: 'Fauchard: solicitud de ajustes en el caso',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que el solicitante del caso ${data.caseId} solicitó ajustes al diseño. Revisa la bitácora del caso.\n\nVer caso: ${baseUrl()}/dashboard/bids/${data.caseId}`,
  },
  TRABAJO_APROBADO: {
    subject: 'Fauchard: diseño aprobado por el solicitante',
    body: (data) => `Hola ${data.name},\n\nFauchard confirma que el solicitante aprobó el diseño del caso ${data.caseId}. Revisa los próximos pasos en tu panel.\n\nVer caso: ${baseUrl()}/dashboard/bids/${data.caseId}`,
  },
  CASO_DESPACHADO: {
    subject: 'Fauchard: envío registrado en tu caso',
    body: (data) => `Hola,\n\nFauchard te informa que se registró el envío del caso ${data.caseId}. Tracking: ${data.trackingNumber ?? data.trackingId ?? '—'}.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  RECEPCION_CONFIRMADA: {
    subject: 'Fauchard: recepción confirmada por el solicitante',
    body: (data) => `Hola ${data.name},\n\nFauchard confirma que el solicitante registró la recepción del trabajo para el caso ${data.caseId}.`,
  },
  PROPUESTA_RECHAZADA_DENTISTA: {
    subject: 'Fauchard: actualización en tu invitación',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que el solicitante no avanzó con tu oferta en el caso ${data.caseNumber || data.caseId}. Puedes seguir recibiendo nuevas invitaciones.\n\nVer casos: ${baseUrl()}/dashboard/cases?preset=nuevas`,
  },
  COMPARATIVO_EXPIRADO_DENTISTA: {
    subject: 'Fauchard: ventana comparativa cerrada',
    body: (data) => `Hola,\n\nFauchard te informa que venció el plazo para elegir una oferta en el caso ${data.caseId}. El caso quedó cerrado en esta ronda; puedes crear un nuevo caso si lo necesitas.\n\nVer panel: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  SUSPENSION_TEMPORAL: {
    subject: 'Fauchard: cuenta pausada temporalmente',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que tu cuenta fue pausada automáticamente por no responder a 3 invitaciones consecutivas. Puedes reactivarla desde tu panel actualizando tu disponibilidad.`,
  },
  SIN_COTIZACIONES_FALLO: {
    subject: '⚠️ Alerta: Caso sin cotizaciones disponibles',
    body: (data) => `Atención Admin,\n\nEl caso ${data.caseId} no ha podido ser asignado por falta de técnicos disponibles en el pool. Requiere intervención manual.`,
  },
  FALLO_SELECCION_DENTISTA: {
    subject: 'Fauchard: sin cotizaciones en esta ronda',
    body: (data) => `Hola,\n\nFauchard te informa que no se recibieron ofertas válidas para avanzar el caso ${data.caseId} en este momento. Un administrador revisará el caso para ayudarte.\n\nTe notificaremos pronto con una solución.`,
  },
  FABRICACION_INICIADA: {
    subject: 'Fauchard: fase de fabricación iniciada',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que la fase de fabricación de tu caso ${data.caseId} ya comenzó. Revisa el progreso en tu panel.\n\nVer caso: ${baseUrl()}/dashboard/cases/${data.caseId}`,
  },
  CASO_ASIGNADO_OTRO: {
    subject: 'Fauchard: caso asignado a otra oferta',
    body: (data) => `Hola ${data.name},\n\nFauchard te informa que el caso ${data.caseNumber || data.caseId} ya fue asignado a otra oferta. Gracias por participar; seguirás recibiendo nuevas invitaciones.\n\nVer casos: ${baseUrl()}/dashboard/cases?preset=nuevas`,
  },
};

/**
 * Servicio central de notificaciones (Email vía Resend)
 */
export async function notifyUser(userId: string, type: NotificationType, data: any) {
  try {
    // 1. Obtener email del usuario
    const [userData] = await db
      .select({ email: user.email, fullName: user.fullName })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!userData?.email) return { success: false, error: 'User email not found' };

    const template = TEMPLATES[type];
    if (!template) return { success: false, error: 'Template not found' };

    // 2. Enviar email si hay API Key, de lo contrario loggear (para dev)
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_123') {
      console.log(`[STUB-EMAIL] To: ${userData.email} | Subject: ${template.subject} | Body: ${template.body({ ...data, name: userData.fullName })}`);
      return { success: true, stub: true };
    }

    const { error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: [userData.email],
      subject: `Fauchard · DentFlowAi: ${template.subject}`,
      text: template.body({ ...data, name: userData.fullName }),
    });

    if (error) {
      console.error("[Resend Error]:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Error in notification service:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Notifica a todos los dentistas de una organización
 */
export async function notifyOrganizationDentists(orgId: string, type: NotificationType, data: any) {
  try {
    const dentists = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.organizationId, orgId));

    for (const d of dentists) {
      await notifyUser(d.id, type, data);
    }
    return { success: true };
  } catch (error) {
    return { success: false };
  }
}
