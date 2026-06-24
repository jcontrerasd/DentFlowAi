/** Catálogo de tipos de evento para clinical_case_event.action */
export const CASE_EVENTS = {
  // Ciclo de vida del caso
  CREACION: 'CREACION',
  /** Alias canónico UCH core */
  CASO_CREADO: 'CASO_CREADO',
  /** Copia desde caso terminal (Crear copia). */
  CASO_COPIA: 'CASO_COPIA',
  PUBLICACION: 'PUBLICACION',
  CASO_PUBLICADO: 'CASO_PUBLICADO',
  RETIRO_PUBLICACION: 'RETIRO_PUBLICACION',
  CASO_ACTUALIZADO: 'CASO_ACTUALIZADO',

  // Asignación directa
  /** Técnico rechazó explícitamente su invitación (v5.0, visibleTo sistema; el dentista no lo ve) */
  OFERTA_RECHAZADA_POR_TECNICO: 'OFERTA_RECHAZADA_POR_TECNICO',
  /** Caso entró a cola pendiente_pool por 0 técnicos elegibles (v5.0) */
  CASO_EN_COLA: 'CASO_EN_COLA',

  /** Asignación directa (v5.9) */
  ASIGNACION_ENVIADA: 'ASIGNACION_ENVIADA',
  ASIGNACION_RECIBIDA: 'ASIGNACION_RECIBIDA',
  ASIGNACION_ACEPTADA: 'ASIGNACION_ACEPTADA',
  ASIGNACION_RECHAZADA: 'ASIGNACION_RECHAZADA',
  ASIGNACION_EXPIRADA: 'ASIGNACION_EXPIRADA',
  ASIGNACION_REASIGNADA: 'ASIGNACION_REASIGNADA',

  // Flujo de trabajo
  TRABAJO_INICIADO: 'TRABAJO_INICIADO',
  REVISION_ENVIADA: 'REVISION_ENVIADA',
  REVISION_SOLICITADA: 'REVISION_SOLICITADA',
  TRABAJO_APROBADO: 'TRABAJO_APROBADO',

  // Etapa de Calidad (gated por QUALITY_GATE_ENABLED) — invisible al dentista
  /** Técnico envió una entrega a revisión de Calidad (visibleTo tecnico; Calidad lo ve por acceso amplio) */
  REVISION_ENVIADA_CALIDAD: 'REVISION_ENVIADA_CALIDAD',
  /** Calidad pidió ajustes al técnico (visibleTo tecnico, enmascarado Fauchard) */
  REVISION_SOLICITADA_CALIDAD: 'REVISION_SOLICITADA_CALIDAD',
  /** Calidad certificó la entrega: queda lista para que el técnico la envíe (visibleTo tecnico) */
  CALIDAD_CERTIFICADA: 'CALIDAD_CERTIFICADA',
  /** Caso asignado a un revisor de Calidad (visibleTo calidad/sistema) */
  ASIGNACION_CALIDAD: 'ASIGNACION_CALIDAD',
  /** Calidad derivó el caso a otro revisor de Calidad con motivo + comentario (visibleTo calidad) */
  CASO_DERIVADO_CALIDAD: 'CASO_DERIVADO_CALIDAD',
  /** Destino aceptó la derivación; el caso pasa oficialmente al nuevo revisor (visibleTo calidad) */
  DERIVACION_CALIDAD_ACEPTADA: 'DERIVACION_CALIDAD_ACEPTADA',
  /** Destino rechazó la derivación; el caso permanece con el origen (visibleTo calidad — solo el origen) */
  DERIVACION_CALIDAD_RECHAZADA: 'DERIVACION_CALIDAD_RECHAZADA',
  /** SLA de Calidad por vencer / vencido (escalación por cron, sin auto-acción) */
  QUALITY_PLAZO_POR_VENCER: 'QUALITY_PLAZO_POR_VENCER',
  QUALITY_PLAZO_VENCIDO: 'QUALITY_PLAZO_VENCIDO',
  /** Calificación (CAD/CAM) que el dentista deja al técnico; queda reflejada en el UCH de ambos (técnico la ve enmascarada/anónima) y la ve el admin para arbitrar. */
  CALIFICACION_ENVIADA: 'CALIFICACION_ENVIADA',
  /** Calificación del revisor de Calidad al técnico (dimension='quality'); privada del equipo QA, no visible al técnico ni dentista. */
  CALIFICACION_ENVIADA_CALIDAD: 'CALIFICACION_ENVIADA_CALIDAD',
  REANUDADO: 'REANUDADO',

  /** Mutuo acuerdo: pausa o cancelación aprobada */
  CASO_PAUSADO: 'CASO_PAUSADO',
  CASO_CANCELADO: 'CASO_CANCELADO',
  /** Solicitud de pausa/cancelación pendiente de respuesta */
  SOLICITUD_CAMBIO_FLUJO: 'SOLICITUD_CAMBIO_FLUJO',
  SOLICITUD_CAMBIO_FLUJO_RECHAZADA: 'SOLICITUD_CAMBIO_FLUJO_RECHAZADA',

  // Comunicación
  COMENTARIO_TECNICO: 'COMENTARIO_TECNICO',
} as const;

