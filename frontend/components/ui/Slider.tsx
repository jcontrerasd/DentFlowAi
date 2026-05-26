import { InputHTMLAttributes, forwardRef } from 'react';

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
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ label, value, min = 0, max = 1, step = 0.01, showValue = true, valueSuffix = '', valueFormatter, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2 w-full group">
        <div className="flex justify-between items-center px-1">
          {label && (
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-faint group-hover:text-muted transition-colors">
                {label}
              </label>
              {props.tooltip && (
                <div className="relative group/tooltip inline-flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-faint hover:text-primary cursor-help transition-colors">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/tooltip:block w-48 sm:w-64 p-2 bg-surface-2 text-foreground text-[11px] font-normal normal-case tracking-normal rounded-md shadow-md border border-divider z-[100] text-center">
                    {props.tooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-[5px] border-transparent" style={{ borderTopColor: 'var(--color-surface-2)' }}></div>
                  </div>
                </div>
              )}
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
