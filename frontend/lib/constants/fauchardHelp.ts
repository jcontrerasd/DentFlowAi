// Contenido de ayuda para los paneles de configuración Fauchard.
// Se renderiza dentro de <FauchardHelpWindow>. Mantener como datos (no JSX)
// para que sea reutilizable, testeable y fácil de extender a otras pestañas.
//
// Convención: una entrada `FauchardHelpSection` por pestaña Fauchard. El
// piloto cubre "Pesos del Score"; las demás pestañas se agregan replicando
// la misma estructura cuando se validen sus ejemplos.

/** Referencia a un parámetro de configuración Fauchard desde un texto de ayuda. */
export interface FauchardParamLink {
  /** Clave de config del parámetro (ej. 'alphaNoResponse'). El label visible y el
   *  espacio destino se resuelven desde `FAUCHARD_PARAM_LABEL` / `FAUCHARD_PARAM_PANEL`. */
  key: string;
}

export interface FauchardHelpParam {
  /** Etiqueta visible del parámetro (idealmente igual al label del control). */
  label: string;
  /** Símbolo / clave técnica corta (ej. "Q", "αQ"). Opcional. */
  symbol?: string;
  /** Qué controla el parámetro, en lenguaje de negocio. */
  description: string;
  /** Ejemplo funcional concreto y numérico de su efecto. */
  example: string;
  /** Parámetros de config que la recomendación sugiere ajustar (chips enlazables). */
  links?: FauchardParamLink[];
}

export interface FauchardHelpSection {
  /** Título de la ventana de ayuda (suele coincidir con la pestaña). */
  title: string;
  /** Resumen breve mostrado arriba, antes de los parámetros. */
  intro?: string;
  params: FauchardHelpParam[];
  /** Notas o reglas globales (ej. "la suma debe ser 1.000"). */
  notes?: string[];
}

export const WEIGHTS_HELP: FauchardHelpSection = {
  title: 'Pesos del Score',
  intro:
    'Cuando un dentista publica un caso, Fauchard calcula un score para cada técnico candidato e invita primero a los de score más alto. Ese score es una suma ponderada de seis factores, y estos pesos (α) deciden cuánto influye cada uno. Subir un peso le da más peso a ese factor; como la suma se mantiene en 1.000, baja la influencia relativa de los demás. Los ejemplos siguen un mismo caso para que se entienda el efecto.',
  params: [
    {
      label: 'Calidad Histórica',
      symbol: 'Q',
      description:
        'Importancia de las valoraciones y el feedback de casos anteriores. Cuanto más alto, más prioridad tienen los técnicos mejor calificados.',
      example:
        'El Dr. Soto publica una corona de zirconio y dos laboratorios pueden tomarla: el Lab. Andes (rating 4.8/5, varias coronas felicitadas) y el Lab. Roble (rating 4.0/5). Si el peso de Calidad está alto (αQ = 0.40), esa diferencia de reputación domina el cálculo y Fauchard invita primero al Lab. Andes. Si lo bajas (αQ = 0.10), la reputación casi no influye: ambos quedan prácticamente empatados y deciden los otros factores.',
      links: [{ key: 'wQualityDays' }],
    },
    {
      label: 'Puntualidad',
      symbol: 'P',
      description:
        'Mide con qué frecuencia el técnico entrega dentro del plazo que prometió. Subirlo prioriza a quienes no se atrasan. Se promedia sobre los casos completados dentro de la Ventana histórica (la misma que la Calidad).',
      example:
        'El Dr. Soto necesita la pieza antes de una cita ya agendada. El Lab. Andes entrega el 95% de sus casos a tiempo; el Lab. Pino suele atrasarse (70%). Si el peso de Puntualidad está alto (αP = 0.30), el cumplimiento manda y Fauchard prioriza al Lab. Andes para no arriesgar la fecha del paciente. Si lo bajas (αP = 0.05), el historial de atrasos casi no penaliza y el Lab. Pino podría recibir igualmente la invitación.',
      links: [{ key: 'wQualityDays' }],
    },
    {
      label: 'Experiencia Especializada',
      symbol: 'E',
      description:
        'Nivel de habilidad declarado/verificado para el tipo de trabajo específico del caso. Subirlo favorece a los especialistas.',
      example:
        'Esta vez el Dr. Soto publica una Guía Quirúrgica, un trabajo exigente. El Lab. Andes declaró habilidad 7/7 en guías; el Lab. Roble, 3/7. Si el peso de Experiencia está alto (αE = 0.35), la especialización pesa fuerte y el Lab. Andes encabeza el ranking para este caso. Si lo bajas (αE = 0.10), un laboratorio generalista podría ganarlo igual destacando en otros factores, aunque tenga menos experiencia en guías.',
    },
    {
      label: 'Penalización por Carga',
      symbol: 'C',
      description:
        'Resta score a los técnicos que ya acumulan muchos casos activos en curso. Reparte el trabajo y evita cuellos de botella. Se mide como la carga activa actual del técnico, normalizada por la mayor carga del pool (no usa ventana temporal).',
      example:
        'El Lab. Andes es excelente, pero ahora ya tiene 8 casos activos; el Lab. Roble, casi tan bueno, solo 1. Si el peso de Carga está alto (αL = 0.20), la saturación penaliza con fuerza y Fauchard le cede el turno al Lab. Roble para cuidar los plazos de todos. Si lo pones en cero (αL = 0), la carga deja de importar: el Lab. Andes seguiría recibiendo todas las asignaciones hasta colapsar y los tiempos del marketplace empeorarían.',
    },
    {
      label: 'Bono de Infrautilización',
      symbol: 'B',
      description:
        'Aumento temporal de score para técnicos que llevan tiempo sin recibir casos. Mantiene activo a todo el pool de laboratorios.',
      example:
        'El Lab. Sur lleva 3 semanas sin recibir una asignación. Cuando el Dr. Soto publica uno nuevo, si el peso de Bono está alto (αB = 0.10) ese tiempo de espera lo impulsa y Fauchard lo incluye en la cadena de asignación para mantenerlo activo. Si lo pones en cero (αB = 0), la inactividad deja de sumar y laboratorios nuevos o poco activos como el Lab. Sur rara vez asomarían: el trabajo se concentraría en los de siempre.',
      links: [{ key: 'dBonusMaxDays' }],
    },
    {
      label: 'Penalización por No-respuesta',
      symbol: 'N',
      description:
        'Resta score al técnico que ignora invitaciones (término −αN·N, según su nivel de sanción acumulada). Solo penaliza a quien tiene sanción; un técnico sin sanción no se ve afectado.',
      example:
        'El Lab. Pino dejó vencer 2 invitaciones esta quincena y entró en Nivel 2 de sanción. Si el peso de No-respuesta está alto (αN = 0.25), esa sanción le resta un buen pedazo de score y cae en el ranking aunque su calidad sea buena. Si lo bajas (αN = 0.05), ignorar invitaciones casi no le cuesta y seguiría siendo invitado.',
      links: [{ key: 'level1Threshold' }],
    },
  ],
  notes: [
    'La suma de los seis pesos (αQ + αP + αE + αC + αB + αN) debe ser exactamente 1.000; el panel bloquea el guardado si no se cumple.',
    'Cada peso se mueve entre 0 y 0.50. Subir uno te obliga a compensar bajando otro para mantener la suma.',
    'Calidad, Puntualidad, Experiencia y Bono suman al score; la Carga y la No-respuesta restan. Por eso un αC o un αN altos “frenan” al técnico (saturado o que no responde) sin descalificarlo de golpe.',
    'La No-respuesta solo resta cuando el técnico tiene sanción acumulada (N > 0); sin sanción, su término es 0.',
  ],
};

