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
      label: 'Pantallas de disponibilidad para el técnico',
      symbol: 'AVAILABILITY_UI_TECNICO_ENABLED',
      description:
        'Muestra al técnico el badge de disponibilidad en el header y su panel de niveles (global / capacidad CAD / categorías). Es solo la parte visual; el motor de disponibilidad funciona sin ella.',
      example:
        'Quieres que el motor filtre por disponibilidad desde el lunes, pero prefieres estrenar la interfaz con los técnicos una semana después, tras enviarles el instructivo. Enciendes el motor hoy y este switch el otro lunes — sin ningún deploy de por medio.',
    },
    {
      label: 'Panel admin "Plazos y sanciones"',
      symbol: 'AVAILABILITY_ADMIN_PANEL_ENABLED',
      description:
        'Muestra en el panel Fauchard del admin la pestaña de plazos/sanciones y el dashboard de observabilidad del modelo de disponibilidad.',
      example:
        'Durante la marcha blanca solo tú deberías ver esas herramientas. Las enciendes en staging para probarlas y las mantienes apagadas en producción hasta que el modelo esté estable — cada cambio, un clic.',
    },
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
    case 'AVAILABILITY_UI_TECNICO_ENABLED':
      return direction === 'on'
        ? 'Los técnicos vuelven a ver el badge de disponibilidad en el header y pueden editar sus niveles (global / CAD / categoría) desde su perfil. No hay parámetros involucrados: es solo la interfaz.'
        : 'El badge y el panel de disponibilidad desaparecen para todos los técnicos. No se pierde ningún parámetro ni configuración — el motor sigue filtrando por disponibilidad exactamente igual, esto solo oculta la pantalla.';

    case 'AVAILABILITY_ADMIN_PANEL_ENABLED':
      return direction === 'on'
        ? 'Aparece en el panel Fauchard la pestaña "Plazos y sanciones" y el dashboard de observabilidad del modelo de disponibilidad, visibles para cualquier admin.'
        : 'Esas dos pantallas dejan de estar disponibles para todos los admins. No se pierde ningún parámetro configurado — solo el acceso a verlos/editarlos desde esa pestaña (los valores siguen aplicándose en el motor).';

    case 'REJECTION_INDIVIDUAL_ENABLED':
      return direction === 'on'
        ? 'Los técnicos podrán rechazar una asignación explícitamente desde el UCH (no cuenta como sanción); Fauchard invita automáticamente al siguiente candidato del ranking.'
        : 'El botón de rechazo desaparece: desde ese momento los técnicos solo pueden aceptar la asignación o dejarla expirar — y dejarla expirar sí cuenta como no-respuesta y puede sancionar. No se pierde ningún parámetro configurado.';

    case 'POOL_PENDIENTE_ENABLED': {
      const ttl = config ? `${config.tNoEligiblePoolHours} horas` : 'el valor configurado';
      const ciclos = config ? `${config.maxPoolCycles}` : 'el número configurado de';
      return direction === 'on'
        ? `Se retoma el uso del Tiempo de espera (TTL = ${ttl}) y el máximo de ${ciclos} ciclos de reintento configurados en Plazos y sanciones: los casos sin técnicos elegibles volverán a esperar en cola en vez de fallar de inmediato.`
        : `El Tiempo de espera (TTL = ${ttl}) y el máximo de ${ciclos} ciclos de reintento configurados en Plazos y sanciones dejan de aplicarse a partir de ahora — no se borran, solo quedan sin uso. Cualquier caso nuevo sin técnicos elegibles fallará de inmediato ("sin asignación") en vez de esperar. Los casos que ya estén en cola en este momento no se ven afectados retroactivamente.`;
    }

    case 'LEAGUE_ENGINE_ENABLED': {
      const c = config;
      const list = c
        ? `calificación mínima ${c.lMinRating.toFixed(2)}⭐ sobre ${c.lCasesEvaluated} casos evaluados, puntualidad mínima ${Math.round(c.lMinPunctuality * 100)}%, ${c.lCasesCompleted} casos completados totales, ${c.lCasesTransition} casos en transición con ${Math.round(c.lPenaltyTransition * 100)}% de penalización, y descenso por calificación ${c.lDescentRating.toFixed(2)}⭐ sostenida ${c.lDescentDays} días`
        : 'los umbrales configurados en la pestaña Categorías';
      return direction === 'on'
        ? `Se reactiva el cron diario de ligas con los parámetros configurados en Categorías: ${list}.`
        : `Los parámetros configurados en la pestaña Categorías dejan de aplicarse: ${list}. El cron diario deja de mover ligas — cada técnico conserva la liga que tiene ahora hasta que reactives el motor. No se borra la configuración, solo deja de usarse.`;
    }

    case 'QUALITY_GATE_ENABLED': {
      const hrs = config ? `${config.tQualityReviewHours} horas` : 'el plazo configurado';
      return direction === 'on'
        ? `Se retoma la revisión de Calidad con el plazo de ${hrs} configurado: las entregas nuevas del técnico pasan primero por un revisor antes de llegar al dentista.`
        : `El plazo de revisión de Calidad de ${hrs} deja de aplicarse a partir de ahora. Las entregas nuevas del técnico van directo al dentista, sin pasar por revisión. Los casos que ya estén en revisión de Calidad en este momento no se mueven automáticamente — siguen su curso ahí.`;
    }

    default:
      return 'Este cambio no tiene una descripción de impacto registrada — revisa el código antes de aplicarlo.';
  }
}

/** Impacto del TTL de verificación de email — depende del valor nuevo, no es on/off. */
export function emailVerificationTtlImpact(fromMinutes: string, toMinutes: string): string {
  return `Los links de verificación que se envíen después de este cambio serán válidos por ${toMinutes} minutos (antes: ${fromMinutes}). Los links ya enviados conservan el plazo con el que se generaron — este cambio no los alarga ni los acorta retroactivamente.`;
}
