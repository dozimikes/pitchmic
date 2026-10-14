'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Palette, Globe, CheckCircle2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { acceleratorApi } from '@/lib/acceleratorApi';

interface BrandingConfig {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  logo_url: string;
  cover_image_url: string;
  favicon_url: string;
  custom_domain: string;
  powered_by_visible: boolean;
}

const EMPTY: BrandingConfig = {
  primary_color: '',
  secondary_color: '',
  accent_color: '',
  font_family: 'Inter',
  logo_url: '',
  cover_image_url: '',
  favicon_url: '',
  custom_domain: '',
  powered_by_visible: false,
};

export function BrandingSettings() {
  const { activeProgramId } = useActiveProgram();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const pid = activeProgramId ?? null;

  const { data: program } = useQuery({
    queryKey: ['accelerator-branding-settings', pid],
    queryFn: () => acceleratorApi.getProgram(pid as number),
    enabled: pid != null,
  });

  const [cfg, setCfg] = React.useState<BrandingConfig>({ ...EMPTY });
  // Preserve any server-side branding keys we don't render an editor for.
  const baseRef = React.useRef<Record<string, any>>({});

  const seededFor = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (seededFor.current !== pid) seededFor.current = null;
  }, [pid]);

  React.useEffect(() => {
    if (!program || pid == null) return;
    if (seededFor.current === pid) return; // don't clobber in-progress edits
    const loaded = ((program as any).branding_config ?? {}) as Partial<BrandingConfig>;
    baseRef.current = { ...loaded };
    setCfg({ ...EMPTY, ...loaded });
    seededFor.current = pid;
  }, [program, pid]);

  const set = (key: keyof BrandingConfig, val: string | boolean) =>
    setCfg((prev) => ({ ...prev, [key]: val }) as BrandingConfig);

  const saveBranding = useMutation({
    mutationFn: () =>
      acceleratorApi.updateProgram(pid as number, {
        branding_config: { ...baseRef.current, ...cfg },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accelerator-branding-settings', pid] });
      queryClient.invalidateQueries({ queryKey: ['accelerator-programs'] });
      toast({
        title: 'Branding & theme updated',
        description: 'White-label styles saved to this program.',
        variant: 'success',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.error || 'Could not save branding.',
        variant: 'error',
      });
    },
  });

  if (pid == null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-8 text-center">
        <p className="text-sm text-white/60">Select a program to configure its branding.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Program · White-Label
          </span>
        </div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Palette className="h-5 w-5 text-indigo-400" />
          Branding &amp; White-Label Portal Configuration
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Control this program&apos;s external appearance, founder intake experience, custom subdomain, and white-label Pitchmic masking.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0F1623] p-6 space-y-6 shadow-xl">
        {/* Color System */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Brand Palette &amp; Accents</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3.5 space-y-2">
              <label className="text-xs font-semibold text-white/70 block">Primary Brand Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={cfg.primary_color || '#000000'}
                  onChange={(e) => set('primary_color', e.target.value)}
                  className="h-9 w-9 rounded-lg border border-white/20 bg-transparent cursor-pointer"
                />
                <span className="font-mono text-xs text-white/80 uppercase">{cfg.primary_color || '—'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3.5 space-y-2">
              <label className="text-xs font-semibold text-white/70 block">Secondary Accent</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={cfg.secondary_color || '#000000'}
                  onChange={(e) => set('secondary_color', e.target.value)}
                  className="h-9 w-9 rounded-lg border border-white/20 bg-transparent cursor-pointer"
                />
                <span className="font-mono text-xs text-white/80 uppercase">{cfg.secondary_color || '—'}</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3.5 space-y-2">
              <label className="text-xs font-semibold text-white/70 block">Portal Typography</label>
              <select
                value={cfg.font_family}
                onChange={(e) => set('font_family', e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="Inter">Inter (Clean Enterprise)</option>
                <option value="Plus Jakarta Sans">Plus Jakarta Sans (Modern Venture)</option>
                <option value="Outfit">Outfit (Tech Bold)</option>
                <option value="Geist">Geist (Minimalist)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Custom Domain Section */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-emerald-400" />
                Dedicated Custom Domain
              </h4>
              <p className="text-xs text-white/40 mt-0.5">
                Host founder applications and portals entirely under your own domain name.
              </p>
            </div>
            {cfg.custom_domain && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                <CheckCircle2 className="h-3 w-3" /> Custom domain configured
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={cfg.custom_domain}
              onChange={(e) => set('custom_domain', e.target.value)}
              placeholder="apply.yourdomain.com"
              className="w-full max-w-md rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* White-Label Masking */}
        <div className="border-t border-white/10 pt-5 space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">White-Label Pitchmic Controls</h4>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">Full Brand Isolation (Mask Pitchmic Branding)</p>
                <p className="text-[11px] text-white/40 mt-0.5">
                  Removes all Pitchmic badges, watermarks, and footer mentions from the public founder experience.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!cfg.powered_by_visible}
                  onChange={(e) => set('powered_by_visible', !e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 flex items-center justify-between">
          <span className="text-[11px] text-white/40">
            Preview is live on{' '}
            <code className="text-indigo-300 font-mono">{cfg.custom_domain || '—'}</code>
          </span>
          <Button
            onClick={() => saveBranding.mutate()}
            disabled={saveBranding.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 flex items-center gap-2"
          >
            {saveBranding.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{saveBranding.isPending ? 'Saving...' : 'Save Branding'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