export const FILTERS_HELP: FauchardHelpSection = {
  title: 'Selección y Asignación',
  intro:
    'Estos parámetros definen cómo Fauchard elige y asigna técnicos: la ventana con que mide su desempeño histórico, la carga de referencia del factor Carga, los filtros que excluyen del pool antes de calcular el score, y las reglas y plazos de la asignación directa. A diferencia de los pesos, aquí no hay suma que cuadrar: cada control es independiente.',
  params: [
    {
      label: 'Ventana histórica (días)',
      symbol: 'wQualityDays',
      description:
        'Cuántos días hacia atrás se miden los factores históricos del score: la Calidad (promedio de calificaciones) y la Puntualidad (% de entregas a tiempo). Acota la memoria de desempeño del técnico de forma coherente en ambos ejes.',
      example:
        'Si lo pones en 30, una mala racha del Lab. Andes el mes pasado pesa de lleno (calidad y atrasos), pero su buen desempeño de hace 3 meses ya no cuenta. Subiéndolo a 180, la reputación se vuelve más estable y perdona tropiezos recientes.',
      links: [{ key: 'alphaQuality' }, { key: 'alphaPunctuality' }],
    },
    {
      label: 'Bono Infrautilización (días máx)',
      symbol: 'dBonusMaxDays',
      description:
        'Días tras los cuales el Bono de Infrautilización llega a su tope. Define qué tan rápido madura el empujón a técnicos sin casos.',
      example:
        'Con 30 días, el Lab. Sur alcanza el bono máximo recién al mes sin casos. Bajándolo a 10, su empujón se llena en 10 días y vuelve antes a las rondas.',
      links: [{ key: 'alphaBonus' }],
    },
    {
      label: 'Cooldown asignación',
      symbol: 'tCooldownMinutes',
      description:
        'Tiempo que un técnico queda excluido tras rechazar o dejar expirar una asignación, antes de poder volver a ser asignado. Filtro previo al score.',
      example:
        'Con 120 min, si el Lab. Pino deja expirar una asignación, Fauchard no lo vuelve a considerar por 2 horas y le da el turno a otros. Bajarlo lo reintegra más rápido; subirlo lo aparta más tiempo.',
    },
    {
      label: 'Inactividad Máxima (días)',
      symbol: 'dInactivityDays',
      description:
        'Si un técnico no inicia sesión ni interactúa en estos días, queda excluido temporalmente del pool. Filtro previo al score.',
      example:
        'Con 15 días, un Lab. Roble que lleva dos semanas sin entrar no recibe invitaciones (evita asignarle un caso urgente que no verá). Vuelve al pool apenas se reconecta.',
      links: [{ key: 'inactivityAutoOffDays' }],
    },
    {
      label: 'Tiempo para responder asignación',
      symbol: 'tQuoteMinutes',
      description:
        'Plazo máximo que tiene el técnico asignado para aceptar antes de que la asignación expire y pase al siguiente del ranking.',
      example:
        'Con 240 min (4 h), el técnico asignado al caso del Dr. Soto tiene 4 horas para aceptar; si no responde, la asignación vence y se ofrece al siguiente candidato de la cadena de respaldo.',
    },
    {
      label: 'Carga de Trabajo (Min)',
      symbol: 'loadReferenceMin',
      description:
        'Cuántos casos activos se consideran "carga llena" como referencia para el factor Carga (L). Es el piso del divisor: la carga de cada técnico se normaliza dividiéndola por este valor (o por la mayor carga del pool si alguien lo supera). Subirlo hace que la penalización por carga sea más suave (cuesta más "llenarse"); bajarlo la endurece.',
      example:
        'Con 5, un técnico con 1 caso activo tiene L = 1/5 = 0.20 (penalización leve) y con 5 casos llega a L = 1.0 (máxima). Si lo subes a 20, ese mismo técnico con 5 casos solo tendría L = 5/20 = 0.25: la carga influye mucho menos en el ranking.',
      links: [{ key: 'alphaLoad' }],
    },
  ],
  notes: [
    'Cooldown e Inactividad Máxima son filtros de exclusión: se aplican ANTES de calcular el score. Un técnico que no los cumple ni siquiera entra al ranking.',
    'Carga de Trabajo (Min) no es un filtro: alimenta el factor Carga (L) del score. No excluye a nadie, solo regula cuánto penaliza estar ocupado.',
  ],
};

