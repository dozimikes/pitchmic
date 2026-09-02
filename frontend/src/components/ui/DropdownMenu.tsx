'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type DropdownContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentId: string;
};

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

function useDropdownContext(component: string): DropdownContextValue {
  const ctx = React.useContext(DropdownContext);
  if (!ctx) {
    throw new Error(`<${component} /> must be used within <DropdownMenu />`);
  }
  return ctx;
}

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const contentId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        triggerRef.current.contains(e.target as Node)
      ) {
        return;
      }
      const contentEl = document.getElementById(contentId);
      if (contentEl && contentEl.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, contentId]);

  return (
    <DropdownContext.Provider
      value={{ open, setOpen, triggerRef, contentId }}
    >
      {children}
    </DropdownContext.Provider>
  );
}

export interface DropdownMenuTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerProps
>(({ children, onClick, asChild, ...props }, ref) => {
  const ctx = useDropdownContext('DropdownMenuTrigger');

  // Callback ref that updates both the forwarded ref and the context triggerRef
  const setRef = React.useCallback(
    (node: HTMLElement | null) => {
      (ctx.triggerRef as React.MutableRefObject<HTMLElement | null>).current = node;
      if (typeof ref === 'function') {
        ref(node as HTMLButtonElement | null);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node as HTMLButtonElement | null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.triggerRef, ref]
  );

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    ctx.setOpen(!ctx.open);
    (onClick as React.MouseEventHandler<HTMLElement> | undefined)?.(e);
  };

  const triggerProps = {
    ref: setRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': ctx.open,
    'aria-controls': ctx.contentId,
    onClick: handleClick,
    ...props,
  };

  // When asChild is true, clone the single child element and forward all trigger
  // props onto it, avoiding an extra wrapper element (prevents <button><button>).
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }>, triggerProps);
  }

  return (
    <button
      type="button"
      {...triggerProps}
    >
      {children}
    </button>
  );
});
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

export interface DropdownMenuContentProps {
  children?: React.ReactNode;
  className?: string;
  align?: 'start' | 'end' | 'center';
  sideOffset?: number;
  style?: React.CSSProperties;
}

export function DropdownMenuContent({
  children,
  className,
  align = 'end',
  sideOffset = 8,
  style,
}: DropdownMenuContentProps) {
  const ctx = useDropdownContext('DropdownMenuContent');
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  React.useEffect(() => {
    if (!ctx.open || !mounted) return;
    const updatePosition = () => {
      const trigger = ctx.triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const contentWidth = 220;
      let left = rect.right - contentWidth;
      if (align === 'start') {
        left = rect.left;
      } else if (align === 'center') {
        left = rect.left + rect.width / 2 - contentWidth / 2;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - contentWidth - 8));
      setPosition({
        top: rect.bottom + sideOffset + window.scrollY,
        left: left + window.scrollX,
        minWidth: Math.max(rect.width, 180),
      });
    };
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [ctx.open, ctx.triggerRef, ctx.contentId, align, sideOffset, mounted]);

  const content = (
    <AnimatePresence>
      {ctx.open && (
        <motion.div
          id={ctx.contentId}
          role="menu"
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={cn(
            'z-50 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg shadow-slate-900/10',
            className
          )}
          style={
            position
              ? {
                  position: 'absolute',
                  top: position.top,
                  left: position.left,
                  minWidth: position.minWidth,
                  ...style,
                }
              : { ...style, position: 'fixed', visibility: 'hidden' }
          }
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return mounted && typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : null;
}

export interface DropdownMenuItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inset?: boolean;
}

export const DropdownMenuItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuItemProps
>(({ className, inset, ...props }, ref) => (
  <button
    ref={ref}
    role="menuitem"
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 outline-none',
      'transition-colors hover:bg-slate-100 hover:text-slate-900',
      'focus:bg-slate-100 focus:text-slate-900',
      'disabled:pointer-events-none disabled:opacity-50',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-slate-200', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export const DropdownMenuShortcut = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn('ml-auto text-xs tracking-widest text-slate-400', className)}
    {...props}
  />
));
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';
