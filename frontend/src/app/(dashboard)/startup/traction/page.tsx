'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { Plus, Trash2, RefreshCw, Info, CheckCircle2, Pencil, X } from 'lucide-react';
import { fundabilityApi, type TractionMetric } from '@/lib/fundabilityApi';
import { cn } from '@/lib/utils';
import { JsonLd } from '@/components/seo/JsonLd';

const METRIC_TYPES = [
  { value: 'mrr',          label: 'MRR: Monthly Recurring Revenue', unit: 'USD'          },
  { value: 'arr',          label: 'ARR: Annual Recurring Revenue',   unit: 'USD'          },
  { value: 'revenue',      label: 'Revenue (Non-Recurring)',          unit: 'USD'          },
  { value: 'gmv',          label: 'GMV / TPV',                        unit: 'USD'          },
  { value: 'users',        label: 'Registered Users',                 unit: 'users'        },
  { value: 'mau',          label: 'Monthly Active Users',             unit: 'users'        },
  { value: 'customers',    label: 'Paying Customers',                 unit: 'customers'    },
  { value: 'growth_rate',  label: 'Growth Rate (MoM %)',              unit: '%'            },
  { value: 'retention',    label: 'Retention Rate (%)',               unit: '%'            },
  { value: 'churn',        label: 'Churn Rate (%)',                   unit: '%'            },
  { value: 'pilots',       label: 'Active Pilots',                    unit: 'pilots'       },
  { value: 'waitlist',     label: 'Waitlist Signups',                 unit: 'signups'      },
  { value: 'partnerships', label: 'Signed Partnerships',              unit: 'partnerships' },
  { value: 'other',        label: 'Other Metric',                     unit: ''             },
];

const EVIDENCE_STATUSES = [
  { value: 'founder_reported',     label: 'Founder-Reported (Unverified)'              },
  { value: 'screenshot',           label: 'Screenshot / Dashboard Export'               },
  { value: 'analytics_export',     label: 'Analytics Export (Mixpanel / Amplitude)'    },
  { value: 'financial_statement',  label: 'Financial Statement'                         },
  { value: 'payment_processor',    label: 'Payment Processor Export (Stripe / Paystack)'},
  { value: 'third_party_verified', label: 'Third-Party Verified'                        },
];

const EVIDENCE_BADGE: Record<string, string> = {
  founder_reported:     'bg-slate-100 text-slate-600',
  screenshot:           'bg-blue-50 text-blue-700',
  analytics_export:     'bg-blue-100 text-blue-800',
  financial_statement:  'bg-emerald-50 text-emerald-700',
  payment_processor:    'bg-emerald-100 text-emerald-800',
  third_party_verified: 'bg-purple-100 text-purple-700',
};

const BLANK: Partial<TractionMetric> = {
  metric_type: 'mrr',
  value: 0,
  unit: 'USD',
  period_label: '',
  evidence_status: 'founder_reported',
  evidence_source_description: '',
};

function autoUnit(type: string) {
  return METRIC_TYPES.find((m) => m.value === type)?.unit ?? '';
}

