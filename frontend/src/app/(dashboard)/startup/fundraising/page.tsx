'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { CheckCircle2, RefreshCw, Save, Info } from 'lucide-react';
import { apiGet, apiPost, apiPatch } from '@/lib/api';
import { JsonLd } from '@/components/seo/JsonLd';

interface Campaign {
  round_name: string;
  target_amount_usd: string;
  valuation_cap_usd: string;
  instrument: string;
  status: string;
  target_close_date: string;
  terms_summary: string;
}

const INSTRUMENTS = [
  'Post-Money SAFE', 'Pre-Money SAFE', 'Convertible Note',
  'Priced Equity (Series Seed)', 'Grant', 'Revenue-Based Financing',
];

const STATUSES = [
  { value: 'preparing', label: 'Preparing Materials' },
  { value: 'active',    label: 'Actively Raising'   },
  { value: 'closing',   label: 'Closing Round'      },
  { value: 'completed', label: 'Round Closed'       },
  { value: 'paused',    label: 'Fundraising Paused' },
];

export default function FundraisingPage() {
  React.useEffect(() => {
    document.title = 'Fundraising Round & Strategy | Pitchmic';
  }, []);

  const qc = useQueryClient();
  const [form, setForm] = React.useState<Partial<Campaign>>({ instrument: 'Post-Money SAFE', status: 'preparing' });
  const [saved, setSaved] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['campaign'],
    queryFn: () => apiGet<{ results: Campaign[] }>('/startups/campaigns/'),
  });

  React.useEffect(() => { if (data?.results?.[0]) setForm(data.results[0]); }, [data]);

  const mutation = useMutation({
    mutationFn: (d: Partial<Campaign>) =>
      data?.results?.[0]
        ? apiPatch('/startups/campaigns/' + (data.results[0] as any).id + '/', d)
        : apiPost('/startups/campaigns/', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = (k: keyof Campaign, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <div className="flex items-center justify-center py-24"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <JsonLd id="fundraising-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup', item: '/startup' },
            { '@type': 'ListItem', position: 3, name: 'Fundraising Round', item: '/startup/fundraising' },
          ]},
          { '@type': 'FAQPage', mainEntity: [
            { '@type': 'Question', name: 'Should African startups use a SAFE or convertible note?',
              acceptedAnswer: { '@type': 'Answer', text: 'Post-Money SAFEs are the standard pre-seed instrument in Africa - they are simpler, faster, and have no interest rate or maturity date. Convertible notes are still used but require legal negotiation on interest rate, maturity, and discount. For a first cheque under $250K, a Post-Money SAFE with a reasonable valuation cap ($1.5M–$4M) is the fastest path to closing.' },
            },
            { '@type': 'Question', name: 'What valuation cap should a Nigerian pre-seed startup set?',
              acceptedAnswer: { '@type': 'Answer', text: 'Pre-seed valuation caps in Nigeria typically range from $1M to $5M depending on sector, team, and traction. Fintech and B2B SaaS with an MVP and early customers typically command $2M–$4M caps. Idea-stage startups should expect $1M–$2M. Setting a cap too high is a common mistake - it can block the next round if you have not grown into the valuation.' },
            },
          ]},
        ],
      }} />
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        Define your round with a specific milestone. &quot;$300k will hire 2 engineers and reach $15k MRR in 9 months&quot; is far stronger than &quot;$500k to grow the team&quot;.
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Current Round</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Round name</Label>
              <Input value={form.round_name ?? ''} placeholder="e.g. Pre-Seed Round"
                onChange={(e) => set('round_name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Instrument</Label>
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.instrument ?? ''} onChange={(e) => set('instrument', e.target.value)}>
                {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Target amount (USD)</Label>
              <Input type="number" value={form.target_amount_usd ?? ''} placeholder="500000"
                onChange={(e) => set('target_amount_usd', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valuation cap (USD)</Label>
              <Input type="number" value={form.valuation_cap_usd ?? ''} placeholder="4000000"
                onChange={(e) => set('valuation_cap_usd', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.status ?? 'preparing'} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Target close date</Label>
              <Input type="date" value={form.target_close_date ?? ''}
                onChange={(e) => set('target_close_date', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Use of funds & milestone</Label>
            <Textarea rows={4} value={form.terms_summary ?? ''}
              placeholder="Be specific: '$300k will hire 2 engineers (backend + ML), build the reconciliation engine, and reach $15k MRR within 9 months.'"
              onChange={(e) => set('terms_summary', e.target.value)} />
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