export const PLAZOS_HELP: FauchardHelpSection = {
  title: 'Disponibilidad y Sanciones',
  intro:
    'Cómo Fauchard gestiona la disponibilidad de los técnicos y las consecuencias de no responder: el plazo de revisión del dentista, la espera cuando no hay técnicos elegibles, el reemplazo automático, la inactividad del switch y la sanción por no responder. Los pesos del score (incluido αN) se editan en la pestaña "Pesos del Score", no aquí.',
  params: [
    {
      label: 'Revisión del dentista',
      symbol: 'tDentistReviewHours',
      description: 'Plazo para que el dentista apruebe o pida cambios en cada entrega. Cada nueva entrega reinicia el contador.',
      example: 'Con 48 h, el Lab. Andes entrega el diseño y el Dr. Soto tiene 2 días para aprobar o pedir ajustes. Si pide cambios y el lab reentrega, el reloj vuelve a 48 h. Al vencer no hay auto-acción: solo se marca "respuesta vencida" + escalación.',
    },
    {
      label: 'Tiempo de espera (TTL)',
      symbol: 'tNoEligiblePoolHours',
      description: 'Cuánto espera un caso buscando técnicos disponibles (cola pendiente_pool) antes de fallar. Hay check-in al dentista al 50%.',
      example: 'Con 24 h, si no hay técnicos elegibles para el caso del Dr. Soto, espera hasta un día a que alguien se active; a las 12 h se le avisa al dentista que sigue buscando.',
      links: [{ key: 'maxPoolCycles' }],
    },
    {
      label: 'Ciclos de espera',
      symbol: 'maxPoolCycles',
      description: 'Cuántas veces se reintenta la espera antes de marcar el caso como "sin cotizaciones".',
      example: 'Con 2, el caso reintenta la cola dos veces; si tras ambas sigue sin elegibles, pasa a "sin cotizaciones" y el dentista puede republicar.',
      links: [{ key: 'tNoEligiblePoolHours' }],
    },
    {
      label: 'Margen de reemplazo',
      symbol: 'replacementCutoffMinutes',
      description: 'Margen mínimo antes del cierre de la ronda para enviar una invitación de reemplazo tras un rechazo.',
      example: 'Con 10 min, si un técnico rechaza cuando faltan 5 min para cerrar la ronda, ya no se invita a un reemplazo (no alcanzaría a cotizar). Si faltan 30, sí entra el siguiente del pool.',
    },
    {
      label: 'Recordatorio de actividad',
      symbol: 'inactivityReminderDays',
      description: 'Días con el switch de disponibilidad en ON sin actividad antes de un recordatorio suave + aviso en el badge.',
      example: 'Con 7 días, un Lab. Roble que dejó su disponibilidad encendida pero no entra hace una semana recibe un recordatorio. Debe ser menor que el auto-OFF.',
      links: [{ key: 'inactivityAutoOffDays' }],
    },
    {
      label: 'Auto-OFF preventivo',
      symbol: 'inactivityAutoOffDays',
      description: 'Días con el switch en ON sin login antes de pausar la disponibilidad automáticamente (evita invitar a quien no responderá).',
      example: 'Con 30 días, si el Lab. Roble lleva un mes sin entrar pese a estar "disponible", Fauchard apaga su switch para no enviarle casos a ciegas.',
      links: [{ key: 'inactivityReminderDays' }, { key: 'dInactivityDays' }],
    },
    {
      label: 'Ventana rolling (no-respuesta)',
      symbol: 'noResponseWindowDays',
      description: 'Solo cuentan las no-respuestas ocurridas dentro de esta ventana móvil. Las más viejas salen solas.',
      example: 'Con 14 días, una invitación ignorada hace 3 semanas ya no suma a la sanción del Lab. Pino: la curva "perdona" con el tiempo sin necesidad de intervención.',
      links: [{ key: 'noResponseRehabilitationDays' }],
    },
    {
      label: 'Rehabilitación',
      symbol: 'noResponseRehabilitationDays',
      description: 'Días sin nuevas no-respuestas para considerar al técnico rehabilitado.',
      example: 'Con 30 días, si el Lab. Pino responde puntualmente por un mes, su historial de sanción se considera saldado.',
      links: [{ key: 'noResponseWindowDays' }],
    },
    {
      label: 'Umbral Nivel 1 / 2 / 3',
      symbol: 'level1-3',
      description: 'Número de no-respuestas (en la ventana) que dispara cada nivel: 1 = aviso, 2 = penalización al score (−αN·N), 3 = auto-OFF del switch global. Deben cumplir Nivel 1 < Nivel 2 < Nivel 3.',
      example: 'Con 1 / 2 / 3: a la 1ª no-respuesta el Lab. Pino recibe un aviso; a la 2ª, su score baja; a la 3ª, Fauchard apaga su disponibilidad global y rechaza sus invitaciones pendientes.',
      links: [{ key: 'alphaNoResponse' }],
    },
  ],
  notes: [
    'Los umbrales de sanción deben cumplir Nivel 1 < Nivel 2 < Nivel 3.',
    'El recordatorio de inactividad debe ser anterior al auto-OFF (recordatorio < auto-OFF).',
    'La sanción decae sola al salir las no-respuestas de la ventana rolling: no requiere que un admin la limpie.',
    'El peso de la penalización (αN) y el resto de pesos del score se ajustan en la pestaña "Pesos del Score".',
    'El plazo para que el técnico acepte la asignación (Tiempo para responder asignación) se ajusta en "Selección y Asignación"; aquí solo va la Revisión del dentista.',
  ],
};

export const OBSERVABILITY_HELP: FauchardHelpSection = {
  title: 'Observabilidad',
  intro:
    'Este tablero es el "termómetro" del modelo: 13 métricas para detectar si los parámetros están bien calibrados. No se edita nada aquí; cada tarjeta te dice qué mirar y, si algo se sale de rango, qué parámetro tocar en las otras pestañas. Elige la ventana (7/30/90 días) y refresca manualmente.',
  params: [
    {
      label: 'Técnicos en Nivel 2 o 3',
      symbol: '#1',
      description: '% del pool con sanción activa de Nivel 2 o 3.',
      example: 'Si supera ~30%, la sanción está demasiado dura: suaviza la Penalización por No-respuesta (N) o sube los Umbrales de Nivel en Disponibilidad y Sanciones.',
      links: [{ key: 'alphaNoResponse' }, { key: 'level1Threshold' }],
    },
    {
      label: 'Invitaciones sin respuesta',
      symbol: '#2',
      description: '% de asignaciones que expiran sin que el técnico responda.',
      example: 'Si crece tras el rollout, suele ser un plazo de respuesta muy corto o una sanción mal calibrada. Revisa el Tiempo para responder asignación y la Ventana rolling de la sanción.',
      links: [{ key: 'tQuoteMinutes' }, { key: 'noResponseWindowDays' }],
    },
    {
      label: 'Casos en espera de pool',
      symbol: '#5',
      description: '% de casos activos atascados en la cola pendiente_pool por falta de técnicos elegibles.',
      example: 'Si supera ~20%, es un problema de oferta (faltan técnicos activos), no de parámetros: subir plazos no lo arregla.',
    },
    {
      label: 'Reemplazos exitosos',
      symbol: '#6',
      description: '% de reemplazos automáticos (tras un rechazo) que sí logran cotizar.',
      example: 'Si es bajo (<20%), los reemplazos llegan tarde: aumenta el Margen de reemplazo.',
      links: [{ key: 'replacementCutoffMinutes' }],
    },
    {
      label: 'Respuesta media del dentista',
      symbol: '#7',
      description: 'Horas promedio que tarda el dentista en revisar una entrega.',
      example: 'Si la mayoría responde en menos de 24 h, la Revisión del dentista (48 h por defecto) está holgada y podrías bajarla.',
      links: [{ key: 'tDentistReviewHours' }],
    },
    {
      label: 'Score promedio al invitar',
      symbol: '#8',
      description: 'Score medio de los técnicos en el momento de invitarlos.',
      example: 'Si todos caen en una franja muy angosta, el score no está discriminando: conviene re-tunear los Pesos del Score (p. ej. subir Experiencia Especializada (E) o Calidad Histórica (Q)).',
      links: [{ key: 'alphaExperience' }, { key: 'alphaQuality' }],
    },
    {
      label: 'Rechazo explícito vs no-respuesta',
      symbol: '#9',
      description: 'Proporción de técnicos que rechazan con el botón frente a los que simplemente ignoran.',
      example: 'Si es baja, el botón "Rechazar" no es visible o claro: a la plataforma le conviene el rechazo explícito (no penaliza y dispara reemplazo).',
    },
    {
      label: 'Tiempo medio del técnico al cotizar',
      symbol: '#10',
      description: 'Minutos promedio que tarda un técnico en responder con su oferta.',
      example: 'Muy bajo puede ser sobre-compromiso (aceptan sin mirar); muy alto, saturación. Ayuda a ajustar el Tiempo para responder asignación.',
      links: [{ key: 'tQuoteMinutes' }],
    },
    {
      label: 'Cotizaciones por caso',
      symbol: '#11',
      description: 'Promedio de ofertas que recibe cada caso.',
      example: 'Si la mayoría recibe solo 1, falta oferta o el número de Técnicos a invitar por caso es muy bajo: el dentista casi no tiene con qué comparar.',
      links: [{ key: 'nInvited' }],
    },
    {
      label: 'Funnel del caso',
      symbol: '#13',
      description: 'Conteo por etapa: Publicado → Propuesta lista → Aceptada → Completado.',
      example: 'Una caída fuerte entre dos etapas señala dónde se pierden casos (p. ej. muchos publicados pero pocas propuestas = problema de cotización).',
    },
    {
      label: 'Métricas 3, 4 y 12',
      symbol: '#3·#4·#12',
      description: 'Auto-OFF preventivos (#3), reactivación rápida post auto-OFF (#4) y check-ins respondidos (#12).',
      example: 'Se muestran como "—": requieren un historial de eventos que aún no se registra. Por ahora no están disponibles.',
    },
  ],
  notes: [
    'No es un panel de configuración: es de diagnóstico. Cada métrica apunta a un parámetro concreto en Pesos / Filtros / Plazos.',
    'Refresco manual (sin polling): el "Última actualización" indica de cuándo son los datos.',
  ],
};

