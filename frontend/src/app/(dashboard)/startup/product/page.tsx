'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { CheckCircle2, RefreshCw, Save, Info } from 'lucide-react';
import { fundabilityApi, type ProductProfile } from '@/lib/fundabilityApi';
import { JsonLd } from '@/components/seo/JsonLd';

const PRODUCT_STATUSES = [
  { value: 'idea',      label: 'Idea / Concept Only' },
  { value: 'prototype', label: 'Prototype / Early Build' },
  { value: 'mvp',       label: 'MVP: Internal / Limited Testing' },
  { value: 'beta',      label: 'Beta: External Users' },
  { value: 'live',      label: 'Live / Production' },
  { value: 'scaling',   label: 'Scaling: Post-PMF' },
];

const TECH_DIFFERENTIATORS = [
  { value: 'none',      label: 'No Significant Technical Differentiation' },
  { value: 'workflow',  label: 'Workflow / UX Differentiation' },
  { value: 'data',      label: 'Proprietary Data or Network Effects' },
  { value: 'algorithm', label: 'Proprietary Algorithm or Model' },
  { value: 'platform',  label: 'Platform / API Integration Layer' },
  { value: 'hardware',  label: 'Hardware / Physical Component' },
  { value: 'ip',        label: 'Filed or Granted IP / Patents' },
];

const PAIN_FREQUENCIES = [
  { value: 'daily',     label: 'Daily' },
  { value: 'weekly',    label: 'Weekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'occasional',label: 'Occasional' },
  { value: 'one_time',  label: 'One-Time Event' },
];

export default function ProductPage() {
  React.useEffect(() => {
    document.title = 'Product & Solution Details | Pitchmic';
  }, []);

  const qc = useQueryClient();
  const [form, setForm] = React.useState<Partial<ProductProfile>>({});
  const [saved, setSaved] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['product-profile'],
    queryFn: fundabilityApi.getProductProfile,
  });
  React.useEffect(() => { if (data && Object.keys(data).length) setForm(data); }, [data]);

  const mutation = useMutation({
    mutationFn: (d: Partial<ProductProfile>) => fundabilityApi.saveProductProfile(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-profile'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = (k: keyof ProductProfile, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <div className="flex items-center justify-center py-24"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <JsonLd id="product-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup', item: '/startup' },
            { '@type': 'ListItem', position: 3, name: 'Product', item: '/startup/product' },
          ]},
          { '@type': 'FAQPage', mainEntity: [
            { '@type': 'Question', name: 'What product maturity do investors expect at pre-seed?',
              acceptedAnswer: { '@type': 'Answer', text: 'At pre-seed, investors expect at minimum an MVP - something a user can interact with. An idea with a mockup is acceptable for a very early angel round but will not pass accelerator diligence. A prototype or early-beta product with even 2–3 real users is significantly stronger.' },
            },
            { '@type': 'Question', name: 'How do I explain my startup\'s moat to investors?',
              acceptedAnswer: { '@type': 'Answer', text: 'A moat is a durable competitive advantage that prevents copying. The four types most credible at early stage: (1) network effects - product improves as more users join; (2) proprietary data - you accumulate data competitors cannot easily replicate; (3) switching costs - customers are locked in by integrations or workflow dependency; (4) technology - a filed or granted patent, or a genuinely hard-to-replicate technical approach.' },
            },
          ]},
        ],
      }} />
      <Card>
        <CardHeader><CardTitle className="text-base">What problem are you solving?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            Avoid broad statements. The strongest answers are specific, painful, and easy to picture in real life.
          </div>
          <div className="space-y-1.5">
            <Label>Problem statement</Label>
            <Textarea rows={3} value={form.problem_statement ?? ''}
              placeholder="Who experiences this problem, how often, and what it costs them"
              onChange={(e) => set('problem_statement', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Target customer</Label>
            <Textarea rows={2} value={form.target_customer_description ?? ''}
              placeholder="Be specific: not 'SMEs' but 'logistics managers at 10-50 person companies in Lagos'"
              onChange={(e) => set('target_customer_description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>How often does this pain occur?</Label>
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.customer_pain_frequency ?? ''} onChange={(e) => set('customer_pain_frequency', e.target.value)}>
                <option value="">Select frequency</option>
                {PAIN_FREQUENCIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Current alternatives (what do customers use today?)</Label>
            <Textarea rows={2} value={form.current_alternatives ?? ''}
              placeholder="Spreadsheets, manual reconciliation, a competitor product, doing nothing..."
              onChange={(e) => set('current_alternatives', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">How are you solving it?</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Solution description</Label>
            <Textarea rows={3} value={form.solution_description ?? ''}
              placeholder="What the product actually does: specifically and concretely"
              onChange={(e) => set('solution_description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Product status</Label>
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.product_status ?? 'idea'} onChange={(e) => set('product_status', e.target.value)}>
                {PRODUCT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Demo / product URL</Label>
              <Input value={form.demo_url ?? ''} placeholder="https://" onChange={(e) => set('demo_url', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Why this can be hard to copy</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Technical differentiator</Label>
            <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
              value={form.tech_differentiator ?? 'none'} onChange={(e) => set('tech_differentiator', e.target.value)}>
              {TECH_DIFFERENTIATORS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Differentiation detail</Label>
            <Textarea rows={2} value={form.differentiator_description ?? ''}
              placeholder="What specifically prevents a well-funded competitor from copying this in 6 months?"
              onChange={(e) => set('differentiator_description', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Moat / defensibility</Label>
            <Textarea rows={2} value={form.moat_description ?? ''}
              placeholder="Network effects, switching costs, data moat, regulatory barriers, speed of execution..."
              onChange={(e) => set('moat_description', e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="ip" checked={form.has_filed_ip ?? false}
              onChange={(e) => set('has_filed_ip', e.target.checked)} className="rounded border-slate-300" />
            <Label htmlFor="ip" className="cursor-pointer text-sm">IP filed or granted</Label>
          </div>
          {form.has_filed_ip && (
            <div className="space-y-1.5">
              <Label>IP description</Label>
              <Input value={form.ip_description ?? ''} placeholder="Patent number, description, filing status"
                onChange={(e) => set('ip_description', e.target.value)} />
            </div>
          )}
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
