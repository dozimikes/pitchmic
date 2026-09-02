'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    { className, src, alt = '', fallback, size = 'md', ...props },
    ref
  ) => {
    const [error, setError] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);
    const initials = getInitials(fallback || alt);

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
          'bg-gradient-to-br from-brand-orange-400 to-brand-deep-pitch-500 text-white font-semibold',
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {src && !error ? (
          <>
            {!loaded && (
              <div className="absolute inset-0 animate-pulse bg-slate-200" />
            )}
            <img
              src={src}
              alt={alt}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
              className={cn(
                'h-full w-full object-cover transition-opacity duration-300',
                loaded ? 'opacity-100' : 'opacity-0'
              )}
            />
          </>
        ) : initials ? (
          <span className="leading-none" aria-hidden="true">
            {initials}
          </span>
        ) : (
          <User className={cn('opacity-80', size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : size === 'xl' ? 'h-10 w-10' : 'h-5 w-5')} />
        )}
      </div>
    );
  }
);
Avatar.displayName = 'Avatar';

function getInitials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
