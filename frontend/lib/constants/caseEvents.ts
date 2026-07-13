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

  /** v5.31 — Cancelación unilateral del dentista (gratis o con cobro 100%, ver clinical_case.closure_cause). */
  CASO_CANCELADO: 'CASO_CANCELADO',
  /** v5.31 — Asignación pendiente anulada por cancelación del dentista (sin sanción al técnico). */
  ASIGNACION_ANULADA: 'ASIGNACION_ANULADA',

  /** v5.32 — Retiro unilateral del técnico de un caso ya aceptado (posta en sus manos). */
  RETIRO_TECNICO: 'RETIRO_TECNICO',
  /** v5.32 — El caso quedó sin técnico tras un retiro; requiere decisión del dentista. */
  REASIGNACION_REQUERIDA: 'REASIGNACION_REQUERIDA',
  /** v5.32 — El dentista decidió continuar (o venció el plazo de decisión): Fauchard busca reemplazo. */
  REASIGNACION_CONTINUADA: 'REASIGNACION_CONTINUADA',
  /** v5.32 — Al aceptar el técnico de reemplazo, se re-ancla la fecha comprometida. */
  FECHA_FIRME_ACTUALIZADA: 'FECHA_FIRME_ACTUALIZADA',

  // Comunicación
  COMENTARIO_TECNICO: 'COMENTARIO_TECNICO',
} as const;

