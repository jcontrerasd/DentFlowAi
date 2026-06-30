// Registro de actividades de tratamiento (Art. 14 ter, Ley 21.719). Inventario de qué datos
// personales/sensibles trata DentFlowAi, con qué finalidad, base legal, quién accede y por
// cuánto tiempo. Se mantiene como dato (no JSX) para poder mostrarlo y descargarlo desde el
// panel admin sin depender de que un desarrollador lo busque en el repo.
// Ver Doc/Auditoria_Cumplimiento_Legal.md para el contexto completo de la auditoría.

export interface DataProcessingEntry {
  dataset: string;
  description: string;
  purpose: string;
  legalBasis: string;
  accessedBy: string;
  retention: string;
  schemaRef: string;
}

export const DATA_PROCESSING_REGISTRY: DataProcessingEntry[] = [
  {
    dataset: 'Identidad y perfil',
    description: 'Nombre, email, teléfono, especialidad, biografía profesional.',
    purpose: 'Identificar al usuario, operar su cuenta y mostrar su perfil profesional dentro del marketplace.',
    legalBasis: 'Ejecución del contrato de uso de la plataforma (Ley 19.628 / Ley 21.719).',
    accessedBy: 'El propio usuario, contraparte del caso (según rol), administradores.',
    retention: 'Mientras la cuenta esté activa; tras solicitud de eliminación, según política de retención.',
    schemaRef: 'user (email, fullName, phone, specialty, bio)',
  },
  {
    dataset: 'Dirección geográfica',
    description: 'País, región, comuna, calle, número, oficina.',
    purpose: 'Permitir despacho de fabricaciones y mostrar ubicación gruesa/completa según gate de divulgación.',
    legalBasis: 'Ejecución del contrato (logística de despacho).',
    accessedBy: 'El propio usuario, dentista dueño del caso, técnico ganador (dirección completa); otros técnicos con asignación (solo ubicación gruesa).',
    retention: 'Mientras la cuenta esté activa.',
    schemaRef: 'user (country, region, comuna, address, addressNumber, addressOffice)',
  },
  {
    dataset: 'Datos clínicos del caso',
    description: 'Escaneos 3D dentales, notas clínicas, piezas a tratar, identificador anónimo del paciente.',
    purpose: 'Permitir al laboratorio diseñar y/o fabricar la prótesis solicitada por el dentista.',
    legalBasis: 'Consentimiento explícito del paciente (obtenido por el dentista, declarado al publicar el caso) — Ley 21.719 / Ley 20.584.',
    accessedBy: 'Dentista dueño del caso, laboratorio con asignación activa. Nunca otros técnicos del pool.',
    retention: 'Mientras el caso esté activo; tras cierre, sujeto a lifecycle de archivado en GCS (30/120/365 días).',
    schemaRef: 'clinicalCase (notesEsthetic, notesOclusal, teeth, patientIdAnon, patientConsentDeclaredAt), file',
  },
  {
    dataset: 'Eventos de actividad del caso (UCH)',
    description: 'Historial de acciones dentro de cada caso (asignación, entregas, aprobaciones, calificaciones).',
    purpose: 'Trazabilidad del flujo de trabajo entre dentista y laboratorio; resolución de disputas.',
    legalBasis: 'Interés legítimo / ejecución del contrato.',
    accessedBy: 'Participantes del caso según rol (con reglas de anonimato), administradores.',
    retention: 'Igual que el caso al que pertenecen.',
    schemaRef: 'clinicalCaseEvent',
  },
  {
    dataset: 'Calificaciones',
    description: 'Puntaje 1-5 y comentario que el dentista da al laboratorio por fase (diseño/fabricación).',
    purpose: 'Alimentar el componente de calidad histórica del score Fauchard y el sistema de ligas.',
    legalBasis: 'Interés legítimo (calidad del marketplace).',
    accessedBy: 'El técnico calificado (revieweeId), administradores.',
    retention: 'Mientras la cuenta del calificado esté activa.',
    schemaRef: 'review',
  },
  {
    dataset: 'Consentimiento de registro',
    description: 'Fecha de aceptación del marco legal y versión del texto aceptado.',
    purpose: 'Probar que el usuario aceptó el tratamiento de sus datos al registrarse.',
    legalBasis: 'Obligación legal de demostrar consentimiento (Ley 21.719).',
    accessedBy: 'El propio usuario, administradores.',
    retention: 'Mientras la cuenta exista.',
    schemaRef: 'user (consentRegistrationAcceptedAt, consentRegistrationLegalVersion)',
  },
  {
    dataset: 'Registro de auditoría del sistema',
    description: 'Acciones administrativas y de archivos relevantes para trazabilidad de cumplimiento.',
    purpose: 'Demostrar trazabilidad ante una auditoría o disputa; nunca se purga junto con datos de negocio.',
    legalBasis: 'Obligación legal / interés legítimo de cumplimiento.',
    accessedBy: 'Administradores.',
    retention: 'Indefinida — excluido de la purga total de datos de negocio.',
    schemaRef: 'auditLog',
  },
];
