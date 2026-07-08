// Contenido de ayuda flotante para /dashboard/admin/feature-flags.
// Mismo patrón que lib/constants/fauchardHelp.ts: datos, no JSX, para que sea
// reutilizable y testeable. Se renderiza dentro de <FauchardHelpWindow>.

import type { FauchardHelpSection } from '@/lib/constants/fauchardHelp';

export const FEATURE_FLAGS_HELP: FauchardHelpSection = {
  title: 'Feature Flags',
  intro:
    'Interruptores que activan o desactivan funciones del sistema en segundos, sin deploy. Cada cambio queda registrado (quién, cuándo, valor anterior y nuevo) en el historial.',
  params: [
    {
      label: 'Botón "Rechazar invitación"',
      symbol: 'REJECTION_INDIVIDUAL_ENABLED',
      description:
        'Habilita en el UCH del técnico el botón para rechazar una asignación explícitamente (sin contar como "no respondió", que sanciona).',
      example:
        'Detectas que varios técnicos rechazan por rechazar y los casos rebotan demasiado. Apagas el botón desde el admin: desde ese momento los técnicos solo pueden aceptar o dejar expirar, mientras decides si ajustar la regla.',
    },
    {
      label: 'Cola de espera cuando no hay técnicos',
      symbol: 'POOL_PENDIENTE_ENABLED',
      description:
        'Si Fauchard no encuentra ningún técnico elegible, el caso entra a una cola que se reintenta cada 2 minutos, en vez de quedar rechazado de inmediato.',
      example:
        'Un feriado largo deja a todos los técnicos de removible como no disponibles. Con la cola encendida, el caso del Dr. Soto espera y se asigna solo cuando el primer técnico vuelve; apagada, el caso fallaría y el dentista tendría que republicarlo.',
    },
    {
      label: 'Motor de ligas',
      symbol: 'LEAGUE_ENGINE_ENABLED',
      description:
        'Activa el cálculo automático diario de ascensos y descensos de categoría (Bronce/Plata/Oro/Élite) y la penalización de score durante transiciones. Apagado, cada técnico conserva su liga fija.',
      example:
        'El cron nocturno degradó a un técnico Élite por un error de datos y su score cayó injustamente. Apagas el motor desde el admin para congelar las ligas esa noche, corriges los datos, y lo reenciendes — sin tocar producción.',
    },
    {
      label: 'Revisión de calidad',
      symbol: 'QUALITY_GATE_ENABLED',
      description:
        'Activa la revisión de calidad de los casos completados (asignación de revisor, plazos de revisión, métricas).',
      example:
        'Los revisores están sobrecargados y la cola de calidad retrasa el cierre de casos. Lo apagas temporalmente: los casos se completan directo, y lo reactivas cuando el equipo se ponga al día.',
    },
    {
      label: 'Vigencia del link de verificación (minutos)',
      symbol: 'EMAIL_VERIFICATION_TTL_MINUTES',
      description:
        'Cuántos minutos es válido el link que recibe un usuario nuevo para verificar su email. Por defecto: 15.',
      example:
        'Varios dentistas se registran desde la clínica pero abren el correo horas después, y el link ya expiró. Lo subes de 15 a 60 desde el admin y el problema desaparece — sin deploy ni reinicio.',
    },
    {
      label: 'Timeout de sesión',
      symbol: 'SESSION_TIMEOUTS_ENABLED',
      description:
        'Cierra la sesión automáticamente por inactividad o al superar el tiempo máximo desde el login, validado en el servidor (no solo en la cookie del navegador).',
      example:
        'Un usuario deja la sesión abierta toda la noche en un computador compartido. Con el flag encendido, la sesión expira sola por inactividad (ver "Minutos de inactividad") aunque nadie la cierre manualmente.',
    },
    {
      label: 'Minutos de inactividad',
      symbol: 'SESSION_IDLE_TIMEOUT_MINUTES',
      description:
        'Minutos sin actividad antes de cerrar la sesión (solo aplica con "Timeout de sesión" encendido). Cada acción del usuario la renueva. Por defecto: 120.',
      example:
        'Los técnicos se quejan de que la sesión se cierra mientras revisan un modelo 3D sin interactuar con el servidor. Subes el valor desde el admin sin necesidad de deploy.',
    },
    {
      label: 'Horas máximas de sesión',
      symbol: 'SESSION_ABSOLUTE_TIMEOUT_HOURS',
      description:
        'Horas máximas desde el login antes de forzar un nuevo inicio de sesión, sin importar la actividad (solo aplica con "Timeout de sesión" encendido). Por defecto: 8.',
      example:
        'Se detecta que conviene acortar la ventana máxima de una sesión robada. Bajas el valor desde el admin y el cambio aplica de inmediato a las próximas verificaciones.',
    },
  ],
  notes: [
    'Los valores editables aquí viven en la tabla feature_flag; .env.local queda solo como respaldo de arranque o si la base de datos no responde.',
    'Un cambio surte efecto de inmediato en el servidor donde se guardó, y en el resto de las instancias en menos de 30 segundos.',
  ],
};