export const HISTORY_HELP: FauchardHelpSection = {
  title: 'Historial',
  intro:
    'Registro de auditoría de todos los cambios de configuración Fauchard. Cada fila muestra cuándo, qué administrador, qué parámetro y el valor anterior → nuevo. Sirve para rastrear quién ajustó qué y para revertir mentalmente un cambio que haya empeorado las métricas.',
  params: [],
  notes: [
    'Cada guardado es copy-on-write versionado: no se sobrescribe la configuración, se crea una versión nueva que pasa a ser la activa y la anterior queda registrada. Por eso el historial es completo y no se pierde nada.',
    'Usa el buscador para filtrar por nombre de parámetro o por administrador.',
    'La flecha muestra el cambio "valor anterior → valor nuevo" del parámetro en esa edición.',
    'Si una métrica de Observabilidad empeoró, revisa aquí qué se cambió cerca de esa fecha y ajústalo en la pestaña correspondiente.',
  ],
};

export const LEAGUE_HELP: FauchardHelpSection = {
  title: 'Sistema de Categorías',
  intro:
    'Las categorías (Bronce, Plata, Oro, Élite) definen a qué nivel de complejidad puede optar cada técnico. Estos umbrales gobiernan el ascenso, el período de transición tras subir y el descenso. El motor automático que mueve a los técnicos entre categorías se activa con la Fase 2 (LEAGUE_ENGINE_ENABLED); mientras esté apagado, los valores se guardan pero no mueven a nadie, aunque la selección por liga sí usa la categoría actual de cada técnico.',
  params: [
    {
      label: 'Calificación Mínima',
      symbol: 'lMinRating',
      description:
        'Calificación promedio mínima (en la ventana de evaluación) requerida para ascender de categoría.',
      example:
        'El Lab. Andes está en Plata y aspira a Oro. Con la Calificación Mínima en 4.2 ⭐, debe sostener un promedio de al menos 4.2 en sus últimos casos para que el motor lo considere apto para subir. Si bajas el umbral a 4.0, más laboratorios alcanzan el ascenso; si lo subes a 4.6, el salto a la categoría superior se vuelve mucho más exigente.',
      links: [{ key: 'lCasesEvaluated' }, { key: 'lDescentRating' }],
    },
    {
      label: 'Ventana de Evaluación (Casos)',
      symbol: 'lCasesEvaluated',
      description:
        'Número de casos recientes que se analizan para verificar requisitos de ascenso.',
      example:
        'Con la ventana en 10, el motor mira los últimos 10 casos del Lab. Andes para promediar su calificación y puntualidad. Bajándola a 5 reacciona más rápido a una buena racha (pero también a una mala); subiéndola a 20 exige un desempeño sostenido en más casos antes de ascender.',
      links: [{ key: 'lMinRating' }],
    },
    {
      label: 'Puntualidad Mínima (%)',
      symbol: 'lMinPunctuality',
      description: 'Porcentaje mínimo de entregas a tiempo exigido para ascender.',
      example:
        'Con la Puntualidad Mínima en 85%, el Lab. Andes solo asciende si entregó a tiempo al menos el 85% de los casos de la ventana, por buena que sea su calificación. Subirla a 95% reserva el ascenso para los más cumplidores; bajarla a 75% da más peso a la calidad por sobre el cumplimiento de plazos.',
    },
    {
      label: 'Casos Completados Totales',
      symbol: 'lCasesCompleted',
      description:
        'Casos finalizados exitosamente requeridos como condición absoluta para ascender.',
      example:
        'Con el umbral en 15, un Lab. Sur nuevo y con excelentes notas todavía no puede saltar a Oro si lleva solo 9 casos terminados: necesita acumular al menos 15. Es un piso de experiencia mínima que no se compensa con buena calificación. Subirlo frena ascensos prematuros; bajarlo agiliza la progresión de laboratorios nuevos.',
    },
    {
      label: 'Casos en Transición',
      symbol: 'lCasesTransition',
      description:
        'Casos a completar en la nueva categoría antes de consolidar el ascenso (período de prueba).',
      example:
        'El Lab. Andes acaba de subir a Oro. Con Casos en Transición en 3, queda "a prueba" sus próximos 3 casos en Oro antes de consolidar la categoría. Subirlo alarga el período de prueba (más casos para confirmar que rinde en la categoría superior); bajarlo lo consolida antes.',
      links: [{ key: 'lPenaltyTransition' }],
    },
    {
      label: 'Penalización Transición (%)',
      symbol: 'lPenaltyTransition',
      description:
        'Reducción temporal del score durante el período de transición tras ascender.',
      example:
        'Con la penalización en 20%, mientras el Lab. Andes está a prueba en Oro su score se multiplica por 0.80 al competir por casos: entra al ruedo, pero con una pequeña desventaja frente a los Oro ya consolidados. Subirla protege más a los consolidados; bajarla hace que el recién ascendido compita casi de igual a igual.',
      links: [{ key: 'lCasesTransition' }],
    },
    {
      label: 'Calificación para Descenso',
      symbol: 'lDescentRating',
      description:
        'Si el promedio cae bajo este valor durante el período, el técnico desciende de categoría.',
      example:
        'Con la Calificación para Descenso en 3.0 ⭐, si el promedio del Lab. Roble cae por debajo de 3.0 y se mantiene así el tiempo definido, el motor lo baja una categoría. Debe ser estrictamente menor que la Calificación Mínima de ascenso, para evitar que un técnico suba y baje en el acto.',
      links: [{ key: 'lDescentDays' }, { key: 'lMinRating' }],
    },
    {
      label: 'Días en Baja Calificación',
      symbol: 'lDescentDays',
      description:
        'Días consecutivos bajo el umbral de descenso para que la bajada se haga efectiva.',
      example:
        'Con 60 días, el Lab. Roble no baja de categoría por una semana mala: su promedio debe permanecer bajo el umbral de descenso durante 60 días seguidos antes de que la bajada se aplique. Subirlo da más margen de recuperación; bajarlo hace el descenso más sensible a las malas rachas.',
      links: [{ key: 'lDescentRating' }],
    },
  ],
  notes: [
    'La Calificación para Descenso debe ser estrictamente menor que la Calificación Mínima de ascenso (el panel bloquea el guardado si no se cumple).',
    'El ascenso exige cumplir las tres condiciones a la vez: calificación, puntualidad y casos completados totales.',
    'Estos umbrales solo mueven técnicos cuando el motor de categorías está activo (LEAGUE_ENGINE_ENABLED); con el motor apagado se guardan pero no tienen efecto.',
  ],
};

