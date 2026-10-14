'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { CheckCircle2, RefreshCw, Plus, AlertCircle } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { JsonLd } from '@/components/seo/JsonLd';

interface FinancialSnapshot {
  id?: string;
  period_label: string;
  revenue_usd: string;
  gross_margin_pct: number;
  net_burn_monthly_usd: string;
  cash_balance_usd: string;
  runway_months: number;
  customers_count: number;
  cac_usd: string | null;
  ltv_usd: string | null;
  churn_rate_pct: number;
  retention_rate_pct: number;
}

const EMPTY: FinancialSnapshot = {
  period_label: '',
  revenue_usd: '0',
  gross_margin_pct: 0,
  net_burn_monthly_usd: '0',
  cash_balance_usd: '0',
  runway_months: 12,
  customers_count: 0,
  cac_usd: null,
  ltv_usd: null,
  churn_rate_pct: 0,
  retention_rate_pct: 95,
};

const FIELDS: { key: keyof FinancialSnapshot; label: string }[] = [
  { key: 'revenue_usd',           label: 'Revenue (USD)'       },
  { key: 'gross_margin_pct',      label: 'Gross margin (%)'    },
  { key: 'net_burn_monthly_usd',  label: 'Monthly burn (USD)'  },
  { key: 'cash_balance_usd',      label: 'Cash balance (USD)'  },
  { key: 'runway_months',         label: 'Runway (months)'     },
  { key: 'customers_count',       label: 'Paying customers'    },
  { key: 'cac_usd',               label: 'CAC (USD)'           },
  { key: 'ltv_usd',               label: 'LTV (USD)'           },
  { key: 'churn_rate_pct',        label: 'Churn rate (%)'      },
  { key: 'retention_rate_pct',    label: 'Retention rate (%)'  },
];

export default function FinancialsPage() {
  React.useEffect(() => {
    document.title = 'Financials & Unit Economics | Pitchmic';
  }, []);

  const qc = useQueryClient();
  // Always start from a blank form - never pre-fill from existing data
  const [form, setForm] = React.useState<FinancialSnapshot>(EMPTY);
  const [saved, setSaved] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['financials'],
    queryFn: () => apiGet<{ results: FinancialSnapshot[] }>('/startups/financials/'),
  });

  const existingPeriods = React.useMemo(
    () => new Set((data?.results ?? []).map((s) => s.period_label.trim().toLowerCase())),
    [data],
  );

  const isDuplicate =
    form.period_label.trim() !== '' &&
    existingPeriods.has(form.period_label.trim().toLowerCase());

  const mutation = useMutation({
    mutationFn: (d: FinancialSnapshot) => apiPost('/startups/financials/', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financials'] });
      setForm(EMPTY);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const set = (k: keyof FinancialSnapshot, v: string | number | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <JsonLd id="financials-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup', item: '/startup' },
            { '@type': 'ListItem', position: 3, name: 'Financials', item: '/startup/financials' },
          ]},
          { '@type': 'FAQPage', mainEntity: [
            { '@type': 'Question', name: 'How much runway should a startup have before fundraising?',
              acceptedAnswer: { '@type': 'Answer', text: 'Start fundraising with at least 6 months of runway remaining - ideally 9–12 months. With less than 6 months, you are fundraising from a position of desperation, which investors detect and use to negotiate worse terms. Most successful pre-seed rounds in Africa take 3–6 months to close from first meeting to wire.' },
            },
            { '@type': 'Question', name: 'What burn rate is acceptable for a pre-seed African startup?',
              acceptedAnswer: { '@type': 'Answer', text: 'Pre-seed African startups typically burn $3,000–$15,000/month. Above $20,000/month at pre-seed without clear revenue is a red flag - it signals premature scaling. The key question investors ask is: what milestones will this burn rate unlock, and what will you be able to raise next after hitting them?' },
            },
          ]},
        ],
      }} />
      <p className="text-sm text-slate-500">
        Financial snapshots are period-specific records. Each save creates a new entry; it does not overwrite previous periods.
      </p>

      <Card>
        <CardHeader><CardTitle className="text-base">New snapshot</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Period - top-level, required */}
          <div className="space-y-1.5">
            <Label>
              Period <span className="text-rose-500">*</span>
            </Label>
            <Input
              value={form.period_label}
              placeholder="e.g. Q3 2026, September 2026"
              onChange={(e) => set('period_label', e.target.value)}
              className={isDuplicate ? 'border-rose-400 focus-visible:ring-rose-400' : ''}
            />
            {isDuplicate && (
              <div className="flex items-center gap-1.5 text-xs text-rose-600">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                A snapshot for &quot;{form.period_label.trim()}&quot; already exists. Use a different period label to add a new entry.
              </div>
            )}
          </div>

          {/* Numeric fields */}
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input
                  type="number"
                  value={((form as unknown as Record<string, unknown>)[key] as string | number | undefined) ?? ''}
                  onChange={(e) => set(key, e.target.value === '' ? null : e.target.value)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || !form.period_label.trim() || isDuplicate}
        >
          {mutation.isPending
            ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving…</>
            : <><Plus className="h-4 w-4 mr-2" />Add snapshot</>}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />Saved
          </span>
        )}
      </div>

      {/* Past snapshots */}
      {data?.results && data.results.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Past snapshots</p>
          {data.results.map((snap) => (
            <div key={snap.id ?? snap.period_label} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex justify-between items-center">
                <p className="font-medium">{snap.period_label}</p>
                <p className="text-slate-500">
                  ${parseFloat(snap.revenue_usd || '0').toLocaleString()} revenue
                </p>
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-500">
                <span>Burn: ${parseFloat(snap.net_burn_monthly_usd || '0').toLocaleString()}/mo</span>
                <span>Runway: {snap.runway_months}mo</span>
                <span>Margin: {snap.gross_margin_pct}%</span>
                <span>Customers: {snap.customers_count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