/** Subconjunto de fauchard_config que algunos flags dejan inerte al apagarse (valores reales, no genéricos). */
export type FlagImpactConfig = {
  tNoEligiblePoolHours: number;
  maxPoolCycles: number;
  lMinRating: number;
  lCasesEvaluated: number;
  lMinPunctuality: number;
  lCasesCompleted: number;
  lCasesTransition: number;
  lPenaltyTransition: number;
  lDescentRating: number;
  lDescentDays: number;
  tQualityReviewHours: number;
};

/**
 * Impacto concreto de encender/apagar un flag booleano, para el doble check antes de
 * aplicar el cambio. Los tres flags que gatean parámetros numéricos de `fauchard_config`
 * (pool, ligas, calidad) reciben `config` con los valores reales activos en ese momento —
 * el texto nombra exactamente qué plazo/umbral deja de usarse, no una descripción genérica.
 * Los demás flags no gatean parámetros (son solo interruptores de UI o de comportamiento
 * binario) y no requieren `config`.
 */
export function getFeatureFlagImpact(
  key: string,
  direction: 'on' | 'off',
  config: FlagImpactConfig | null,
): string {
  switch (key) {
    case 'REJECTION_INDIVIDUAL_ENABLED':
      return direction === 'on'
        ? 'Los técnicos vuelven a ver el botón "Rechazar invitación" en el UCH: pueden declinar una asignación de forma explícita y esto no cuenta como sanción. En cuanto rechazan, Fauchard invita automáticamente al siguiente candidato del ranking, así que el caso no se detiene. Ningún caso que ya esté asignado en este momento se ve afectado — el cambio solo rige para invitaciones futuras.'
        : 'El botón "Rechazar invitación" desaparece del UCH del técnico. A partir de ahora, ante una asignación un técnico solo tiene dos caminos: aceptarla, o no hacer nada hasta que expire el plazo — y dejarla expirar sí cuenta como "no respondió", lo que puede sumar hacia una sanción (rolling 14 días). Es decir, se pierde la vía "limpia" de decir que no, y los técnicos que antes rechazaban explícitamente ahora quedarán expuestos a sanción si simplemente ignoran la invitación. No se pierde ningún parámetro numérico configurado, solo esa opción del flujo.';

    case 'POOL_PENDIENTE_ENABLED': {
      const ttl = config ? `${config.tNoEligiblePoolHours} horas` : 'el valor configurado';
      const ciclos = config ? `${config.maxPoolCycles}` : 'el número configurado de';
      return direction === 'on'
        ? `Se retoma la cola de espera: cuando un caso nuevo no encuentre ningún técnico elegible, en vez de fallar de inmediato entrará a "pendiente_pool" y Fauchard reintentará asignarlo automáticamente hasta el Tiempo de espera (TTL = ${ttl}) o el máximo de ${ciclos} ciclos de reintento, ambos configurados en Plazos y sanciones. El dentista recibe un check-in a mitad de camino del TTL.`
        : `El Tiempo de espera (TTL = ${ttl}) y el máximo de ${ciclos} ciclos de reintento configurados en Plazos y sanciones dejan de aplicarse a partir de ahora — no se borran de la configuración, solo quedan sin uso mientras el flag esté apagado. Efecto inmediato: cualquier caso nuevo que no encuentre técnico elegible fallará al instante como "sin asignación", en vez de esperar en cola a que alguien quede disponible; el dentista tendría que republicarlo manualmente. Los casos que ya estén esperando en la cola en este momento siguen su curso sin verse afectados retroactivamente — pero ningún caso nuevo podrá entrar a esa cola.`;
    }

    case 'LEAGUE_ENGINE_ENABLED': {
      const c = config;
      const list = c
        ? `calificación mínima ${c.lMinRating.toFixed(2)}⭐ sobre ${c.lCasesEvaluated} casos evaluados, puntualidad mínima ${Math.round(c.lMinPunctuality * 100)}%, ${c.lCasesCompleted} casos completados totales, ${c.lCasesTransition} casos en transición con ${Math.round(c.lPenaltyTransition * 100)}% de penalización de score, y descenso por calificación sostenida bajo ${c.lDescentRating.toFixed(2)}⭐ durante ${c.lDescentDays} días`
        : 'los umbrales configurados en la pestaña Categorías'
      ;
      return direction === 'on'
        ? `Se reactiva el cron diario de ligas: a partir de la próxima corrida, Fauchard vuelve a evaluar a cada técnico contra los umbrales configurados en Categorías (${list}) y mueve de categoría (Bronce/Plata/Oro/Élite) a quien corresponda ascender o descender, aplicando la penalización de score durante transiciones.`
        : `El cron diario de ligas deja de correr, así que ninguno de estos umbrales se vuelve a evaluar mientras el flag esté apagado: ${list}. Efecto inmediato: cada técnico se congela en la categoría que tiene ahora mismo — nadie asciende ni desciende, y la penalización de score por transición deja de aplicarse — hasta que reactives el motor. La configuración de Categorías no se borra, solo queda inerte; al reencender, el cron retoma la evaluación con esos mismos valores.`;
    }

    case 'QUALITY_GATE_ENABLED': {
      const hrs = config ? `${config.tQualityReviewHours} horas` : 'el plazo configurado';
      return direction === 'on'
        ? `Se retoma la compuerta de Calidad: las entregas nuevas del técnico dejan de ir directo al dentista y pasan primero por un revisor asignado, con un plazo de revisión de ${hrs} (configurado en Plazos y sanciones) antes de continuar el flujo.`
        : `El plazo de revisión de Calidad de ${hrs} deja de aplicarse a partir de ahora — no se borra de la configuración, solo queda sin uso. Efecto inmediato: toda entrega nueva del técnico salta directo al dentista, sin pasar por un revisor de Calidad ni por ese plazo. Los casos que ya estén en revisión de Calidad en este momento no se mueven automáticamente al apagar el flag — siguen su curso ahí hasta que el revisor los complete; el cambio solo afecta entregas nuevas desde este momento en adelante.`;
    }

    case 'SESSION_TIMEOUTS_ENABLED':
      return direction === 'on'
        ? 'A partir de ahora el servidor valida en cada acción si la sesión sigue vigente: se cierra sola tras el número de minutos de inactividad configurado, o al cumplirse las horas máximas desde el login, lo que ocurra primero. Las sesiones abiertas en este momento quedan cubiertas de inmediato — su reloj de inactividad y de tiempo máximo arranca a partir de este cambio, no las expulsa retroactivamente.'
        : 'El servidor deja de cerrar sesiones por inactividad o por tiempo máximo. Las sesiones vuelven a depender solo de la cookie del navegador (hasta 8 horas, salvo que se ajuste por variable de entorno). Los minutos de inactividad y las horas máximas configurados no se borran, solo quedan sin uso hasta que reenciendas el flag.';

    default:
      return 'Este cambio no tiene una descripción de impacto registrada — revisa el código antes de aplicarlo.';
  }
}

