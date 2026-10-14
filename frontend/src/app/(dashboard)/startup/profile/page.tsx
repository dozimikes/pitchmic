'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { CheckCircle2, RefreshCw, Save } from 'lucide-react';
import { JsonLd } from '@/components/seo/JsonLd';

interface StartupProfileData {
  company_name: string;
  tagline: string;
  description: string;
  website: string;
  industry: string;
  funding_stage: string;
  founded_year: number | null;
  location: string;
  target_market: string;
  employee_count: string;
}

const STAGES = [
  { value: 'pre_seed', label: 'Pre-Seed' },
  { value: 'seed',     label: 'Seed'     },
  { value: 'series_a', label: 'Series A' },
  { value: 'series_b', label: 'Series B' },
  { value: 'series_c', label: 'Series C' },
  { value: 'growth',   label: 'Growth'   },
];

const TEAM_SIZE_OPTIONS = [
  { value: '1',     label: 'Solo founder (1)' },
  { value: '2-5',   label: '2–5'              },
  { value: '6-10',  label: '6–10'             },
  { value: '11-25', label: '11–25'            },
  { value: '26-50', label: '26–50'            },
  { value: '51+',   label: '51+'              },
];

export default function StartupProfilePage() {
  React.useEffect(() => {
    document.title = 'Company Identity & Profile | Pitchmic';
  }, []);

  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const [saved, setSaved] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['me-startup-profile'],
    queryFn: () => apiGet<StartupProfileData>('/me/startup-profile/'),
    enabled: isAuthenticated,
  });

  const [form, setForm] = React.useState<Partial<StartupProfileData>>({});
  React.useEffect(() => { if (data) setForm(data); }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: Partial<StartupProfileData>) =>
      apiPatch('/me/startup-profile/', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me-startup-profile'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = (k: keyof StartupProfileData, v: string | number | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <JsonLd id="profile-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup', item: '/startup' },
            { '@type': 'ListItem', position: 3, name: 'Identity', item: '/startup/profile' },
          ]},
          { '@type': 'HowTo', name: 'How to write a compelling startup company description for investors',
            description: 'Tips for writing a startup profile that passes investor scrutiny.',
            step: [
              { '@type': 'HowToStep', position: 1, name: 'Be specific about the problem', text: 'Name the customer, the pain, and the frequency. "SMEs in logistics" is weaker than "Operations managers at 5–50 person freight companies who manually reconcile waybills daily".' },
              { '@type': 'HowToStep', position: 2, name: 'State your stage honestly', text: 'Declare pre-seed, seed, or series A accurately. Overstating stage is a diligence red flag.' },
              { '@type': 'HowToStep', position: 3, name: 'Keep the tagline under 12 words', text: 'Your tagline should be the one sentence a partner pitches at the IC. If it takes 25 words, it is not a tagline.' },
            ],
          },
        ],
      }} />
      <Card className="border-slate-200 bg-slate-50/70">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-slate-700">Give people a clear, credible picture of the company you are building.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Who you are</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Company name</Label>
              <Input value={form.company_name ?? ''} onChange={(e) => set('company_name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input value={form.website ?? ''} placeholder="https://" onChange={(e) => set('website', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input value={form.tagline ?? ''} placeholder="One-line description" onChange={(e) => set('tagline', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description ?? ''}
              rows={4}
              placeholder="What does your startup do? Who is the customer? What problem are you solving?"
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">How you position the business</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Industry / Sector</Label>
              <Input value={form.industry ?? ''} placeholder="e.g. Fintech, HealthTech" onChange={(e) => set('industry', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Funding stage</Label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                value={form.funding_stage ?? ''}
                onChange={(e) => set('funding_stage', e.target.value)}
              >
                <option value="">Select stage</option>
                {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Founded year</Label>
              <Input
                type="number" min="2000" max="2030"
                value={form.founded_year ?? ''}
                onChange={(e) => set('founded_year', e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Team size</Label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                value={form.employee_count ?? ''}
                onChange={(e) => set('employee_count', e.target.value)}
              >
                <option value="">Select size</option>
                {TEAM_SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>HQ location</Label>
              <Input value={form.location ?? ''} placeholder="City, Country" onChange={(e) => set('location', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Target markets</Label>
              <Input value={form.target_market ?? ''} placeholder="e.g. Nigeria, Kenya, South Africa" onChange={(e) => set('target_market', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
          {mutation.isPending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving…</> : <><Save className="h-4 w-4 mr-2" />Save</>}
        </Button>
        {saved && <span className="flex items-center gap-1.5 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />Saved</span>}
      </div>
    </div>
  );
}
