'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

type IntegrationEntry = { enabled?: boolean; [key: string]: unknown };

// UI catalog keys → persisted inside module_config.integrations on the program.
// These are names of external tools, not a claim that Pitchmic talks to them:
// toggling one records your preference on the program record and nothing else.
// There is no OAuth handshake, token store or delivery path behind this screen,
// so no per-app status ("connected", "syncing", "auto-recording") belongs here.
const APP_CATALOG: { key: string; name: string; category: string }[] = [
  { key: 'google_workspace', name: 'Google Workspace & Calendar', category: 'Productivity' },
  { key: 'microsoft_365', name: 'Microsoft 365 & Teams', category: 'Productivity' },
  { key: 'slack', name: 'Slack', category: 'Communications' },
  { key: 'zoom', name: 'Zoom', category: 'Video Conferencing' },
  { key: 'whatsapp', name: 'WhatsApp Business', category: 'Messaging' },
  { key: 'hubspot', name: 'HubSpot CRM', category: 'Ecosystem CRM' },
  { key: 'quickbooks', name: 'QuickBooks / Xero', category: 'Accounting' },
];

export function IntegrationsSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeProgramId } = useActiveProgram();
  const pid = activeProgramId ?? null;
  const programKey = ['accelerator-settings-program', pid] as const;

  const { data: program } = useQuery({
    queryKey: programKey,
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const moduleConfig: Record<string, any> =
    React.useMemo(() => (program as any)?.module_config ?? {}, [program]);
  const integrationsCfg: Record<string, IntegrationEntry> = moduleConfig.integrations ?? {};

  const [enabledMap, setEnabledMap] = React.useState<Record<string, boolean>>({});

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!program || pid == null) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    const cfg: Record<string, IntegrationEntry> =
      ((program as any).module_config?.integrations as Record<string, IntegrationEntry>) ?? {};
    const map: Record<string, boolean> = {};
    for (const app of APP_CATALOG) map[app.key] = !!cfg[app.key]?.enabled;
    setEnabledMap(map);
    seededFor.current = pid;
  }, [program, pid]);

  React.useEffect(() => {
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  const saveIntegrations = useMutation({
    mutationFn: (nextIntegrations: Record<string, IntegrationEntry>) =>
      acceleratorApi.updateProgram(pid as number, {
        module_config: { ...moduleConfig, integrations: nextIntegrations },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programKey });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Preference Saved',
        description: 'Integration preference recorded on this program.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not update the integration preference.',
        variant: 'error',
      });
    },
  });

  const handleToggleIntegration = (key: string) => {
    const nextEnabled = !enabledMap[key];
    setEnabledMap((prev) => ({ ...prev, [key]: nextEnabled }));
    saveIntegrations.mutate({
      ...integrationsCfg,
      [key]: { ...(integrationsCfg[key] || {}), enabled: nextEnabled },
    });
  };

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to record its integration preferences.</p>
      </div>
    );
  }

  const enabledCount = APP_CATALOG.filter((app) => enabledMap[app.key]).length;

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Integrations · Preferences
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Share2 className="h-5 w-5 text-indigo-400" />
          Program Integration Preferences
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Record which external tools this program works with. Each choice is saved to the program
          configuration — this screen does not connect accounts, and no data flows to or from these
          services because of it.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Tools</h4>
          <span className="text-[11px] text-white/40 font-mono">
            {enabledCount} of {APP_CATALOG.length} marked in use
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {APP_CATALOG.map((app) => {
            const enabled = !!enabledMap[app.key];
            return (
              <div
                key={app.key}
                className="p-4 rounded-xl border border-white/10 bg-black/20 flex flex-col justify-between space-y-3 hover:border-white/20 transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase font-mono text-white/40">{app.category}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {enabled ? 'Marked in use' : 'Not marked'}
                    </span>
                  </div>
                  <h5 className="text-xs font-bold text-white">{app.name}</h5>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleIntegration(app.key)}
                  disabled={saveIntegrations.isPending}
                  className={`w-full text-xs font-semibold ${
                    enabled
                      ? 'border-white/10 text-white/70 hover:text-white'
                      : 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30'
                  }`}
                >
                  {enabled ? 'Mark as not in use' : 'Mark as in use'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