// Inline form used for both adding and editing
function MetricForm({
  initial,
  onSave,
  onCancel,
  isPending,
  saveLabel,
}: {
  initial: Partial<TractionMetric>;
  onSave: (data: Partial<TractionMetric>) => void;
  onCancel: () => void;
  isPending: boolean;
  saveLabel: string;
}) {
  const [form, setForm] = React.useState<Partial<TractionMetric>>(initial);
  const set = (k: keyof TractionMetric, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Metric type</Label>
          <select
            className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
            value={form.metric_type ?? 'mrr'}
            onChange={(e) => { set('metric_type', e.target.value); set('unit', autoUnit(e.target.value)); }}
          >
            {METRIC_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Value</Label>
          <Input
            type="number"
            min={0}
            value={form.value ?? 0}
            onChange={(e) => set('value', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Unit</Label>
          <Input
            value={form.unit ?? ''}
            placeholder="USD, users, %, etc."
            onChange={(e) => set('unit', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Input
            value={form.period_label ?? ''}
            placeholder="e.g. August 2026, Q2 2026"
            onChange={(e) => set('period_label', e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Evidence status</Label>
          <select
            className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
            value={form.evidence_status ?? 'founder_reported'}
            onChange={(e) => set('evidence_status', e.target.value)}
          >
            {EVIDENCE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Evidence source (optional)</Label>
          <Input
            value={form.evidence_source_description ?? ''}
            placeholder="e.g. Stripe dashboard export, Mixpanel"
            onChange={(e) => set('evidence_source_description', e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onSave(form)}
          disabled={isPending || !form.period_label}
        >
          {isPending
            ? <RefreshCw className="h-4 w-4 animate-spin" />
            : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
          {saveLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function MetricRow({
  m,
  onEdit,
  onDelete,
}: {
  m: TractionMetric;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="flex-1 min-w-0 grid grid-cols-4 gap-2 text-sm">
        <div>
          <p className="font-medium text-slate-800 truncate">{m.metric_type_display}</p>
          <p className="text-xs text-slate-500">{m.period_label}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-900 tabular-nums">{m.value.toLocaleString()}</p>
          <p className="text-xs text-slate-500">{m.unit}</p>
        </div>
        <div>
          <Badge className={cn('text-xs', EVIDENCE_BADGE[m.evidence_status] ?? 'bg-slate-100 text-slate-600')}>
            {m.evidence_status_display}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-slate-500 truncate">{m.evidence_source_description}</p>
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function TractionPage() {
  React.useEffect(() => {
    document.title = 'Traction & Growth Metrics | Pitchmic';
  }, []);

  const qc = useQueryClient();
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ['traction-metrics'],
    queryFn: () => fundabilityApi.getTractionMetrics(),
  });

  const addMutation = useMutation({
    mutationFn: (d: Partial<TractionMetric>) => fundabilityApi.addTractionMetric(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traction-metrics'] });
      setAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TractionMetric> }) =>
      fundabilityApi.updateTractionMetric(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['traction-metrics'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fundabilityApi.deleteTractionMetric(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['traction-metrics'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <JsonLd id="traction-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup', item: '/startup' },
            { '@type': 'ListItem', position: 3, name: 'Traction', item: '/startup/traction' },
          ]},
          { '@type': 'FAQPage', mainEntity: [
            { '@type': 'Question', name: 'What traction do investors expect at pre-seed in Africa?',
              acceptedAnswer: { '@type': 'Answer', text: 'For pre-seed in Africa, any of the following is strong traction: 10+ paying customers with verifiable invoices; $3,000–$10,000 MRR from at least 3 months of data; a signed pilot with a named enterprise client; 500+ active users with 30-day retention above 40%; or a waitlist of 200+ people with documented demand signals. The key is provenance - founder-reported metrics without any source are treated as unverified.' },
            },
            { '@type': 'Question', name: 'What is the difference between MRR and ARR?',
              acceptedAnswer: { '@type': 'Answer', text: 'MRR (Monthly Recurring Revenue) is the predictable revenue you receive every month from subscriptions or recurring contracts. ARR (Annual Recurring Revenue) is MRR × 12. For early-stage reporting, use MRR - it reflects your current momentum. ARR is meaningful when you have consistent monthly contracts, not one-off or irregular payments.' },
            },
          ]},
        ],
      }} />
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        Every metric needs a period and evidence source. This prevents Pitchmic from treating
        unsupported claims as facts. The better the evidence, the higher the confidence in your fundability score.
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Traction Metrics</CardTitle>
            {!adding && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add metric
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {adding && (
            <MetricForm
              initial={{ ...BLANK }}
              onSave={(d) => addMutation.mutate(d)}
              onCancel={() => setAdding(false)}
              isPending={addMutation.isPending}
              saveLabel="Save metric"
            />
          )}

          {metrics.length === 0 && !adding ? (
            <div className="text-center py-8 text-slate-500">
              <p className="text-sm">No traction metrics yet.</p>
              <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add your first metric
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {metrics.map((m) =>
                editingId === m.id ? (
                  <div key={m.id} className="py-3">
                    <MetricForm
                      initial={m}
                      onSave={(d) => updateMutation.mutate({ id: m.id, data: d })}
                      onCancel={() => setEditingId(null)}
                      isPending={updateMutation.isPending}
                      saveLabel="Update metric"
                    />
                  </div>
                ) : (
                  <MetricRow
                    key={m.id}
                    m={m}
                    onEdit={() => { setEditingId(m.id); setAdding(false); }}
                    onDelete={() => deleteMutation.mutate(m.id)}
                  />
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
