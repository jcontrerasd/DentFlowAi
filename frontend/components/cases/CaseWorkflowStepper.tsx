'use client';

import { CheckCircle, Circle, Clock, XCircle } from 'lucide-react';

interface Step {
  status: string;
  label: string;
}

const BASE_STEPS: Step[] = [
  { status: 'borrador', label: 'Borrador' },
  { status: 'enEvaluacion', label: 'En evaluación' },
  { status: 'propuestaLista', label: 'Propuesta lista' },
  { status: 'aceptadaPendienteInicio', label: 'Esperando inicio' },
  { status: 'enEjecucion', label: 'En ejecución' },
  { status: 'enRevision', label: 'En revisión' },
  { status: 'disenoAprobado', label: 'Diseño aprobado' },
];

const FABRICATION_STEPS: Step[] = [
  { status: 'enFabricacion', label: 'En fabricación' },
  { status: 'enviado', label: 'Enviado' },
];

const FINAL_STEP: Step = { status: 'completado', label: 'Completado' };

const TERMINAL_STEPS: Record<string, Step> = {
  rechazado: { status: 'rechazado', label: 'Rechazado' },
  cerrado: { status: 'cerrado', label: 'Cerrado' },
};

/** Estados legacy o internos que deben mapear a un hito del stepper público. */
const STEP_STATUS_ALIASES: Record<string, string> = {
  aceptado: 'aceptadaPendienteInicio',
  cambiosEnProceso: 'enEjecucion',
};

/**
 * Resuelve el estado del caso a una clave presente en `stepStatusOrder`.
 * Nunca aplica toLowerCase() al camelCase completo (rompe p. ej. aceptadaPendienteInicio).
 */
function resolveStepperStatusKey(raw: string | undefined | null, stepStatusOrder: string[]): string {
  const t = String(raw ?? 'borrador').trim() || 'borrador';
  if (stepStatusOrder.includes(t)) return t;
  const caseInsensitive = stepStatusOrder.find((s) => s.toLowerCase() === t.toLowerCase());
  if (caseInsensitive) return caseInsensitive;
  const migrated = STEP_STATUS_ALIASES[t];
  if (migrated && stepStatusOrder.includes(migrated)) return migrated;
  return t;
}

export type CaseWorkflowStepperVariant = 'case' | 'techRejected';

interface CaseWorkflowStepperProps {
  currentStatus: string;
  serviceType?: string | null;
  workDeadline?: Date | null;
  /** Técnico no ganador / oferta no seleccionada: narrativa de cierre en rosa, sin fecha de entrega del caso. */
  variant?: CaseWorkflowStepperVariant;
}

