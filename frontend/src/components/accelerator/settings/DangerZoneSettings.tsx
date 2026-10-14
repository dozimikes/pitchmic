'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  Download,
  Trash2,
  RefreshCcw,
  ChevronRight,
  ShieldAlert,
  Eye,
  EyeOff,
  Loader2,
  PowerOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

const CONFIRM_SLUG = 'LAGOS-INNOVATION-ACCELERATOR';

interface DangerAction {
  id: string;
  title: string;
  description: string;
  confirmText?: string;
  buttonLabel: string;
  icon: React.FC<{ className?: string }>;
  severity: 'warning' | 'critical';
  requiresTyping?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}

function DangerCard({ action }: { action: DangerAction }) {
  const [expanded, setExpanded] = React.useState(false);
  const [typedValue, setTypedValue] = React.useState('');
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [showInput, setShowInput] = React.useState(false);

  const isCritical = action.severity === 'critical';
  const isTypingValid = !action.requiresTyping || typedValue === action.confirmText;

  const runConfirm = () => {
    action.onConfirm();
    setShowConfirm(false);
    setTypedValue('');
    setExpanded(false);
  };

  return (
    <div
      className={cn(
        'rounded-2xl border transition-all',
        isCritical
          ? 'border-rose-500/40 bg-rose-950/20'
          : 'border-amber-500/20 bg-amber-950/10'
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            'h-8 w-8 rounded-xl flex items-center justify-center shrink-0',
            isCritical ? 'bg-rose-500/20' : 'bg-amber-500/15'
          )}>
            <action.icon className={cn('h-4 w-4', isCritical ? 'text-rose-400' : 'text-amber-400')} />
          </div>
          <div>
            <p className={cn('text-sm font-bold', isCritical ? 'text-rose-300' : 'text-amber-300')}>
              {action.title}
            </p>
            <p className="text-xs text-white/50 mt-0.5 line-clamp-1 max-w-md">
              {action.description}
            </p>
          </div>
        </div>
        <ChevronRight className={cn('h-4 w-4 text-white/30 shrink-0 transition-transform', expanded && 'rotate-90')} />
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/10 pt-4">
          <p className="text-xs text-white/60 leading-relaxed">{action.description}</p>

          {action.requiresTyping && (
            <div className="space-y-2">
              <p className="text-xs text-white/50">
                To confirm, type{' '}
                <code className="px-1.5 py-0.5 rounded bg-white/10 text-rose-300 font-mono text-xs font-bold">
                  {action.confirmText}
                </code>{' '}
                below:
              </p>
              <div className="relative">
                <input
                  type={showInput ? 'text' : 'password'}
                  value={typedValue}
                  onChange={(e) => setTypedValue(e.target.value)}
                  placeholder="Type the organization name..."
                  className={cn(
                    'w-full pr-10 px-4 py-2.5 rounded-xl border text-xs font-mono transition',
                    'bg-black/30 text-white placeholder-white/20 focus:outline-none',
                    typedValue && !isTypingValid
                      ? 'border-rose-500/50 focus:border-rose-400'
                      : isTypingValid && typedValue
                      ? 'border-emerald-500/50 focus:border-emerald-400'
                      : 'border-white/15 focus:border-rose-500/50'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowInput(!showInput)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition"
                >
                  {showInput ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {typedValue && !isTypingValid && (
                <p className="text-[10px] text-rose-400">Name does not match. Please type exactly: {action.confirmText}</p>
              )}
              {isTypingValid && typedValue && (
                <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Confirmation matched. Proceed with caution.
                </p>
              )}
            </div>
          )}

          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition',
                isCritical
                  ? 'bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 disabled:opacity-40 disabled:cursor-not-allowed'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20'
              )}
              disabled={action.requiresTyping && !isTypingValid}
            >
              <action.icon className="h-3.5 w-3.5" />
              {action.buttonLabel}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold">
                <AlertTriangle className="h-3.5 w-3.5" />
                Are you absolutely sure?
              </div>
              <button
                onClick={runConfirm}
                disabled={action.pending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold transition disabled:opacity-60"
              >
                {action.pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {action.pending ? 'Working…' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs font-medium transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DangerZoneSettings() {
  const { activeProgramId, activeProgram } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;

  const setProgramStatus = useMutation({
    mutationFn: (data: Record<string, any>) => acceleratorApi.updateProgram(pid as number, data as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accelerator'] }),
    onError: (err: any) => {
      toast({
        title: 'Action failed',
        description: err?.response?.data?.error || 'The requested change could not be applied.',
        variant: 'error',
      });
    },
  });

  const archiveProgram = (message: string) => {
    setProgramStatus.mutate(
      { program_status: 'archived' },
      { onSuccess: () => toast({ title: 'Program archived', description: message, variant: 'success' }) },
    );
  };

  const deactivateProgram = () => {
    setProgramStatus.mutate(
      { is_active: false },
      {
        onSuccess: () =>
          toast({ title: 'Program deactivated', description: 'The program is no longer active or accepting work.', variant: 'success' }),
      },
    );
  };

  const notSupported = (feature: string) => {
    toast({
      title: `${feature} unavailable`,
      description: 'No backend endpoint is exposed for this operation, so nothing was changed.',
      variant: 'warning',
    });
  };

  const programName = activeProgram?.name ?? 'Accelerator';
  const busy = setProgramStatus.isPending;

  const DANGER_ACTIONS: DangerAction[] = [
    {
      id: 'archive',
      title: 'Archive Accelerator',
      description:
        'Archiving suspends the accelerator, disabling all active programs and preventing new applications. All data is retained and the organization can be restored by an Owner.',
      buttonLabel: 'Archive Accelerator',
      icon: Archive,
      severity: 'warning',
      requiresTyping: false,
      pending: busy,
      onConfirm: () => archiveProgram(`${programName} has been archived. All data is retained and restorable.`),
    },
    {
      id: 'deactivate',
      title: 'Deactivate Program',
      description:
        'Turn this program off so it stops appearing across the platform and no further actions can be taken on it. Data is preserved and the program can be reactivated by an Owner.',
      buttonLabel: 'Deactivate Program',
      icon: PowerOff,
      severity: 'warning',
      requiresTyping: false,
      pending: busy,
      onConfirm: deactivateProgram,
    },
    {
      id: 'export',
      title: 'Export All Organization Data',
      description:
        'Download a complete ZIP archive of all organization data including applications, members, evaluations, intelligence outputs, audit logs, and attachments.',
      buttonLabel: 'Request Full Export',
      icon: Download,
      severity: 'warning',
      requiresTyping: false,
      onConfirm: () => notSupported('Full data export'),
    },
    {
      id: 'transfer',
      title: 'Transfer Ownership',
      description:
        "Transfer ownership of the organization to another Organization Admin. You will be demoted to Admin after transfer. This action is irreversible without the new owner's consent.",
      buttonLabel: 'Transfer Ownership',
      icon: RefreshCcw,
      severity: 'warning',
      requiresTyping: false,
      onConfirm: () => notSupported('Ownership transfer'),
    },
    {
      id: 'delete',
      title: 'Delete Organization',
      description:
        'Permanently delete the Lagos Innovation Accelerator organization and all associated data. This action is irreversible, immediate, and cannot be undone. All programs, applications, member accounts, and intelligence data will be permanently destroyed.',
      buttonLabel: 'Permanently Delete Organization',
      icon: Trash2,
      severity: 'critical',
      requiresTyping: true,
      confirmText: CONFIRM_SLUG,
      pending: busy,
      // There is no delete-program endpoint — routed to the supported archive operation.
      onConfirm: () =>
        archiveProgram(
          'Permanent deletion is not supported by the API, so this program was archived instead. All data is retained.',
        ),
    },
  ];

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to manage its danger-zone operations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
          <h2 className="text-lg font-bold text-rose-300">Danger Zone</h2>
        </div>
        <p className="text-xs text-white/50">
          These operations are irreversible or have significant consequences for your organization. Proceed only if you
          are certain.
        </p>
      </div>

      {/* Critical Warning */}
      <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4">
        <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-bold text-rose-300">Owner-Level Access Required</p>
          <p className="text-xs text-rose-200/70">
            All operations in this section require Organization Owner authentication. Some actions may trigger additional
            MFA verification. These actions are logged permanently in the Audit Log.
          </p>
        </div>
      </div>

      {/* Danger Actions */}
      <div className="space-y-3">
        {DANGER_ACTIONS.map((action) => (
          <DangerCard key={action.id} action={action} />
        ))}
      </div>

      {/* Bottom Note */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-[11px] text-white/30 leading-relaxed">
          <strong className="text-white/50">Legal notice:</strong> Deleting the organization will schedule permanent
          data removal after a 30-day grace period, during which you may request data restoration. After 30 days, all
          data is permanently purged and cannot be recovered. For data subject requests under GDPR or applicable law,
          contact privacy@pitchmic.com.
        </p>
      </div>
    </div>
  );
}
