'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type TooltipContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLSpanElement | null>;
  content: React.ReactNode;
  setContent: (content: React.ReactNode) => void;
  side: 'top' | 'bottom' | 'left' | 'right';
  delayDuration: number;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltipContext(component: string): TooltipContextValue {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) {
    throw new Error(`<${component} /> must be used within <TooltipProvider />`);
  }
  return ctx;
}

export interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
}

export function TooltipProvider({
  children,
  delayDuration = 300,
}: TooltipProviderProps) {
  return (
    <TooltipContextWrapper defaultDelayDuration={delayDuration}>
      {children}
    </TooltipContextWrapper>
  );
}

function TooltipContextWrapper({
  children,
  defaultDelayDuration,
}: {
  children: React.ReactNode;
  defaultDelayDuration: number;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const [content, setContent] = React.useState<React.ReactNode>(null);
  return (
    <TooltipContext.Provider
      value={{
        open,
        setOpen,
        triggerRef,
        content,
        setContent,
        side: 'top',
        delayDuration: defaultDelayDuration,
      }}
    >
      {children}
    </TooltipContext.Provider>
  );
}

export interface TooltipProps {
  children: React.ReactNode;
}

export function Tooltip({ children }: TooltipProps) {
  return <>{children}</>;
}

export interface TooltipTriggerProps extends React.HTMLAttributes<HTMLSpanElement> {
  asChild?: boolean;
}

export const TooltipTrigger = React.forwardRef<
  HTMLSpanElement,
  TooltipTriggerProps
>(({ children, className, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props }, forwardedRef) => {
  const innerRef = React.useRef<HTMLSpanElement | null>(null);
  const ctx = useTooltipContext('TooltipTrigger');
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLSpanElement);

  React.useEffect(() => {
    if (!ctx.triggerRef) return;
    (ctx.triggerRef as React.MutableRefObject<HTMLSpanElement | null>).current = innerRef.current;
  }, [ctx.triggerRef]);

  const clearTimers = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
  };

  const handleOpen = () => {
    clearTimers();
    openTimer.current = setTimeout(() => {
      ctx.setOpen(true);
    }, ctx.delayDuration);
  };

  const handleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => {
      ctx.setOpen(false);
    }, 150);
  };

  return (
    <span
      ref={innerRef}
      className={cn('inline-flex', className)}
      onMouseEnter={(e) => {
        handleOpen();
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        handleClose();
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        handleOpen();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        handleClose();
        onBlur?.(e);
      }}
      {...props}
    >
      {children}
    </span>
  );
});
TooltipTrigger.displayName = 'TooltipTrigger';

export interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
}

export function TooltipContent({
  className,
  side = 'top',
  sideOffset = 8,
  children,
  style,
  ...props
}: TooltipContentProps) {
  const ctx = useTooltipContext('TooltipContent');

  React.useEffect(() => {
    ctx.setContent(children);
  }, [ctx, children]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
  } | null>(null);

  React.useEffect(() => {
    if (!ctx.open || !mounted) return;
    const update = () => {
      const trigger = ctx.triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const tooltipEl = document.getElementById('__pm_tooltip_content__');
      const width = tooltipEl?.offsetWidth ?? 200;
      const height = tooltipEl?.offsetHeight ?? 40;
      let top = 0;
      let left = 0;
      if (side === 'top') {
        top = rect.top - height - sideOffset + window.scrollY;
        left = rect.left + rect.width / 2 - width / 2 + window.scrollX;
      } else if (side === 'bottom') {
        top = rect.bottom + sideOffset + window.scrollY;
        left = rect.left + rect.width / 2 - width / 2 + window.scrollX;
      } else if (side === 'left') {
        top = rect.top + rect.height / 2 - height / 2 + window.scrollY;
        left = rect.left - width - sideOffset + window.scrollX;
      } else {
        top = rect.top + rect.height / 2 - height / 2 + window.scrollY;
        left = rect.right + sideOffset + window.scrollX;
      }
      setPosition({ top, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [ctx.open, ctx.triggerRef, side, sideOffset, mounted]);

  if (!ctx.open) return null;

  return (
    <div
      id="__pm_tooltip_content__"
      role="tooltip"
      className={cn(
        'z-50 inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-md',
        className
      )}
      style={
        position
          ? { position: 'absolute', top: position.top, left: position.left, ...style }
          : { position: 'fixed', visibility: 'hidden', ...style }
      }
      {...props}
    >
      {children}
    </div>
  );
}
