import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'border-transparent bg-brand-orange-500 text-white hover:bg-brand-orange-600',
  secondary:
    'border-transparent bg-slate-100 text-slate-900 hover:bg-slate-200',
  destructive:
    'border-transparent bg-red-500 text-white hover:bg-red-600',
  outline: 'text-slate-900 border-slate-200 bg-white',
  success:
    'border-transparent bg-green-500 text-white hover:bg-green-600',
  warning:
    'border-transparent bg-amber-500 text-white hover:bg-amber-600',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5',
          'text-xs font-semibold transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-brand-orange-500 focus:ring-offset-2',
          variantClasses[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
