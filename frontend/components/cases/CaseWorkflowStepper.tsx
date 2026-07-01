'use client';

import { CheckCircle, Circle, Clock, XCircle } from 'lucide-react';

interface Step {
  status: string;
  label: string;
}

const BASE_STEPS: Step[] = [
  { status: 'borrador', label: 'Borrador' },
  { status: 'enEvaluacion', label: 'En evaluación' },
  { status: 'aceptadaPendienteInicio', label: 'Esperando inicio' },
  { status: 'enEjecucion', label: 'En ejecución' },
  { status: 'enRevision', label: 'En revisión' },
];

/** Paso de Calidad (v5.19), visible solo a técnico/calidad/admin (invisible al dentista). */
const QUALITY_STEP: Step = { status: 'enRevisionCalidad', label: 'Revisión calidad' };

const FINAL_STEP: Step = { status: 'completado', label: 'Completado' };

const TERMINAL_STEPS: Record<string, Step> = {
  rechazado: { status: 'rechazado', label: 'Rechazado' },
  cerrado: { status: 'cerrado', label: 'Cerrado' },
};

/** Estados legacy o internos que deben mapear a un hito del stepper público. */
const STEP_STATUS_ALIASES: Record<string, string> = {
  aceptado: 'aceptadaPendienteInicio',
  cambiosEnProceso: 'enEjecucion',
  propuestaLista: 'enEvaluacion',
};

/**
 * Resuelve el estado del caso a una clave presente en `stepStatusOrder`.
 * Nunca aplica toLowerCase() al camelCase completo (rompe p. ej. aceptadaPendienteInicio).
 */
function resolveStepperStatusKey(
  raw: string | undefined | null,
  stepStatusOrder: string[],
  extraAliases: Record<string, string> = {},
): string {
  const t = String(raw ?? 'borrador').trim() || 'borrador';
  if (stepStatusOrder.includes(t)) return t;
  const caseInsensitive = stepStatusOrder.find((s) => s.toLowerCase() === t.toLowerCase());
  if (caseInsensitive) return caseInsensitive;
  const migrated = extraAliases[t] ?? STEP_STATUS_ALIASES[t];
  if (migrated && stepStatusOrder.includes(migrated)) return migrated;
  return t;
}

export type CaseWorkflowStepperVariant = 'case' | 'techRejected';

interface CaseWorkflowStepperProps {
  currentStatus: string;
  workDeadline?: Date | null;
  /** Técnico no ganador / oferta no seleccionada: narrativa de cierre en rosa, sin fecha de entrega del caso. */
  variant?: CaseWorkflowStepperVariant;
  /** v5.19 — Rol del viewer: define si se muestra el paso "Revisión calidad" (oculto al dentista). */
  viewerRole?: 'dentista' | 'tecnico' | 'calidad' | 'admin';
  /** v5.19 — Responsabilidad actual; en la compuerta de Calidad marca de quién es la pelota. */
  currentResponsibility?: string | null;
}

