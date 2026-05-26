import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/40 disabled:opacity-40',
  secondary:
    'border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white bg-transparent disabled:opacity-40',
  ghost:
    'text-slate-400 hover:text-white bg-transparent hover:bg-slate-800 disabled:opacity-40',
  destructive:
    'bg-red-700 hover:bg-red-600 text-white shadow-lg shadow-red-900/40 disabled:opacity-40',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[9px] rounded-xl',
  md: 'px-5 py-2.5 text-[10px] rounded-2xl',
  lg: 'px-7 py-3.5 text-[11px] rounded-2xl',
};

const Spinner = () => (
  <div className="w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
);

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center gap-2',
          'font-black uppercase tracking-widest',
          'transition-all duration-150',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {loading ? (
          <Spinner />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
