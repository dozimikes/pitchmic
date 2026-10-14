'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { CheckCircle2, RefreshCw, Save, Info } from 'lucide-react';
import { fundabilityApi, type MarketProfile } from '@/lib/fundabilityApi';
import { JsonLd } from '@/components/seo/JsonLd';

const EVIDENCE_SOURCES = [
  { value: 'founder_estimate',   label: 'Founder Estimate (Bottom-Up)' },
  { value: 'third_party_report', label: 'Third-Party Industry Report' },
  { value: 'government_data',    label: 'Government / Official Statistics' },
  { value: 'comparable_company', label: 'Comparable Company Revenue' },
  { value: 'customer_research',  label: 'Primary Customer Research' },
];

export default function MarketPage() {
  React.useEffect(() => {
    document.title = 'Market Analysis & Opportunity | Pitchmic';
  }, []);

  const qc = useQueryClient();
  const [form, setForm] = React.useState<Partial<MarketProfile>>({});
  const [saved, setSaved] = React.useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['market-profile'], queryFn: fundabilityApi.getMarketProfile });
  React.useEffect(() => { if (data && Object.keys(data).length) setForm(data); }, [data]);

  const mutation = useMutation({
    mutationFn: (d: Partial<MarketProfile>) => fundabilityApi.saveMarketProfile(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['market-profile'] }); setSaved(true); setTimeout(() => setSaved(false), 2500); },
  });

  const set = (k: keyof MarketProfile, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <div className="flex items-center justify-center py-24"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <JsonLd id="market-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup', item: '/startup' },
            { '@type': 'ListItem', position: 3, name: 'Market', item: '/startup/market' },
          ]},
          { '@type': 'FAQPage', mainEntity: [
            { '@type': 'Question', name: 'How do I calculate TAM, SAM and SOM for my startup?',
              acceptedAnswer: { '@type': 'Answer', text: 'TAM (Total Addressable Market) is the total global revenue opportunity if you captured 100% of the market. SAM (Serviceable Addressable Market) is the subset you can realistically reach with your current product and distribution. SOM (Serviceable Obtainable Market) is what you can realistically capture in 3–5 years. Use bottom-up calculation (number of potential customers × ACV) for credibility - top-down claims from Statista alone are routinely challenged.' },
            },
            { '@type': 'Question', name: 'What market size is too small for venture capital?',
              acceptedAnswer: { '@type': 'Answer', text: 'Most institutional VCs require a TAM of at least $1B to justify a venture return. For African pre-seed funds like Microtraction or Ajim Capital, a credible $500M African TAM with strong SAM can be sufficient. If your market is sub-$200M globally, consider grant or revenue-based financing instead.' },
            },
          ]},
        ],
      }} />
      <Card>
        <CardHeader><CardTitle className="text-base">How big is the opportunity?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            Investors do not want guesswork here. If you can point to a credible source or a clear calculation, your numbers become much more believable.
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: 'tam_usd', label: 'TAM (USD)', hint: 'Total Addressable Market' },
              { key: 'sam_usd', label: 'SAM (USD)', hint: 'Serviceable Addressable Market' },
              { key: 'som_usd', label: 'SOM (USD)', hint: '5-year realistic target' },
            ].map(({ key, label, hint }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  type="number" min={0} placeholder="0"
                  value={(form as any)[key] ?? ''}
                  onChange={(e) => set(key as keyof MarketProfile, e.target.value || null)}
                />
                <p className="text-xs text-slate-400">{hint}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Market CAGR (%)</Label>
              <Input type="number" placeholder="e.g. 18" value={form.market_growth_rate_pct ?? ''}
                onChange={(e) => set('market_growth_rate_pct', e.target.value ? parseFloat(e.target.value) : null)} />
            </div>
            <div className="space-y-1.5">
              <Label>TAM evidence source</Label>
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.tam_evidence_source ?? 'founder_estimate'} onChange={(e) => set('tam_evidence_source', e.target.value)}>
                {EVIDENCE_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Source citation</Label>
            <Input value={form.tam_source_citation ?? ''} placeholder="Report name, URL, or description"
              onChange={(e) => set('tam_source_citation', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sizing methodology</Label>
            <Textarea rows={2} value={form.market_sizing_methodology ?? ''}
              placeholder="How did you calculate this? Top-down from total industry or bottom-up from segment sizes?"
              onChange={(e) => set('market_sizing_methodology', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Where you play</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Primary market</Label>
              <Input value={form.primary_geography ?? ''} placeholder="e.g. Nigeria" onChange={(e) => set('primary_geography', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expansion (24 months)</Label>
              <Input value={form.expansion_geography ?? ''} placeholder="e.g. Kenya, Ghana, South Africa" onChange={(e) => set('expansion_geography', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Who else is in the space?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Direct competitors</Label>
            <Textarea rows={2} value={form.direct_competitors ?? ''}
              placeholder="Companies solving the same problem for the same customer. If you say 'no direct competitors', investors will be sceptical."
              onChange={(e) => set('direct_competitors', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Indirect competitors / substitutes</Label>
            <Textarea rows={2} value={form.indirect_competitors ?? ''}
              onChange={(e) => set('indirect_competitors', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Why will you win?</Label>
            <Textarea rows={2} value={form.competitive_advantage ?? ''}
              placeholder="Specific reasons your company outperforms alternatives for your target customer"
              onChange={(e) => set('competitive_advantage', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Regulatory considerations</Label>
            <Textarea rows={2} value={form.regulatory_notes ?? ''}
              placeholder="Licenses required, compliance obligations, regulatory risks or advantages"
              onChange={(e) => set('regulatory_notes', e.target.value)} />
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