export default function CaseWorkflowStepper({
  currentStatus,
  workDeadline,
  variant = 'case',
  viewerRole = 'dentista',
  currentResponsibility = null,
}: CaseWorkflowStepperProps) {
  const rawStatus = String(currentStatus || 'borrador').trim() || 'borrador';
  const techRejected = variant === 'techRejected';
  // El dentista nunca percibe la etapa de Calidad: para él, enRevisionCalidad se muestra
  // como "En ejecución". Técnico/Calidad/admin sí ven el paso de Calidad.
  // certificadoCalidad: alias de compatibilidad para casos históricos (ya no alcanzable en flujos nuevos).
  const showQualityStep = viewerRole === 'tecnico' || viewerRole === 'calidad' || viewerRole === 'admin';
  const extraAliases: Record<string, string> = showQualityStep
    ? { certificadoCalidad: 'enRevisionCalidad' }
    : { enRevisionCalidad: 'enEjecucion', certificadoCalidad: 'enEjecucion' };
  const isTerminal =
    rawStatus === 'rechazado' ||
    rawStatus === 'cerrado' ||
    rawStatus.toLowerCase() === 'rechazado' ||
    rawStatus.toLowerCase() === 'cerrado';

  const baseSteps: Step[] = showQualityStep
    ? BASE_STEPS.flatMap((s) => (s.status === 'enRevision' ? [QUALITY_STEP, s] : [s]))
    : BASE_STEPS;

  const steps: Step[] = [
    ...baseSteps,
    techRejected ? { ...FINAL_STEP, label: 'Rechazado' } : FINAL_STEP,
    ...(!techRejected && isTerminal
      ? (() => {
          const tk = rawStatus.toLowerCase();
          if (tk === 'rechazado' || tk === 'cerrado') return [TERMINAL_STEPS[tk]];
          return [];
        })()
      : []),
  ];

  const statusOrder = steps.map((s) => s.status);
  const statusKey = resolveStepperStatusKey(currentStatus, statusOrder, extraAliases);
  const idxEvaluacion = steps.findIndex((s) => s.status === 'enEvaluacion');
  const lastIdx = steps.length - 1;

  const rawIdx = statusOrder.indexOf(statusKey);
  /** Caso cerrado con éxito: el hito "Completado" no es "en curso" (reloj), sino cumplido como los demás. */
  const successClosed = statusKey === 'completado' && rawIdx >= 0;

  const currentIdx = techRejected
    ? lastIdx
    : isTerminal
      ? steps.length - 1
      : successClosed
        ? steps.length
        : Math.max(0, rawIdx);

  const deadlineText =
    !techRejected && workDeadline
      ? new Date(workDeadline).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : null;

  const inRoseDoneBand = (idx: number) => {
    if (techRejected) {
      // Desde comparativa hasta completado: banda de pérdida en rosa;
      // el terminal "Rechazado" queda en rojo sólido.
      return idxEvaluacion >= 0 && idx >= idxEvaluacion && idx < lastIdx;
    }
    return false;
  };

  const connectorRose = (leftIdx: number) => {
    if (techRejected) {
      if (idxEvaluacion < 0) return false;
      return leftIdx >= idxEvaluacion && leftIdx < lastIdx;
    }
    return false;
  };

  return (
    <div
      data-testid="case-workflow-stepper"
      data-variant={variant}
      className="flex items-center gap-0 w-full overflow-x-auto py-1"
    >
      {steps.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isPending = idx > currentIdx;
        const isTerminalStep = techRejected
          ? idx === lastIdx
          : isTerminal && idx === steps.length - 1;

        const roseDone = inRoseDoneBand(idx);
        const tealEarlyDone = techRejected && idxEvaluacion >= 0 && idx < idxEvaluacion;

        const showTerminalRejected = techRejected && isTerminalStep;

        const useRoseScheme = techRejected;

        const circleClass = useRoseScheme
          ? [
              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
              isTerminalStep ? 'bg-error text-inverse shadow-sm' : '',
              roseDone ? 'bg-error-hl text-error ring-1 ring-error/30' : '',
              tealEarlyDone ? 'bg-primary text-inverse' : '',
              !isTerminalStep && !roseDone && !tealEarlyDone && isCurrent ? 'bg-primary-hl text-primary ring-2 ring-primary/30' : '',
              !isTerminalStep && !roseDone && !tealEarlyDone && isPending ? 'bg-surface-2 text-muted' : '',
            ]
              .filter(Boolean)
              .join(' ')
          : [
              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
              isDone ? 'bg-primary text-inverse' : '',
              isCurrent && !isTerminalStep ? 'bg-primary-hl text-primary ring-2 ring-primary/30' : '',
              isTerminalStep ? 'bg-error-hl text-error ring-2 ring-error/30' : '',
              isPending && !isTerminalStep ? 'bg-surface-2 text-muted' : '',
            ]
              .filter(Boolean)
              .join(' ');

        const labelClass = useRoseScheme
          ? [
              'text-[11px] font-bold uppercase tracking-wider text-center leading-tight whitespace-nowrap',
              isTerminalStep ? 'text-error' : '',
              roseDone ? 'text-error/90' : '',
              tealEarlyDone ? 'text-primary' : '',
              !isTerminalStep && !roseDone && !tealEarlyDone && isCurrent ? 'text-primary' : '',
              !isTerminalStep && !roseDone && !tealEarlyDone && isPending ? 'text-muted' : '',
            ]
              .filter(Boolean)
              .join(' ')
          : [
              'text-[11px] font-bold uppercase tracking-wider text-center leading-tight whitespace-nowrap',
              isDone ? 'text-primary' : '',
              isCurrent && !isTerminalStep ? 'text-primary' : '',
              isTerminalStep ? 'text-error' : '',
              isPending && !isTerminalStep ? 'text-muted' : '',
            ]
              .filter(Boolean)
              .join(' ');

        const showCheck = useRoseScheme
          ? (roseDone || tealEarlyDone) && !showTerminalRejected && !isTerminalStep
          : isDone && !isTerminalStep;
        const showClock = useRoseScheme ? false : isCurrent && !isTerminalStep;
        const showCircleOutline = useRoseScheme
          ? !showTerminalRejected && !isTerminalStep &&
              (!roseDone && !tealEarlyDone && (isPending || isCurrent))
          : (isPending || isTerminalStep) || (isCurrent && !isTerminalStep);

        return (
          <div key={`${step.status}-${idx}`} className="flex items-center min-w-0 flex-1">
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className={circleClass}>
                {(showTerminalRejected) && <XCircle className="w-4 h-4" aria-hidden />}
                {showCheck && <CheckCircle className="w-4 h-4" />}
                {showClock && <Clock className="w-3.5 h-3.5" />}
                {showCircleOutline && !showCheck && !showClock && !showTerminalRejected && (
                  <Circle className="w-3.5 h-3.5" />
                )}
              </div>
              <p className={labelClass}>{step.label}</p>
              {step.status === 'enEjecucion' && deadlineText && (
                <p className="text-[11px] text-muted text-center leading-tight whitespace-nowrap">
                  Entrega: {deadlineText}
                </p>
              )}
              {step.status === 'enRevisionCalidad' && isCurrent && showQualityStep && (
                <p className="text-[11px] text-muted text-center leading-tight whitespace-nowrap">
                  {currentResponsibility === 'tecnico' ? 'Ajustes del técnico' : 'En revisión'}
                </p>
              )}
            </div>
            {idx < steps.length - 1 && (
              <div
                className={[
                  'h-px flex-1 mx-1 transition-all',
                  techRejected
                    ? idx === lastIdx - 1
                      ? 'bg-error'
                      : connectorRose(idx)
                        ? 'bg-error'
                        : idx < idxEvaluacion
                          ? 'bg-primary'
                          : 'bg-surface-off'
                    : idx < currentIdx
                      ? 'bg-primary'
                      : 'bg-surface-off',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
