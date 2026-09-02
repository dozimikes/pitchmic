'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

type SheetContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  side: 'top' | 'bottom' | 'left' | 'right';
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext(component: string): SheetContextValue {
  const ctx = React.useContext(SheetContext);
  if (!ctx) {
    throw new Error(`<${component} /> must be used within <Sheet />`);
  }
  return ctx;
}

export interface SheetProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Sheet({ children, open: controlledOpen, onOpenChange }: SheetProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  return (
    <SheetContext.Provider value={{ open, setOpen, side: 'left' }}>
      {children}
    </SheetContext.Provider>
  );
}

export interface SheetTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const SheetTrigger = React.forwardRef<
  HTMLButtonElement,
  SheetTriggerProps
>(({ onClick, ...props }, ref) => {
  const ctx = useSheetContext('SheetTrigger');
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        ctx.setOpen(true);
        onClick?.(e);
      }}
      {...props}
    />
  );
});
SheetTrigger.displayName = 'SheetTrigger';

export interface SheetCloseProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

export const SheetClose = React.forwardRef<
  HTMLButtonElement,
  SheetCloseProps
>(({ onClick, ...props }, ref) => {
  const ctx = useSheetContext('SheetClose');
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        ctx.setOpen(false);
        onClick?.(e);
      }}
      {...props}
    />
  );
});
SheetClose.displayName = 'SheetClose';

export interface SheetContentProps {
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  showClose?: boolean;
}

const sideVariants = {
  left: {
    closed: { x: '-100%' },
    open: { x: 0 },
  },
  right: {
    closed: { x: '100%' },
    open: { x: 0 },
  },
  top: {
    closed: { y: '-100%' },
    open: { y: 0 },
  },
  bottom: {
    closed: { y: '100%' },
    open: { y: 0 },
  },
};

const sideClasses: Record<NonNullable<SheetContentProps['side']>, string> = {
  left: 'inset-y-0 left-0 h-full w-3/4 sm:max-w-sm border-r border-slate-200',
  right: 'inset-y-0 right-0 h-full w-3/4 sm:max-w-sm border-l border-slate-200',
  top: 'inset-x-0 top-0 max-h-[90vh] border-b border-slate-200',
  bottom: 'inset-x-0 bottom-0 max-h-[90vh] border-t border-slate-200',
};

export function SheetContent({
  children,
  side = 'left',
  className,
  showClose = true,
}: SheetContentProps) {
  const ctx = useSheetContext('SheetContent');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!ctx.open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [ctx.open]);

  const sheet = (
    <AnimatePresence>
      {ctx.open && (
        <>
          <motion.div
            key="sheet-overlay"
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => ctx.setOpen(false)}
            aria-hidden="true"
          />
          <motion.aside
            key="sheet-content"
            role="dialog"
            aria-modal={true}
            className={cn(
              'fixed z-50 bg-white shadow-xl shadow-slate-900/20',
              sideClasses[side],
              className
            )}
            initial={sideVariants[side].closed}
            animate={sideVariants[side].open}
            exit={sideVariants[side].closed}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          >
            {showClose && (
              <button
                type="button"
                onClick={() => ctx.setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return mounted && typeof document !== 'undefined'
    ? createPortal(sheet, document.body)
    : null;
}

export const SheetHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-2 p-6 text-center sm:text-left', className)}
    {...props}
  />
));
SheetHeader.displayName = 'SheetHeader';

export const SheetFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-col-reverse gap-2 p-6 sm:flex-row sm:justify-end',
      className
    )}
    {...props}
  />
));
SheetFooter.displayName = 'SheetFooter';

export const SheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('text-lg font-semibold text-slate-900', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

export const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-slate-500', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';