export const SIMULATOR_HELP: FauchardHelpSection = {
  title: 'Simulador Sandbox',
  intro:
    'Arma un caso virtual y recorre el funnel del motor (Caso → Clasificación → Filtros → Ranking → Asignación) sin escribir en la base de datos. Navegación libre entre pasos — no es un wizard secuencial. Usa el pool real de técnicos activos y la configuración Fauchard activa. Modelo: asignación directa (top-1 + cadena de respaldo); no simula invitaciones masivas ni nInvited.',
  params: [
    {
      label: 'Restauración',
      symbol: 'sim-restoration',
      description:
        'Tipo de trabajo clínico del caso virtual. Junto con piezas y complejidad, determina el workType que Fauchard usa para filtrar skills y categoría de disponibilidad.',
      example:
        'Si eliges Corona, el motor busca técnicos con skill en coronas y aplica la categoría canónica Coronas en el filtro AND-triple (con el flag v5.0 activo).',
    },
    {
      label: 'Material',
      symbol: 'sim-material',
      description:
        'Segunda dimensión del lookup de precio de lista. Debe existir una regla en Admin → Precios que combine restauración + material + shade + urgencia.',
      example:
        'Corona + Zirconio multilayer + A2 + Normal resuelve a una regla con código prc_NNN y muestra compensación, fee y precio dentista en el preview.',
    },
    {
      label: 'Shade VITA',
      symbol: 'sim-shade',
      description: 'Tercera dimensión del precio de lista. El code opaco del catálogo se envía al resolver de reglas igual que al publicar un caso.',
      example: 'Cambiar de A2 a BL1 puede cambiar la regla aplicada y por tanto el precio mostrado en el bloque de preview.',
    },
    {
      label: 'Urgencia',
      symbol: 'sim-urgency',
      description:
        'Cuarta dimensión del precio. Se persiste y compara por label (Normal, Alta, etc.), no por code opaco.',
      example: 'Urgencia Alta puede activar una regla distinta con mayor compensación técnico si existe en el mantenedor de precios.',
    },
    {
      label: 'Piezas (cantidad)',
      symbol: 'sim-teeth',
      description:
        'Número de piezas del caso virtual. Con más de 1, genera un arreglo de dientes simulado que influye en la complejidad y la liga del escenario.',
      example: '3 piezas en una corona puede elevar la complejidad respecto a 1 pieza y cambiar qué técnicos pasan el filtro de skill mínimo por liga.',
    },
    {
      label: 'Pónticos (reemplaza ausentes)',
      symbol: 'sim-pontic',
      description:
        'Indica si el caso reemplaza dientes ausentes (Sí / No, igual que el wizard). Separa coronas múltiples de puentes.',
      example:
        'Corona con 4 piezas y póntico «No» → categoría Coronas. Las mismas 4 piezas con póntico «Sí» → Puente corto en categoría Puentes.',
    },
    {
      label: 'Complejidad',
      symbol: 'sim-complexity',
      description:
        'Modo Auto deriva la complejidad desde restauración y piezas. Modo Manual fija Básico / Intermedio / Crítico explícitamente, igual que en el wizard de casos.',
      example: 'Manual → Crítico fuerza liga Élite y workType exigente aunque la restauración sea simple, para probar un escenario extremo.',
    },
    {
      label: 'Clasificación derivada',
      symbol: 'sim-classify',
      description:
        'Badges de solo lectura: tipo de trabajo, liga, categoría de disponibilidad (7 canónicas v5.13) y complejidad. Se calculan con la misma lógica que classifyCase al publicar.',
      example:
        'Una corona intermedia en Plata muestra tipo «Coronas Múltiples (4–9)», liga plata y categoría Coronas. Verifícalos antes de pulsar Simular asignación.',
    },
    {
      label: 'Override α (sandbox)',
      symbol: 'sim-override',
      description:
        'Activa sliders locales Q/P/E/B/L/N que reemplazan los pesos de la config activa solo para esta corrida. No guarda en Configuración; la suma debe ser exactamente 1.0.',
      example:
        'Enciendes el toggle, subes αN y bajas αQ, y vuelves a simular sin tocar la config de producción. Al apagar el toggle vuelves a los α guardados.',
    },
    {
      label: 'Calidad Histórica (Q) — override',
      symbol: 'alphaQuality',
      description:
        'Peso del factor Q en el score de esta corrida (si el override está activo) o valor activo en Configuración (panel Parámetros activos). Influye en el ranking de técnicos elegibles.',
      example: 'Con αQ alto, un técnico con rating 4.8/5 sube en el ranking frente a uno con 3.5/5, a igualdad de otros factores.',
      links: [{ key: 'alphaQuality' }],
    },
    {
      label: 'Puntualidad (P) — override',
      symbol: 'alphaPunctuality',
      description: 'Peso del factor P: historial de entregas a tiempo del técnico en la ventana de casos completados.',
      example: 'Subir αP favorece al laboratorio que cumple el 95% de plazos frente al que suele atrasarse.',
      links: [{ key: 'alphaPunctuality' }],
    },
    {
      label: 'Experiencia (E) — override',
      symbol: 'alphaExperience',
      description: 'Peso del factor E: nivel de skill declarado para el workType del escenario virtual.',
      example: 'En una guía quirúrgica, αE alto prioriza al técnico con designLevel 7/7 sobre uno generalista.',
      links: [{ key: 'alphaExperience' }],
    },
    {
      label: 'Bono de Infrautilización (B) — override',
      symbol: 'alphaBonus',
      description:
        'Peso del factor B: impulsa a técnicos con poca actividad reciente para evitar que el trabajo se concentre siempre en los mismos laboratorios.',
      example:
        'Con αB alto, un laboratorio que lleva semanas sin casos sube posiciones frente a uno que ya recibió varias asignaciones este mes.',
      links: [{ key: 'alphaBonus' }],
    },
    {
      label: 'Carga activa (L) — override',
      symbol: 'alphaLoad',
      description: 'Peso de penalización por carga: resta score a técnicos con muchos casos activos en curso.',
      example: 'Con αL alto, un técnico saturado con 8 casos abiertos cae en el ranking aunque tenga buena calidad.',
      links: [{ key: 'alphaLoad' }],
    },
    {
      label: 'No-respuesta (N) — override',
      symbol: 'alphaNoResponse',
      description:
        'Peso de penalización por sanción rolling de no-respuesta (−αN·N). Solo resta si el técnico tiene sanción activa (flag v5.0).',
      example: 'Un técnico en Nivel 2 de sanción pierde posiciones en el ranking si αN está alto.',
      links: [{ key: 'alphaNoResponse' }],
    },
    {
      label: 'Calidad histórica (ventana Q)',
      symbol: 'wQualityDays-q',
      description:
        'Días hacia atrás con los que se miden los ratings del técnico para calcular el factor Q. Un valor menor hace el score más reactivo a calificaciones recientes; uno mayor lo estabiliza.',
      example: 'Con 30 días, solo cuentan ratings del último mes. Con 180, una racha mala de hace 3 meses aún pesa pero se diluye entre más casos.',
      links: [{ key: 'wQualityDays' }],
    },
    {
      label: 'Puntualidad histórica (ventana P)',
      symbol: 'wQualityDays-p',
      description:
        'Días hacia atrás con los que se mide el % de entregas a tiempo del técnico para calcular el factor P. Comparte la misma ventana que Calidad — un único parámetro configurable.',
      example: 'Con 90 días, un técnico que cumplió 9 de 10 plazos en los últimos 3 meses tiene onTimeRate = 0.90. Si amplías a 180, entregas antiguas tardías también cuentan.',
      links: [{ key: 'wQualityDays' }],
    },
    {
      label: 'Cooldown',
      symbol: 'tCooldownMinutes',
      description:
        'Minutos que un técnico queda excluido tras una asignación reciente del mismo workType. Filtro duro previo al score.',
      example: 'Con 120 min, si el Lab. Pino recibió una asignación de coronas hace 1 hora, no entra al pool aunque esté disponible.',
      links: [{ key: 'tCooldownMinutes' }],
    },
    {
      label: 'Inactividad',
      symbol: 'dInactivityDays',
      description: 'Días sin login tras los cuales el técnico queda excluido del pool por inactividad.',
      example: 'Con 15 días, un técnico que no entra hace dos semanas aparece en el embudo como inactive.',
      links: [{ key: 'dInactivityDays' }],
    },
    {
      label: 'Intentos máximos de asignación',
      symbol: 'maxAssignmentAttempts',
      description:
        'Cuántos técnicos forman la cadena de respaldo en asignación directa (ganador + respaldos). No es nInvited ni invitaciones masivas.',
      example: 'Con 3 intentos, la cadena coloreada muestra hasta 3 posiciones: verde al #1 y ámbar a #2 y #3.',
      links: [{ key: 'maxAssignmentAttempts' }],
    },
    {
      label: 'Plazo de respuesta',
      symbol: 'tQuoteMinutes',
      description:
        'Plazo de referencia mostrado en la cadena de asignación. En asignación directa marca cuánto tiempo tiene el técnico para aceptar antes de pasar al respaldo.',
      example: 'Con 30 min, la UI de resultados muestra "Plazo 30 min" junto a la cadena de respaldo.',
      links: [{ key: 'tQuoteMinutes' }],
    },
    {
      label: 'Filtros duros (resumen)',
      symbol: 'sim-filters',
      description:
        'Conjunto de exclusiones previas al score: disponibilidad global, suspensión, inactividad, cooldown, liga (con expansión), skill mínimo y AND-triple v5.0.',
      example:
        'El embudo de resultados desglosa cuántos técnicos cayeron en cada motivo, incluido availability_filter (AND-triple de disponibilidad).',
      links: [{ key: 'tCooldownMinutes' }, { key: 'dInactivityDays' }],
    },
    {
      label: 'Embudo y pool vacío',
      symbol: 'sim-funnel',
      description:
        'Embudo secuencial en barras: parte del universo de técnicos activos y muestra cuántos quedan tras cada filtro en el mismo orden que el motor (exclusión manual → disponible global → liga → suspensión → inactividad → cooldown → skill → disponibilidad CAD). La etapa que vacía el pool (bottleneck) se resalta con orientación para resolverlo.',
      example:
        'Si 18 técnicos caen todos en «Disponibilidad CAD · Coronas», verás la barra bajar a 0 en esa etapa con el hint de activar switches en Perfil → Disponibilidad. Los chips colapsables muestran el desglose legacy por primer fallo.',
    },
  ],
  notes: [
    'Parámetros de Configuración que no influyen en esta simulación: nInvited, tProposalHours, platformFee y plazos post-asignación (revisión dentista, cola pool, sanción rolling). Nota: wLoadDays y cMax eran controles inertes y se retiraron de la configuración.',
    'Para cambiar valores persistentes, usa Configuración Fauchard (/dashboard/admin/fauchard). El panel "Parámetros activos" muestra solo los que afectan el motor de asignación directa.',
  ],
};

