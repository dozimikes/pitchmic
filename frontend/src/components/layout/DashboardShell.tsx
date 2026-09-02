'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';

export interface DashboardShellProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <div className="hidden h-screen sticky top-0 md:block">
          <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
        </div>

        <div className="flex min-h-screen flex-1 flex-col">
          <Navbar
            showSidebarToggle
            variant="dashboard"
            onToggleSidebar={() => setCollapsed((c) => !c)}
          />

          <main className={cn('flex-1', className)}>
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname ?? 'dashboard'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                  {children}
                </div>
              </motion.div>
            </AnimatePresence>
          </main>

          <Footer variant="dashboard" />
        </div>
      </div>
    </div>
  );
}
