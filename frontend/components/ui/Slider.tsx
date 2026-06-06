import { InputHTMLAttributes, forwardRef, useEffect, useRef } from 'react';
import { HelpCircle } from 'lucide-react';
import { claimFlashScroll } from '@/lib/hooks/useParamFlash';

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  valueSuffix?: string;
  valueFormatter?: (value: number) => string;
  tooltip?: string;
  /** Abre la ventana de ayuda del panel anclada a este parámetro (botón "?"). Si se define, reemplaza al tooltip de hover. */
  onHelp?: () => void;
  /** Número estable (N°) del parámetro; se muestra como insignia antes del label. */
  paramNumber?: number;
  /** Resalta temporalmente este control (p. ej. al pulsar un KPI que lo afecta). */
  flash?: boolean;
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ label, value, min = 0, max = 1, step = 0.01, showValue = true, valueSuffix = '', valueFormatter, className = '', tooltip, onHelp, paramNumber, flash = false, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // Al iluminarse, el primer control de la ráfaga lleva el scroll hasta la vista.
    useEffect(() => {
      if (flash && claimFlashScroll()) {
        containerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, [flash]);
    return (
      <div
        ref={containerRef}
        className={`flex flex-col gap-2 w-full group rounded-xl transition-all duration-300 ${flash ? 'ring-2 ring-primary/70 bg-primary-hl/15 shadow-lg shadow-primary/20' : ''}`}
      >
        <div className="flex justify-between items-center px-1">
          {label && (
            <div className="flex items-center gap-2">
              {paramNumber != null && (
                <span className="inline-flex h-5 items-center justify-center rounded-md bg-primary-hl px-1.5 text-[10px] font-black text-primary tracking-normal normal-case shrink-0" title={`Parámetro N°${paramNumber}`}>
                  N°{paramNumber}
                </span>
              )}
              <label className="text-[11px] font-bold uppercase tracking-wider text-faint group-hover:text-muted transition-colors">
                {label}
              </label>
              {onHelp ? (
                <button
                  type="button"
                  onClick={onHelp}
                  title={tooltip}
                  aria-label={`Abrir ayuda de ${label}`}
                  className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              ) : tooltip ? (
                <div className="relative group/tooltip inline-flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-faint hover:text-primary cursor-help transition-colors">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/tooltip:block w-52 sm:w-64 p-2.5 bg-surface-2 text-foreground text-[11px] font-normal normal-case tracking-normal rounded-md shadow-md border border-divider z-[100] text-left space-y-1.5">
                    <p className="leading-relaxed">{tooltip}</p>
                    {/* Puente invisible que cubre el gap (mb-2) para poder llevar el mouse al popup. */}
                    <span className="absolute top-full left-0 right-0 h-2" aria-hidden="true"></span>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-[5px] border-transparent" style={{ borderTopColor: 'var(--color-surface-2)' }}></div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {showValue && (
            <span className="text-[11px] font-mono font-bold text-primary bg-primary-hl px-2 py-0.5 rounded-md border border-primary/20">
              {valueFormatter ? valueFormatter(value) : `${value.toFixed(step < 1 ? 2 : 0)}${valueSuffix}`}
            </span>
          )}
        </div>

        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          className={`
            w-full h-1.5 bg-surface-off rounded-md appearance-none cursor-pointer
            accent-primary
            transition-all duration-150
            ${className}
          `}
          {...props}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export default Slider;
