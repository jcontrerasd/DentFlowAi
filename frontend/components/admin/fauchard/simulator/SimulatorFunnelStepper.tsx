'use client';

import { CheckCircle, Circle } from 'lucide-react';
import {
  FUNNEL_STEPS,
  isStepDone,
  resolveStepBadge,
} from './simulatorConstants';
import type { LiveScenario, SimulatorFunnelStep } from './simulatorTypes';
import type { SimulationResult } from '@/lib/fauchard/simulationTypes';

export default function SimulatorFunnelStepper({
  activeStep,
  onStepChange,
  result,
  liveScenario,
}: {
  activeStep: SimulatorFunnelStep;
  onStepChange: (step: SimulatorFunnelStep) => void;
  result: SimulationResult | null;
  liveScenario: LiveScenario;
}) {
  return (
    <nav aria-label="Etapas del simulador Fauchard" className="w-full">
      <ol className="flex flex-wrap items-center gap-2 md:gap-0 md:flex-nowrap">
        {FUNNEL_STEPS.map((step, index) => {
          const isActive = activeStep === step.id;
          const done = isStepDone(step.id, result);
          const badge = resolveStepBadge(step.id, result, liveScenario);

          return (
            <li key={step.id} className="flex items-center min-w-0">
              <button
                type="button"
                onClick={() => onStepChange(step.id)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all text-left min-w-0 ${
                  isActive
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : done
                      ? 'bg-surface/60 border-divider text-foreground hover:border-primary/20'
                      : 'bg-surface/30 border-divider text-muted hover:text-foreground hover:border-divider'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                    isActive
                      ? 'bg-primary border-primary text-white'
                      : done
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-surface border-divider text-faint'
                  }`}
                >
                  {done && !isActive ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Circle className={`w-3.5 h-3.5 ${isActive ? 'fill-white/30' : ''}`} />
                  )}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider truncate">
                    {step.shortLabel}
                  </span>
                  {badge && (
                    <span className="text-[9px] font-mono text-faint truncate max-w-[120px] group-hover:text-muted">
                      {badge}
                    </span>
                  )}
                </span>
              </button>
              {index < FUNNEL_STEPS.length - 1 && (
                <span className="hidden md:block w-6 lg:w-10 h-px bg-divider mx-1 shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