/** Impacto de un flag numérico (TTL de verificación, timeouts de sesión) — depende del valor nuevo, no es on/off. */
export function getNumericFlagImpact(key: string, fromValue: string, toValue: string): string {
  const fromN = Number(fromValue);
  const toN = Number(toValue);
  const direction = toN > fromN ? 'más tiempo' : toN < fromN ? 'menos tiempo' : 'el mismo tiempo';

  switch (key) {
    case 'EMAIL_VERIFICATION_TTL_MINUTES':
      return `Todo link de verificación que se genere después de guardar este cambio será válido por ${toValue} minutos (antes: ${fromValue}) — es decir, los usuarios que se registren desde ahora tendrán ${direction} para hacer clic antes de que el link expire y tengan que pedir uno nuevo. Los links que ya fueron enviados antes de este cambio conservan el plazo con el que se generaron originalmente: esto no los alarga ni los acorta retroactivamente, así que nadie que ya tenga un correo de verificación en su bandeja se ve afectado.`;

    case 'SESSION_IDLE_TIMEOUT_MINUTES':
      return `Desde este cambio, cualquier sesión (con "Timeout de sesión" encendido) se cerrará tras ${toValue} minutos sin actividad (antes: ${fromValue}) — los usuarios tendrán ${direction} antes de ser desconectados por inactividad. Las sesiones ya abiertas usan el nuevo valor en su próxima verificación, no se cierran de golpe al guardar.`;

    case 'SESSION_ABSOLUTE_TIMEOUT_HOURS':
      return `Desde este cambio, ninguna sesión (con "Timeout de sesión" encendido) podrá superar ${toValue} horas desde el login (antes: ${fromValue}), sin importar la actividad — ${direction} antes de tener que iniciar sesión de nuevo. Las sesiones ya abiertas quedan sujetas al nuevo tope en su próxima verificación.`;

    default:
      return `El valor cambia de ${fromValue} a ${toValue}.`;
  }
}