// ─── Mapa: clave de parámetro de config → descripción ────────────────────────
// Fuente única: los tooltips de los paneles reutilizan EXACTAMENTE la misma
// descripción que la ayuda (sin el ejemplo), sin duplicar el texto.
function descByLabel(section: FauchardHelpSection, label: string): string {
  return section.params.find((p) => p.label === label)?.description ?? '';
}

export const FAUCHARD_PARAM_TOOLTIP: Record<string, string> = {
  // Pesos del Score
  alphaQuality: descByLabel(WEIGHTS_HELP, 'Calidad Histórica'),
  alphaPunctuality: descByLabel(WEIGHTS_HELP, 'Puntualidad'),
  alphaExperience: descByLabel(WEIGHTS_HELP, 'Experiencia Especializada'),
  alphaLoad: descByLabel(WEIGHTS_HELP, 'Penalización por Carga'),
  alphaBonus: descByLabel(WEIGHTS_HELP, 'Bono de Infrautilización'),
  alphaNoResponse: descByLabel(WEIGHTS_HELP, 'Penalización por No-respuesta'),
  // Selección y Asignación
  wQualityDays: descByLabel(FILTERS_HELP, 'Ventana histórica (días)'),
  dBonusMaxDays: descByLabel(FILTERS_HELP, 'Bono Infrautilización (días máx)'),
  tCooldownMinutes: descByLabel(FILTERS_HELP, 'Cooldown asignación'),
  dInactivityDays: descByLabel(FILTERS_HELP, 'Inactividad Máxima (días)'),
  loadReferenceMin: descByLabel(FILTERS_HELP, 'Carga de Trabajo (Min)'),
  maxAssignmentAttempts: 'Máximo de técnicos a intentar por caso antes de cola pool o fallo.',
  tQuoteMinutes: descByLabel(FILTERS_HELP, 'Tiempo para responder asignación'),
  // Disponibilidad y Sanciones
  tDentistReviewHours: descByLabel(PLAZOS_HELP, 'Revisión del dentista'),
  tNoEligiblePoolHours: descByLabel(PLAZOS_HELP, 'Tiempo de espera (TTL)'),
  maxPoolCycles: descByLabel(PLAZOS_HELP, 'Ciclos de espera'),
  replacementCutoffMinutes: descByLabel(PLAZOS_HELP, 'Margen de reemplazo'),
  inactivityReminderDays: descByLabel(PLAZOS_HELP, 'Recordatorio de actividad'),
  inactivityAutoOffDays: descByLabel(PLAZOS_HELP, 'Auto-OFF preventivo'),
  noResponseWindowDays: descByLabel(PLAZOS_HELP, 'Ventana rolling (no-respuesta)'),
  noResponseRehabilitationDays: descByLabel(PLAZOS_HELP, 'Rehabilitación'),
  level1Threshold: descByLabel(PLAZOS_HELP, 'Umbral Nivel 1 / 2 / 3'),
  level2Threshold: descByLabel(PLAZOS_HELP, 'Umbral Nivel 1 / 2 / 3'),
  level3Threshold: descByLabel(PLAZOS_HELP, 'Umbral Nivel 1 / 2 / 3'),
  // Sistema de Categorías (Liga)
  lMinRating: descByLabel(LEAGUE_HELP, 'Calificación Mínima'),
  lCasesEvaluated: descByLabel(LEAGUE_HELP, 'Ventana de Evaluación (Casos)'),
  lMinPunctuality: descByLabel(LEAGUE_HELP, 'Puntualidad Mínima (%)'),
  lCasesCompleted: descByLabel(LEAGUE_HELP, 'Casos Completados Totales'),
  lCasesTransition: descByLabel(LEAGUE_HELP, 'Casos en Transición'),
  lPenaltyTransition: descByLabel(LEAGUE_HELP, 'Penalización Transición (%)'),
  lDescentRating: descByLabel(LEAGUE_HELP, 'Calificación para Descenso'),
  lDescentDays: descByLabel(LEAGUE_HELP, 'Días en Baja Calificación'),
};

