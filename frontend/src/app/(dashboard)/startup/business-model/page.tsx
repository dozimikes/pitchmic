'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { CheckCircle2, RefreshCw, Save, Info } from 'lucide-react';
import { fundabilityApi, type BusinessModelProfile } from '@/lib/fundabilityApi';
import { JsonLd } from '@/components/seo/JsonLd';

const REVENUE_MODELS = [
  { value: 'saas',        label: 'SaaS / Subscription' },
  { value: 'transaction', label: 'Transaction / Usage Fee' },
  { value: 'marketplace', label: 'Marketplace / Platform' },
  { value: 'licensing',   label: 'Licensing / Royalty' },
  { value: 'services',    label: 'Professional Services' },
  { value: 'advertising', label: 'Advertising / Sponsorship' },
  { value: 'hybrid',      label: 'Hybrid / Multiple Streams' },
  { value: 'not_yet',     label: 'Not Yet Monetizing' },
];

const CUSTOMER_TYPES = [
  { value: 'b2b',         label: 'B2B: Businesses' },
  { value: 'b2c',         label: 'B2C: Consumers' },
  { value: 'b2b2c',       label: 'B2B2C' },
  { value: 'b2g',         label: 'B2G: Government' },
  { value: 'marketplace', label: 'Marketplace: Both Sides' },
];

const SALES_MODELS = [
  { value: 'product_led', label: 'Product-Led Growth' },
  { value: 'sales_led',   label: 'Sales-Led / Direct Sales' },
  { value: 'channel',     label: 'Channel / Partner Sales' },
  { value: 'inbound',     label: 'Inbound Marketing' },
  { value: 'hybrid',      label: 'Hybrid' },
];

export default function BusinessModelPage() {
  React.useEffect(() => {
    document.title = 'Business Model & Revenue | Pitchmic';
  }, []);

  const qc = useQueryClient();
  const [form, setForm] = React.useState<Partial<BusinessModelProfile>>({
    revenue_model: 'not_yet',
    customer_type: 'b2b',
    sales_model: 'product_led',
    unit_economics_are_modelled: true,
  });
  const [saved, setSaved] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['business-model'],
    queryFn: fundabilityApi.getBusinessModel,
  });

  React.useEffect(() => {
    if (data && Object.keys(data).length > 0) setForm(data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: (d: Partial<BusinessModelProfile>) => fundabilityApi.saveBusinessModel(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-model'] });
      qc.invalidateQueries({ queryKey: ['fundability'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = <K extends keyof BusinessModelProfile>(k: K, v: BusinessModelProfile[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const cacLtvRatio = form.cac_usd && form.ltv_usd && parseFloat(String(form.cac_usd)) > 0
    ? (parseFloat(String(form.ltv_usd)) / parseFloat(String(form.cac_usd))).toFixed(2)
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <JsonLd id="bizmodel-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup', item: '/startup' },
            { '@type': 'ListItem', position: 3, name: 'Business Model', item: '/startup/business-model' },
          ]},
          { '@type': 'FAQPage', mainEntity: [
            { '@type': 'Question', name: 'What LTV to CAC ratio do investors expect?',
              acceptedAnswer: { '@type': 'Answer', text: 'A healthy SaaS LTV:CAC ratio is 3:1 or higher - meaning a customer generates at least 3× what it cost to acquire them. Below 1:1 means you lose money on every customer. At pre-seed, modelled estimates are accepted but must be labelled as such. A real observed LTV:CAC, even from 5 customers, is far more compelling than a model.' },
            },
            { '@type': 'Question', name: 'What gross margin do African startups need for venture investment?',
              acceptedAnswer: { '@type': 'Answer', text: 'Software-first startups need gross margins above 60% for venture. Marketplace and fintech businesses often run 30–50%. Services businesses below 30% gross margin are rarely venture-backable. If your current margin is low, show a clear path to improvement at scale.' },
            },
          ]},
        ],
      }} />
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        Investors evaluate whether your business model is repeatable and scalable.
        Fill in what you know. Even modelled unit economics are better than leaving fields blank.
      </div>

      {/* Revenue Model */}
      <Card>
        <CardHeader><CardTitle className="text-base">Revenue model</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Revenue model</Label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.revenue_model ?? 'not_yet'}
                onChange={(e) => set('revenue_model', e.target.value)}
              >
                {REVENUE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Customer type</Label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.customer_type ?? 'b2b'}
                onChange={(e) => set('customer_type', e.target.value)}
              >
                {CUSTOMER_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Sales motion</Label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.sales_model ?? 'product_led'}
                onChange={(e) => set('sales_model', e.target.value)}
              >
                {SALES_MODELS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Pricing model</Label>
              <Input
                value={form.pricing_model ?? ''}
                placeholder="e.g. $49/mo per seat, 2% transaction fee"
                onChange={(e) => set('pricing_model', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Revenue model description</Label>
            <Textarea
              rows={3}
              value={form.revenue_model_description ?? ''}
              placeholder="Explain specifically how you make money: what triggers a payment, who pays, and how often."
              onChange={(e) => set('revenue_model_description', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Unit Economics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Unit economics</CardTitle>
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={form.unit_economics_are_modelled ?? true}
                onChange={(e) => set('unit_economics_are_modelled', e.target.checked)}
                className="rounded"
              />
              These are modelled estimates (not observed actuals)
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Average contract value (USD)</Label>
              <Input
                type="number"
                value={form.average_contract_value_usd ?? ''}
                placeholder="0"
                onChange={(e) => set('average_contract_value_usd', e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gross margin (%)</Label>
              <Input
                type="number"
                min={-100}
                max={100}
                value={form.gross_margin_pct ?? ''}
                placeholder="e.g. 65"
                onChange={(e) => set('gross_margin_pct', e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>CAC: Customer acquisition cost (USD)</Label>
              <Input
                type="number"
                value={form.cac_usd ?? ''}
                placeholder="0"
                onChange={(e) => set('cac_usd', e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>LTV: Customer lifetime value (USD)</Label>
              <Input
                type="number"
                value={form.ltv_usd ?? ''}
                placeholder="0"
                onChange={(e) => set('ltv_usd', e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payback period (months)</Label>
              <Input
                type="number"
                value={form.payback_months ?? ''}
                placeholder="e.g. 12"
                onChange={(e) => set('payback_months', e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
            {cacLtvRatio !== null && (
              <div className="space-y-1.5">
                <Label>LTV : CAC ratio</Label>
                <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800">
                  {cacLtvRatio}×
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {parseFloat(cacLtvRatio) >= 3 ? '✓ Healthy (≥3×)' : parseFloat(cacLtvRatio) >= 1 ? '⚠ Below target' : '✗ LTV < CAC'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Path to Profitability */}
      <Card>
        <CardHeader><CardTitle className="text-base">Path to profitability</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={form.path_to_profitability ?? ''}
            placeholder="At what revenue level or customer count does the business break even? What needs to be true for the unit economics to work at scale?"
            onChange={(e) => set('path_to_profitability', e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
          {mutation.isPending
            ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving…</>
            : <><Save className="h-4 w-4 mr-2" />Save</>}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />Saved
          </span>
        )}
      </div>
    </div>
  );
}