export default function CaseWorkflowStepper({
  currentStatus,
  serviceType,
  workDeadline,
  variant = 'case',
}: CaseWorkflowStepperProps) {
  const rawStatus = String(currentStatus || 'borrador').trim() || 'borrador';
  const isIntegral = serviceType === 'integral';
  const isSoloFab = serviceType === 'solo_fabricacion';
  const techRejected = variant === 'techRejected';
  const isTerminal =
    rawStatus === 'rechazado' ||
    rawStatus === 'cerrado' ||
    rawStatus.toLowerCase() === 'rechazado' ||
    rawStatus.toLowerCase() === 'cerrado';
  /**
   * Caso integral o solo_fabricacion que terminó en rechazado/cerrado: además
   * de la banda base (propuestaLista → completado), también deben pintarse en
   * rosa los pasos posteriores no cumplidos (fabricación, envío) para que no
   * aparezcan como "pendientes en gris" al cierre.
   */
  const integralTerminalReject = !techRejected && (isIntegral || isSoloFab) && isTerminal;

  // Para solo_fabricacion el flujo omite diseño (enEjecucion, enRevision, disenoAprobado),
  // también en variante techRejected: el técnico CAM no "pierde" fases de diseño que no aplican.
  const baseStepsForCase: Step[] = isSoloFab
    ? BASE_STEPS.filter((s) => !['enEjecucion', 'enRevision', 'disenoAprobado'].includes(s.status))
    : BASE_STEPS;

  const steps: Step[] = [
    ...baseStepsForCase,
    ...((isIntegral || isSoloFab) ? FABRICATION_STEPS : []),
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
  const statusKey = resolveStepperStatusKey(currentStatus, statusOrder);
  const idxPropuesta = steps.findIndex((s) => s.status === 'propuestaLista');
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
      // Desde comparativa hasta fabricación/envío (si existen): banda de pérdida en rosa;
      // el terminal "Rechazado" queda en rojo sólido.
      return idxPropuesta >= 0 && idx >= idxPropuesta && idx < lastIdx;
    }
    if (integralTerminalReject) {
      // Cubre todo el rango desde propuestaLista hasta el penúltimo step (Completado),
      // que tampoco se cumplió. El último (Rechazado/Cerrado) se pinta como terminal rojo.
      const fromIdx = idxPropuesta >= 0 ? idxPropuesta : 0;
      return idx >= fromIdx && idx < lastIdx;
    }
    return false;
  };

  const connectorRose = (leftIdx: number) => {
    if (techRejected) {
      if (idxPropuesta < 0) return false;
      return leftIdx >= idxPropuesta && leftIdx < lastIdx;
    }
    if (integralTerminalReject) {
      const fromIdx = idxPropuesta >= 0 ? idxPropuesta : 0;
      return leftIdx >= fromIdx && leftIdx < lastIdx - 1;
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
        const tealEarlyDone = techRejected && idxPropuesta >= 0 && idx < idxPropuesta;

        const showTerminalRejected = techRejected && isTerminalStep;

        // Para integralTerminalReject usamos el mismo set de clases que `techRejected`
        // (rosa para la banda done, terminal en rosa con XCircle), pero sin tocar el
        // tramo "Borrador/En evaluación" previo a propuestaLista, que mantiene su look base.
        const useRoseScheme = techRejected || integralTerminalReject;
        const integralEarlyDone = integralTerminalReject && idxPropuesta >= 0 && idx < idxPropuesta;

        const circleClass = useRoseScheme
          ? [
              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
              isTerminalStep ? 'bg-error text-inverse shadow-sm' : '',
              roseDone ? 'bg-error-hl text-error ring-1 ring-error/30' : '',
              tealEarlyDone || integralEarlyDone ? 'bg-primary text-inverse' : '',
              !isTerminalStep && !roseDone && !tealEarlyDone && !integralEarlyDone && isCurrent ? 'bg-primary-hl text-primary ring-2 ring-primary/30' : '',
              !isTerminalStep && !roseDone && !tealEarlyDone && !integralEarlyDone && isPending ? 'bg-surface-2 text-faint' : '',
            ]
              .filter(Boolean)
              .join(' ')
          : [
              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
              isDone ? 'bg-primary text-inverse' : '',
              isCurrent && !isTerminalStep ? 'bg-primary-hl text-primary ring-2 ring-primary/30' : '',
              isTerminalStep ? 'bg-error-hl text-error ring-2 ring-error/30' : '',
              isPending && !isTerminalStep ? 'bg-surface-2 text-faint' : '',
            ]
              .filter(Boolean)
              .join(' ');

        const labelClass = useRoseScheme
          ? [
              'text-[8px] font-bold uppercase tracking-wider text-center leading-tight whitespace-nowrap',
              isTerminalStep ? 'text-error' : '',
              roseDone ? 'text-error/90' : '',
              tealEarlyDone || integralEarlyDone ? 'text-primary' : '',
              !isTerminalStep && !roseDone && !tealEarlyDone && !integralEarlyDone && isCurrent ? 'text-primary' : '',
              !isTerminalStep && !roseDone && !tealEarlyDone && !integralEarlyDone && isPending ? 'text-faint' : '',
            ]
              .filter(Boolean)
              .join(' ')
          : [
              'text-[8px] font-bold uppercase tracking-wider text-center leading-tight whitespace-nowrap',
              isDone ? 'text-primary' : '',
              isCurrent && !isTerminalStep ? 'text-primary' : '',
              isTerminalStep ? 'text-error' : '',
              isPending && !isTerminalStep ? 'text-faint' : '',
            ]
              .filter(Boolean)
              .join(' ');

        const showCheck = useRoseScheme
          ? (roseDone || tealEarlyDone || integralEarlyDone) && !showTerminalRejected && !isTerminalStep
          : isDone && !isTerminalStep;
        const showClock = useRoseScheme ? false : isCurrent && !isTerminalStep;
        const showCircleOutline = useRoseScheme
          ? !showTerminalRejected && !isTerminalStep &&
              (!roseDone && !tealEarlyDone && !integralEarlyDone && (isPending || isCurrent))
          : (isPending || isTerminalStep) || (isCurrent && !isTerminalStep);

        return (
          <div key={`${step.status}-${idx}`} className="flex items-center min-w-0 flex-1">
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className={circleClass}>
                {(showTerminalRejected || (integralTerminalReject && isTerminalStep)) && <XCircle className="w-4 h-4" aria-hidden />}
                {showCheck && <CheckCircle className="w-4 h-4" />}
                {showClock && <Clock className="w-3.5 h-3.5" />}
                {showCircleOutline && !showCheck && !showClock && !showTerminalRejected && !(integralTerminalReject && isTerminalStep) && (
                  <Circle className="w-3.5 h-3.5" />
                )}
              </div>
              <p className={labelClass}>{step.label}</p>
              {step.status === 'enEjecucion' && deadlineText && (
                <p className="text-[7px] text-muted text-center leading-tight whitespace-nowrap">
                  Entrega: {deadlineText}
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
                        : idx < idxPropuesta
                          ? 'bg-primary'
                          : 'bg-surface-off'
                    : integralTerminalReject
                      ? idx === lastIdx - 1
                        ? 'bg-error'
                        : connectorRose(idx)
                          ? 'bg-error'
                          : idx < idxPropuesta
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