/** Descripción (sin ejemplo) para el tooltip de un parámetro. Vacío si no existe. */
export function fauchardParamTooltip(key: string): string {
  return FAUCHARD_PARAM_TOOLTIP[key] ?? '';
}

// ─── Mapa: clave de parámetro → label de ORIGEN (el del control) + ubicación ──
// Para que un link de ayuda muestre el parámetro con el MISMO nombre que tiene
// en su panel de edición y pueda navegar al espacio que lo contiene.

export type FauchardParamPanel = 'weights' | 'filters' | 'plazos' | 'league';

/** Label exacto del control en su panel (ej. alphaNoResponse → "Penalización por No-respuesta (N)"). */
export const FAUCHARD_PARAM_LABEL: Record<string, string> = {
  // Pesos del Score
  alphaQuality: 'Calidad Histórica (Q)',
  alphaPunctuality: 'Puntualidad (P)',
  alphaExperience: 'Experiencia Especializada (E)',
  alphaBonus: 'Bono de Infrautilización (B)',
  alphaLoad: 'Carga activa (L)',
  alphaNoResponse: 'Penalización por No-respuesta (N)',
  // Asignación
  wQualityDays: 'Ventana histórica (días)',
  dBonusMaxDays: 'Bono Infrautilización (días máx)',
  tCooldownMinutes: 'Cooldown asignación',
  dInactivityDays: 'Inactividad Máxima (días)',
  maxAssignmentAttempts: 'Intentos máximos de asignación',
  tQuoteMinutes: 'Tiempo para responder asignación',
  loadReferenceMin: 'Carga de Trabajo (Min)',
  // Disponibilidad y Sanciones
  tDentistReviewHours: 'Revisión del dentista',
  tNoEligiblePoolHours: 'Tiempo de espera (TTL)',
  maxPoolCycles: 'Ciclos de espera',
  replacementCutoffMinutes: 'Margen de reemplazo',
  inactivityReminderDays: 'Recordatorio de actividad',
  inactivityAutoOffDays: 'Auto-OFF preventivo',
  noResponseWindowDays: 'Ventana rolling',
  noResponseRehabilitationDays: 'Rehabilitación',
  level1Threshold: 'Umbral Nivel 1 / 2 / 3',
  level2Threshold: 'Umbral Nivel 2',
  level3Threshold: 'Umbral Nivel 3',
  // Sistema de Categorías (Liga)
  lMinRating: 'Calificación Mínima',
  lCasesEvaluated: 'Ventana de Evaluación (Casos)',
  lMinPunctuality: 'Puntualidad Mínima (%)',
  lCasesCompleted: 'Casos Completados Totales',
  lCasesTransition: 'Casos en Transición',
  lPenaltyTransition: 'Penalización Transición (%)',
  lDescentRating: 'Calificación para Descenso',
  lDescentDays: 'Días en Baja Calificación',
};

