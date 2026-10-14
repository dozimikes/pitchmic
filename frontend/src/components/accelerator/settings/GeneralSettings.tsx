'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

interface GeneralSettingsProps {
  orgName: string;
  onUpdateOrgName: (name: string) => void;
}

const fieldCls =
  'w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-xs text-white ' +
  'placeholder-white/30 focus:border-indigo-500 focus:outline-none';

// Real program_type choices backed by the AcceleratorProgram model.
const PROGRAM_TYPES: { value: string; label: string }[] = [
  { value: 'vc_accelerator', label: 'Venture Accelerator' },
  { value: 'corporate', label: 'Corporate Accelerator' },
  { value: 'government', label: 'Government Program' },
  { value: 'university', label: 'University Innovation Lab' },
  { value: 'impact', label: 'Impact Fund' },
  { value: 'pre_accelerator', label: 'Pre-Accelerator' },
  { value: 'incubator', label: 'Incubator' },
  { value: 'venture_studio', label: 'Venture Studio' },
  { value: 'grant_program', label: 'Grant Program' },
  { value: 'other', label: 'Other' },
];

export function GeneralSettings({ orgName, onUpdateOrgName }: GeneralSettingsProps) {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;

  const { data: program, isLoading } = useQuery({
    queryKey: ['accelerator-general-settings', pid],
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const [form, setForm] = React.useState({
    name: '',
    organization_name: '',
    tagline: '',
    program_type: '',
    sector_focus: '',
    geography_focus: '',
    is_public: false,
    is_active: true,
  });

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  React.useEffect(() => {
    if (!program || pid == null) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    setForm({
      name: program.name ?? '',
      organization_name: program.organization_name || orgName || '',
      tagline: program.tagline ?? '',
      program_type: (program as any).program_type ?? '',
      sector_focus: program.sector_focus ?? '',
      geography_focus: program.geography_focus ?? '',
      is_public: (program as any).is_public ?? false,
      is_active: program.is_active ?? true,
    });
    seededFor.current = pid;
  }, [program, pid, orgName]);

  const update = (field: keyof typeof form, val: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: val }) as typeof form);
    if (field === 'organization_name' && typeof val === 'string') onUpdateOrgName(val);
  };

  const saveProgram = useMutation({
    mutationFn: () =>
      acceleratorApi.updateProgram(pid as number, {
        name: form.name,
        organization_name: form.organization_name,
        tagline: form.tagline,
        program_type: form.program_type,
        sector_focus: form.sector_focus,
        geography_focus: form.geography_focus,
        is_public: form.is_public,
        is_active: form.is_active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accelerator-general-settings', pid] });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Program configuration saved',
        description: 'General settings updated for this active program.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save program settings.',
        variant: 'error',
      });
    },
  });

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure its general settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Program · General
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Building2 className="h-5 w-5 text-indigo-400" />
          General Program Configuration
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Core identity parameters for the active program. Values cascade as defaults into the portal, application flow, and reporting.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-white/50 py-10">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading program…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Program Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/70">Program Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  className={fieldCls}
                />
              </div>

              {/* Organization Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/70">Organization Name</label>
                <input
                  type="text"
                  value={form.organization_name}
                  onChange={(e) => update('organization_name', e.target.value)}
                  className={fieldCls}
                />
              </div>

              {/* Tagline */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-white/70">Tagline</label>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => update('tagline', e.target.value)}
                  className={fieldCls}
                />
              </div>

              {/* Program Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/70">Program Type</label>
                <select
                  value={form.program_type}
                  onChange={(e) => update('program_type', e.target.value)}
                  className={fieldCls}
                >
                  <option value="">Select type…</option>
                  {PROGRAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Sector Focus */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/70">Sector Focus</label>
                <input
                  type="text"
                  value={form.sector_focus}
                  onChange={(e) => update('sector_focus', e.target.value)}
                  className={fieldCls}
                />
              </div>

              {/* Geography Focus */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/70">Geography Focus</label>
                <input
                  type="text"
                  value={form.geography_focus}
                  onChange={(e) => update('geography_focus', e.target.value)}
                  className={fieldCls}
                />
              </div>

              {/* Public / Active toggles */}
              <div className="flex items-center gap-6 md:col-span-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_public}
                    onChange={(e) => update('is_public', e.target.checked)}
                    className="accent-indigo-500 h-4 w-4"
                  />
                  Publicly listed program
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => update('is_active', e.target.checked)}
                    className="accent-emerald-500 h-4 w-4"
                  />
                  Program active
                </label>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 flex items-center justify-between">
              <span className="text-[11px] text-white/40">
                Changes apply immediately to the active program across the workspace.
              </span>
              <Button
                onClick={() => saveProgram.mutate()}
                disabled={saveProgram.isPending}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2"
              >
                {saveProgram.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>{saveProgram.isPending ? 'Saving Changes...' : 'Save Changes'}</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
