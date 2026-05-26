import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  className?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-[11px] font-bold uppercase tracking-wider text-faint px-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            bg-surface border border-divider rounded-md px-3.5 py-2.5
            text-sm text-foreground placeholder:text-faint
            focus:outline-none focus:border-primary focus:shadow-focus
            transition-colors duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-error bg-error-hl' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-[11px] text-error px-1 font-medium">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
