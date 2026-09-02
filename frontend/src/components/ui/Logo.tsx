import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon' | 'dark' | 'light';
  priority?: boolean;
}

export function Logo({
  className,
  size = 'md',
  variant = 'full',
  priority = false,
}: LogoProps) {
  const heights = {
    sm: 28,
    md: 36,
    lg: 48,
    xl: 60,
  };

  const currentHeight = heights[size] || 36;
  // Aspect ratio of the official logo is approximately 4.5:1
  const currentWidth = Math.round(currentHeight * 4.5);

  if (variant === 'icon') {
    const iconDim = size === 'sm' ? 32 : size === 'md' ? 38 : size === 'lg' ? 48 : 56;
    return (
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full transition-transform hover:scale-105',
          size === 'sm' && 'h-8 w-8',
          size === 'md' && 'h-9.5 w-9.5',
          size === 'lg' && 'h-12 w-12',
          size === 'xl' && 'h-14 w-14',
          className
        )}
      >
        <Image
          src="/pitchmic-icon.png"
          alt="PitchMic Icon"
          width={iconDim}
          height={iconDim}
          className="h-full w-full object-contain rounded-full"
          priority={priority}
        />
      </div>
    );
  }

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <Image
        src="/logo.png"
        alt="PitchMic - Get Connected"
        width={currentWidth}
        height={currentHeight}
        className={cn(
          'w-auto object-contain',
          size === 'sm' && 'h-7',
          size === 'md' && 'h-9',
          size === 'lg' && 'h-12',
          size === 'xl' && 'h-16'
        )}
        priority={priority}
      />
    </div>
  );
}