/** Panel (y por ende espacio de TabClient) que contiene cada parámetro. */
export const FAUCHARD_PARAM_PANEL: Record<string, FauchardParamPanel> = {
  alphaQuality: 'weights', alphaPunctuality: 'weights', alphaExperience: 'weights',
  alphaBonus: 'weights', alphaLoad: 'weights', alphaNoResponse: 'weights',
  wQualityDays: 'filters', dBonusMaxDays: 'filters',
  tCooldownMinutes: 'filters', dInactivityDays: 'filters', maxAssignmentAttempts: 'filters',
  tQuoteMinutes: 'filters', loadReferenceMin: 'filters',
  tDentistReviewHours: 'plazos', tNoEligiblePoolHours: 'plazos', maxPoolCycles: 'plazos',
  replacementCutoffMinutes: 'plazos', inactivityReminderDays: 'plazos', inactivityAutoOffDays: 'plazos',
  noResponseWindowDays: 'plazos', noResponseRehabilitationDays: 'plazos',
  level1Threshold: 'plazos', level2Threshold: 'plazos', level3Threshold: 'plazos',
  lMinRating: 'league', lCasesEvaluated: 'league', lMinPunctuality: 'league', lCasesCompleted: 'league',
  lCasesTransition: 'league', lPenaltyTransition: 'league', lDescentRating: 'league', lDescentDays: 'league',
};

/** Label de origen del parámetro (fallback a la clave si no está mapeado). */
export function fauchardParamLabel(key: string): string {
  return FAUCHARD_PARAM_LABEL[key] ?? key;
}

/** Panel que edita el parámetro ('weights' | 'filters' | 'plazos' | 'league'). */
export function fauchardParamPanel(key: string): FauchardParamPanel | undefined {
  return FAUCHARD_PARAM_PANEL[key];
}

/** Espacio de TabClient (`/dashboard/admin/fauchard`) que contiene el parámetro. */
export function fauchardParamSpace(key: string): 'parametros' | 'categorias' {
  const panel = FAUCHARD_PARAM_PANEL[key];
  if (panel === 'league') return 'categorias';
  return 'parametros';
}

// ─── Numeración estable de parámetros (cruza el help ⇄ las referencias) ───────
// Cada parámetro tiene un número N° fijo que se muestra IGUAL en su tarjeta de
// ayuda y en las referencias desde Observabilidad, para poder localizarlo sin
// ambigüedad (el label puede repetir palabras; el número es único).

/**
 * Orden canónico → número N° (índice + 1). Sigue el orden de las pestañas del
 * configurador: Parámetros (Pesos · Selección · Disponibilidad) → Categorías → Calendario.
 * El número es de PRESENTACIÓN (badge en los paneles y la ventana de ayuda): no se
 * persiste, no va en URLs (los deep-link usan `?focus=<key>`) ni en analítica. Si cambia
 * el orden de las pestañas, reordenar aquí para que la numeración siga siendo correlativa.
 */
const FAUCHARD_PARAM_ORDER: string[] = [
  // Pesos del Score (6 factores)
  'alphaQuality', 'alphaPunctuality', 'alphaExperience', 'alphaBonus', 'alphaLoad', 'alphaNoResponse',
  // Selección y asignación (orden = render del panel: Ventanas → Filtros → Reglas → Plazos)
  'wQualityDays', 'dBonusMaxDays', 'tCooldownMinutes', 'dInactivityDays',
  'maxAssignmentAttempts', 'loadReferenceMin', 'tQuoteMinutes',
  // Disponibilidad y Sanciones
  'tDentistReviewHours', 'tNoEligiblePoolHours', 'maxPoolCycles', 'replacementCutoffMinutes',
  'inactivityReminderDays', 'inactivityAutoOffDays', 'noResponseWindowDays',
  'noResponseRehabilitationDays', 'level1Threshold', 'level2Threshold', 'level3Threshold',
  // Sistema de Categorías (Liga)
  'lMinRating', 'lCasesEvaluated', 'lMinPunctuality', 'lCasesCompleted',
  'lCasesTransition', 'lPenaltyTransition', 'lDescentRating', 'lDescentDays',
];

const FAUCHARD_PARAM_NUMBER: Record<string, number> = Object.fromEntries(
  FAUCHARD_PARAM_ORDER.map((k, i) => [k, i + 1]),
);

/** Número estable (N°) del parámetro; undefined si la clave no es un parámetro numerado. */
export function fauchardParamNumber(key: string): number | undefined {
  return FAUCHARD_PARAM_NUMBER[key];
}

/** `symbol` de una tarjeta de ayuda → clave de config. En Selección/Disponibilidad
 *  el `symbol` ya es la clave; los pesos usan letra y algunas tarjetas agrupan
 *  varias claves (umbrales / horario) bajo una representativa. */
const HELP_SYMBOL_TO_KEY: Record<string, string> = {
  Q: 'alphaQuality', P: 'alphaPunctuality', E: 'alphaExperience', B: 'alphaBonus',
  L: 'alphaLoad', C: 'alphaLoad', N: 'alphaNoResponse',
  'level1-3': 'level1Threshold',
};

/** Clave de config de una tarjeta de ayuda (o undefined si no es un parámetro numerado,
 *  p. ej. las métricas de Observabilidad con symbol "#1"). */
export function helpParamKey(symbol?: string): string | undefined {
  if (!symbol) return undefined;
  const k = HELP_SYMBOL_TO_KEY[symbol] ?? symbol;
  return FAUCHARD_PARAM_NUMBER[k] !== undefined ? k : undefined;
}

/** Tarjetas de ayuda que agrupan varias claves bajo un mismo título (umbrales, horario). */
const HELP_SYMBOL_TO_KEYS: Record<string, string[]> = {
  'level1-3': ['level1Threshold', 'level2Threshold', 'level3Threshold'],
};

/** Texto de número(s) para la insignia de una tarjeta de ayuda: "N°15" o "N°26–28"
 *  para tarjetas que agrupan varios controles. Undefined si no es un parámetro. */
export function helpParamNumberText(symbol?: string): string | undefined {
  if (!symbol) return undefined;
  const grouped = HELP_SYMBOL_TO_KEYS[symbol];
  if (grouped) {
    const nums = grouped.map((k) => FAUCHARD_PARAM_NUMBER[k]).filter((n): n is number => n != null).sort((a, b) => a - b);
    if (!nums.length) return undefined;
    return nums.length === 1 ? `N°${nums[0]}` : `N°${nums[0]}–${nums[nums.length - 1]}`;
  }
  const k = helpParamKey(symbol);
  const n = k ? FAUCHARD_PARAM_NUMBER[k] : undefined;
  return n != null ? `N°${n}` : undefined;
}
