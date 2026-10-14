'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail, Bell, FileText, Plus, Trash2, Save, Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi, type NotificationTemplateItem } from '@/lib/acceleratorApi';

const inputCls =
  'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-xs text-white ' +
  'placeholder-white/30 focus:outline-none focus:border-indigo-500/60 transition';

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'in_app', label: 'In-App' },
  { value: 'sms', label: 'SMS' },
];

interface TriggerState {
  appReceived: boolean;
  movedToReview: boolean;
  interviewInvited: boolean;
  decisionNotification: boolean;
}
interface ReviewerState {
  assignment: boolean;
  reviewReminder: boolean;
  deadlineApproaching: boolean;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function emptyDraft(): NotificationTemplateItem {
  return { key: '', name: '', channel: 'email', subject: '', body: '', is_active: true };
}

export function CommunicationsSettings() {
  const { activeProgramId, activeProgram } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-communications-program', pid] as const;
  const templatesKey = ['accelerator-notification-templates', pid] as const;

  // ── Program (source of notification_config) ────────────────────────────────
  const { data: program } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });
  const notificationConfig: Record<string, any> =
    (program as any)?.notification_config ?? {};
  const triggers: Record<string, any> = notificationConfig.triggers ?? {};

  // ── Sender identity + trigger toggles (local, seeded from config) ──────────
  const [senderName, setSenderName] = React.useState('');
  const [senderEmail, setSenderEmail] = React.useState('');
  const [founderNotifications, setFounderNotifications] = React.useState<TriggerState>({
    appReceived: true, movedToReview: true, interviewInvited: true, decisionNotification: true,
  });
  const [reviewerNotifications, setReviewerNotifications] = React.useState<ReviewerState>({
    assignment: true, reviewReminder: true, deadlineApproaching: true,
  });

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || pid == null) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    setSenderName(notificationConfig.custom_sender_name ?? '');
    setSenderEmail(notificationConfig.custom_sender_email ?? '');
    setFounderNotifications({
      appReceived: bool(triggers.founder_app_received, true),
      movedToReview: bool(triggers.founder_review, true),
      interviewInvited: bool(triggers.founder_interview_invite, true),
      decisionNotification: bool(triggers.founder_decision, true),
    });
    setReviewerNotifications({
      assignment: bool(triggers.reviewer_assignment, true),
      reviewReminder: bool(triggers.reviewer_reminder, true),
      deadlineApproaching: bool(triggers.reviewer_deadline, true),
    });
    seededFor.current = pid;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, pid]);
  React.useEffect(() => {
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  const savePreferences = useMutation({
    mutationFn: () =>
      acceleratorApi.updateProgram(pid as number, {
        notification_config: {
          ...notificationConfig,
          custom_sender_name: senderName,
          custom_sender_email: senderEmail,
          triggers: {
            founder_app_received: founderNotifications.appReceived,
            founder_review: founderNotifications.movedToReview,
            founder_interview_invite: founderNotifications.interviewInvited,
            founder_decision: founderNotifications.decisionNotification,
            reviewer_assignment: reviewerNotifications.assignment,
            reviewer_reminder: reviewerNotifications.reviewReminder,
            reviewer_deadline: reviewerNotifications.deadlineApproaching,
          },
        },
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKey });
      toast({
        title: 'Communication Preferences Saved',
        description: 'Updated transactional notification triggers and email routing.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save communication preferences.',
        variant: 'error',
      });
    },
  });

  // ── Templates (real CRUD) ──────────────────────────────────────────────────
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: templatesKey,
    queryFn: () => acceleratorApi.osList<NotificationTemplateItem>('notification-templates', pid as number),
    enabled: pid != null,
  });

  const [selectedId, setSelectedId] = React.useState<number | 'new' | null>(null);
  const [draft, setDraft] = React.useState<NotificationTemplateItem>(emptyDraft());

  const selectTemplate = (tpl: NotificationTemplateItem) => {
    setSelectedId(tpl.id ?? 'new');
    setDraft({ ...tpl });
  };
  const startNew = () => {
    setSelectedId('new');
    setDraft(emptyDraft());
  };
  const closeEditor = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
  };
  const updateDraft = (patch: Partial<NotificationTemplateItem>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const invalidateTemplates = () => queryClient.invalidateQueries({ queryKey: templatesKey });

  const saveTemplate = useMutation({
    mutationFn: () => {
      const payload = {
        key: draft.key.trim(),
        name: draft.name.trim(),
        channel: draft.channel,
        subject: draft.subject ?? '',
        body: draft.body ?? '',
        is_active: draft.is_active ?? true,
      };
      return typeof selectedId === 'number'
        ? acceleratorApi.osUpdate<NotificationTemplateItem>('notification-templates', selectedId, payload)
        : acceleratorApi.osCreate<NotificationTemplateItem>('notification-templates', { program_id: pid as number, ...payload });
    },
    onSuccess: () => {
      invalidateTemplates();
      queryClient.invalidateQueries({ queryKey: programKey });
      toast({ title: 'Template saved', variant: 'success' });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save template.',
        variant: 'error',
      });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: number) => acceleratorApi.osDelete('notification-templates', id),
    onSuccess: () => {
      invalidateTemplates();
      closeEditor();
      toast({ title: 'Template deleted', variant: 'success' });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'error' }),
  });

  const submitTemplate = () => {
    if (!draft.key.trim() || !draft.name.trim()) {
      toast({ title: 'Key and name are required', variant: 'error' });
      return;
    }
    saveTemplate.mutate();
  };

  const channelLabel = (ch: string) => CHANNELS.find((c) => c.value === ch)?.label ?? ch;
  const senderDisplay = senderEmail || (notificationConfig.custom_sender_email as string) || '';

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure communications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Communications · Email &amp; Alerts
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Mail className="h-5 w-5 text-indigo-400" />
          Communications, Notifications &amp; Templates
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Store the sender identity, founder and reviewer trigger preferences, and notification templates for
          this program. These are persisted settings — nothing here verifies a live mail gateway, and dispatch
          is not wired to these templates yet.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {/* Sender identity, saved to notification_config on the program record.
            This is deliberately not a connection status: whether mail can leave
            the server is decided by Django's mail backend in settings, which
            this screen cannot see, so claiming "connected" here would be fiction. */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-white">Sender identity</span>
                <p className="text-[11px] text-white/50">
                  {senderDisplay ? `Saved on this program: ${senderDisplay}` : 'No sender saved on this program yet.'}
                </p>
              </div>
            </div>
            <span className="text-[10px] text-white/40 font-mono shrink-0">
              Delivery uses the server's configured mail backend
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Sender name</label>
              <input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="e.g. Lagos Innovation admissions"
                className={inputCls + ' mt-1'}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Sender email</label>
              <input
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="admissions@example.org"
                className={inputCls + ' mt-1'}
              />
            </div>
          </div>
        </div>

        {/* Notifications Checkboxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Founder Triggers */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-indigo-400" /> Founder Notifications
            </h4>
            <div className="space-y-2 text-xs text-white/80">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={founderNotifications.appReceived}
                  onChange={(e) => setFounderNotifications({ ...founderNotifications, appReceived: e.target.checked })}
                  className="rounded border-white/20 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Application received confirmation</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={founderNotifications.movedToReview}
                  onChange={(e) => setFounderNotifications({ ...founderNotifications, movedToReview: e.target.checked })}
                  className="rounded border-white/20 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Dossier advanced to partner review</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={founderNotifications.interviewInvited}
                  onChange={(e) => setFounderNotifications({ ...founderNotifications, interviewInvited: e.target.checked })}
                  className="rounded border-white/20 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Interview invitation &amp; calendar invite</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={founderNotifications.decisionNotification}
                  onChange={(e) => setFounderNotifications({ ...founderNotifications, decisionNotification: e.target.checked })}
                  className="rounded border-white/20 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Formal committee selection decision</span>
              </label>
            </div>
          </div>

          {/* Reviewer Triggers */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 text-purple-400" /> Reviewer &amp; Staff Alerts
            </h4>
            <div className="space-y-2 text-xs text-white/80">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewerNotifications.assignment}
                  onChange={(e) => setReviewerNotifications({ ...reviewerNotifications, assignment: e.target.checked })}
                  className="rounded border-white/20 text-indigo-600 focus:ring-indigo-500"
                />
                <span>New candidate assigned to queue</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewerNotifications.reviewReminder}
                  onChange={(e) => setReviewerNotifications({ ...reviewerNotifications, reviewReminder: e.target.checked })}
                  className="rounded border-white/20 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Reviewer inactivity reminder (3 days)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewerNotifications.deadlineApproaching}
                  onChange={(e) => setReviewerNotifications({ ...reviewerNotifications, deadlineApproaching: e.target.checked })}
                  className="rounded border-white/20 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Admissions cycle deadline approaching (48h)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Section 14: Automated Notification Rules */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Automated Notification Rules</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
              <span className="text-[10px] font-mono text-indigo-300 font-bold uppercase">Rule 01</span>
              <p className="font-bold text-white">Reviewer inactive on assigned app</p>
              <p className="text-[11px] text-white/50">After 3 days $\rightarrow$ Send automated reminder</p>
            </div>
            <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
              <span className="text-[10px] font-mono text-indigo-300 font-bold uppercase">Rule 02</span>
              <p className="font-bold text-white">Unassigned pending application</p>
              <p className="text-[11px] text-white/50">After 12 hours $\rightarrow$ Notify Program Manager</p>
            </div>
            <div className="p-3.5 rounded-xl border border-white/10 bg-black/20 space-y-1">
              <span className="text-[10px] font-mono text-indigo-300 font-bold uppercase">Rule 03</span>
              <p className="font-bold text-white">Scheduled founder interview</p>
              <p className="text-[11px] text-white/50">24 hours prior $\rightarrow$ Email + in-app notification</p>
            </div>
          </div>
        </div>

        {/* Email Templates Gallery */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Configured Message Templates</h4>
            <Button onClick={startNew} size="sm" variant="secondary" className="bg-white/10 hover:bg-white/15 text-white text-xs">
              <Plus className="h-3.5 w-3.5" /> New template
            </Button>
          </div>
          {templatesLoading ? (
            <div className="flex items-center gap-2 text-xs text-white/50 py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <p className="text-[11px] text-white/40 italic">
              No templates yet for {activeProgram?.name ?? 'this program'} — create one to get started.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => selectTemplate(tpl)}
                  className={`p-3 rounded-xl border text-left transition ${
                    selectedId === tpl.id
                      ? 'border-indigo-500 bg-indigo-950/20 text-white font-bold'
                      : 'border-white/10 bg-black/20 text-white/70 hover:text-white'
                  }`}
                >
                  <span className="text-[10px] text-white/40 block font-mono uppercase">
                    {channelLabel(tpl.channel)}{tpl.is_active === false ? ' · off' : ''}
                  </span>
                  <span className="text-xs">{tpl.name || tpl.key}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Template Editor */}
        {selectedId !== null && (
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-indigo-400" />
                {typeof selectedId === 'number' ? 'Edit template' : 'New template'}
              </h4>
              <button onClick={closeEditor} className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={draft.key}
                onChange={(e) => updateDraft({ key: e.target.value })}
                placeholder="Template key (e.g. app_received)"
                className={inputCls}
              />
              <input
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="Display name"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={draft.channel}
                onChange={(e) => updateDraft({ channel: e.target.value })}
                className={inputCls}
              >
                {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <label className="flex items-center gap-2.5 text-xs text-white/70 rounded-lg bg-black/30 border border-white/10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={draft.is_active ?? true}
                  onChange={(e) => updateDraft({ is_active: e.target.checked })}
                  className="accent-indigo-500"
                />
                Active
              </label>
            </div>
            <input
              value={draft.subject ?? ''}
              onChange={(e) => updateDraft({ subject: e.target.value })}
              placeholder="Subject"
              className={inputCls}
            />
            <textarea
              value={draft.body ?? ''}
              onChange={(e) => updateDraft({ body: e.target.value })}
              placeholder="Body"
              rows={6}
              className={inputCls + ' font-mono resize-y'}
            />
            <div className="flex items-center justify-between">
              {typeof selectedId === 'number' ? (
                <Button
                  onClick={() => deleteTemplate.mutate(selectedId)}
                  disabled={deleteTemplate.isPending}
                  size="sm" variant="ghost"
                  className="text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              ) : <span />}
              <Button
                onClick={submitTemplate}
                disabled={saveTemplate.isPending}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs flex items-center gap-2"
              >
                {saveTemplate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saveTemplate.isPending ? 'Saving…' : 'Save template'}
              </Button>
            </div>
          </div>
        )}

        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-[11px] text-white/40">
            Templates support dynamic tags: <code className="text-indigo-300 font-mono">&#123;&#123;founder_name&#125;&#125;</code>, <code className="text-indigo-300 font-mono">&#123;&#123;company_name&#125;&#125;</code>
          </span>
          <Button
            onClick={() => savePreferences.mutate()}
            disabled={savePreferences.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2"
          >
            {savePreferences.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{savePreferences.isPending ? 'Saving...' : 'Save Communications'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
