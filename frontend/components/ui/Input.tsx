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
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            bg-slate-900/50 border border-slate-700/50 rounded-2xl px-4 py-2.5
            text-sm text-white placeholder:text-slate-600
            focus:outline-none focus:border-teal-500/50 focus:bg-slate-800/80
            transition-all duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500/50 bg-red-500/5' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-[10px] text-red-400 px-1 font-medium italic">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
