import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'jade';
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
    'bg-primary hover:opacity-90 text-primary-fg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
  secondary:
    'bg-surface border border-divider hover:border-border text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
  ghost:
    'bg-transparent text-muted hover:text-foreground hover:bg-surface-off focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
  destructive:
    'bg-error text-inverse hover:opacity-90 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/30',
  jade:
    'bg-jade text-inverse hover:opacity-90 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade/30',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[11px] rounded-md',
  md: 'px-5 py-2.5 text-[13px] rounded-md',
  lg: 'px-7 py-3 text-[14px] rounded-lg',
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
          'font-semibold tracking-tight',
          'transition-colors duration-150',
          'disabled:opacity-50 disabled:pointer-events-none',
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
