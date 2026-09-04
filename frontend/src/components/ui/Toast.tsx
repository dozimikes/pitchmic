'use client';

/**
 * Lightweight toast notification system.
 * Usage:
 *   const { toast } = useToast();
 *   toast({ title: 'Done', description: 'Application submitted.', variant: 'success' });
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // ms, default 4500
}

interface ToastContextValue {
  toast: (opts: Omit<ToastMessage, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((opts: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    const duration = opts.duration ?? 4500;
    setToasts((prev) => [...prev, { id, ...opts }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const variantConfig: Record<
  ToastVariant,
  { icon: React.ReactNode; border: string; bg: string; title: string }
> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />,
    border: 'border-emerald-500/40',
    bg: 'bg-neutral-900',
    title: 'text-emerald-300',
  },
  error: {
    icon: <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />,
    border: 'border-rose-500/40',
    bg: 'bg-neutral-900',
    title: 'text-rose-300',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />,
    border: 'border-amber-500/40',
    bg: 'bg-neutral-900',
    title: 'text-amber-300',
  },
  info: {
    icon: <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />,
    border: 'border-blue-500/40',
    bg: 'bg-neutral-900',
    title: 'text-blue-300',
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 w-80 pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const cfg = variantConfig[t.variant ?? 'info'];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'pointer-events-auto rounded-xl border px-4 py-3 shadow-xl flex items-start gap-3',
                cfg.bg,
                cfg.border
              )}
            >
              {cfg.icon}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold', cfg.title)}>{t.title}</p>
                {t.description && (
                  <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                className="text-neutral-500 hover:text-neutral-200 transition-colors mt-0.5"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
