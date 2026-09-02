'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { cn } from '@/lib/utils';

export interface MarketingShellProps {
  children: React.ReactNode;
  className?: string;
  showHeroBackground?: boolean;
  showNavbar?: boolean;
  showFooter?: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

export function MarketingShell({
  children,
  className,
  showHeroBackground = true,
  showNavbar = true,
  showFooter = true,
}: MarketingShellProps) {
  const pathname = usePathname();

  const particles = React.useMemo<Particle[]>(() => {
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 6 + 2,
      delay: Math.random() * 8,
      duration: Math.random() * 10 + 8,
    }));
  }, []);

  return (
    <div className={cn('relative flex min-h-screen flex-col', className)}>
      {showHeroBackground && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden gradient-hero">
          <div
            className="absolute -top-40 right-0 h-[500px] w-[500px] rounded-full blur-3xl opacity-30"
            style={{
              background:
                'radial-gradient(circle, rgba(249, 115, 22, 0.6) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute top-60 -left-20 h-[400px] w-[400px] rounded-full blur-3xl opacity-30"
            style={{
              background:
                'radial-gradient(circle, rgba(139, 92, 246, 0.5) 0%, transparent 70%)',
            }}
          />
          <div
            className="absolute bottom-0 left-1/3 h-[300px] w-[600px] rounded-full blur-3xl opacity-20"
            style={{
              background:
                'radial-gradient(ellipse, rgba(249, 115, 22, 0.4) 0%, transparent 70%)',
            }}
          />

          <svg
            className="absolute inset-0 h-full w-full opacity-[0.035]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern
                id="pm-grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#pm-grid)" className="text-slate-900" />
          </svg>

          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full bg-gradient-to-br from-brand-orange-400 to-brand-deep-pitch-500 opacity-40"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
              }}
              animate={{
                y: [0, -30, 0],
                opacity: [0.2, 0.5, 0.2],
                scale: [1, 1.3, 1],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}

      {showNavbar && <Navbar variant="marketing" showSidebarToggle={false} />}

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname ?? 'marketing'}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {showFooter && <Footer variant="marketing" />}
    </div>
  );
}
