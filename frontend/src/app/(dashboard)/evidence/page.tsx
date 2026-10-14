'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Trash2, RefreshCw, CheckCircle2, AlertCircle,
  AlertTriangle, Clock, FileText, UploadCloud, Link2, ChevronDown,
  ChevronUp, Filter, Info, ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { cn } from '@/lib/utils';
import {
  fundabilityApi,
  type EvidenceVaultItem,
  type EvidenceVaultSummary,
  type EvidenceStatus,
  DIMENSION_ICON_KEYS,
  type DimensionKey,
} from '@/lib/fundabilityApi';
import {
  Crosshair, Wrench, Globe, Users, TrendingUp,
  BarChart2, ShieldCheck, Rocket, Info as InfoIcon,
} from 'lucide-react';
import { JsonLd } from '@/components/seo/JsonLd';

// Inline dimension icon renderer for the evidence page
const EVIDENCE_DIM_ICONS: Record<string, React.ElementType> = {
  problem:        Crosshair,
  solution:       Wrench,
  market:         Globe,
  team:           Users,
  traction:       TrendingUp,
  business_model: BarChart2,
  defensibility:  ShieldCheck,
  fundraising:    Rocket,
};

function EvidenceDimIcon({ dimKey, className }: { dimKey: string; className?: string }) {
  const Icon = EVIDENCE_DIM_ICONS[dimKey] ?? InfoIcon;
  return <Icon className={cn('h-4 w-4 shrink-0', className)} />;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVIDENCE_TYPES = [
  { value: 'document',          label: 'Document / File'             },
  { value: 'metric',            label: 'Metric / KPI Record'         },
  { value: 'customer_record',   label: 'Customer Record'             },
  { value: 'financial_record',  label: 'Financial Record'            },
  { value: 'analytics',         label: 'Analytics Export'            },
  { value: 'contract',          label: 'Signed Contract / LOI'       },
  { value: 'registration',      label: 'Corporate Registration'      },
  { value: 'ip',                label: 'Intellectual Property'       },
  { value: 'press',             label: 'Press / Media Coverage'      },
  { value: 'partnership',       label: 'Partnership Agreement'       },
  { value: 'founder_assertion', label: 'Founder Assertion'           },
  { value: 'external_source',   label: 'External Source / Report'    },
];

const DIMENSION_TAGS = [
  { value: 'problem',       label: 'Problem Validation'   },
  { value: 'solution',      label: 'Solution / Product'   },
  { value: 'market',        label: 'Market'               },
  { value: 'team',          label: 'Team & Founder'       },
  { value: 'traction',      label: 'Traction'             },
  { value: 'business_model',label: 'Business Model'       },
  { value: 'defensibility', label: 'Defensibility'        },
  { value: 'fundraising',   label: 'Fundraising Readiness'},
  { value: 'financials',    label: 'Financials'           },
  { value: 'general',       label: 'General'              },
];

const STATUS_CONFIG: Record<EvidenceStatus, { label: string; icon: React.ElementType; color: string }> = {
  declared:     { label: 'Declared',     icon: AlertTriangle,  color: 'bg-slate-100 text-slate-600 border-slate-200'     },
  supported:    { label: 'Supported',    icon: Info,           color: 'bg-blue-50 text-blue-700 border-blue-200'         },
  verified:     { label: 'Verified',     icon: CheckCircle2,   color: 'bg-emerald-50 text-emerald-700 border-emerald-200'},
  observed:     { label: 'Observed',     icon: CheckCircle2,   color: 'bg-purple-50 text-purple-700 border-purple-200'   },
  contradicted: { label: 'Contradicted', icon: AlertCircle,    color: 'bg-rose-50 text-rose-700 border-rose-200'         },
  outdated:     { label: 'Outdated',     icon: Clock,          color: 'bg-amber-50 text-amber-700 border-amber-200'      },
  unsupported:  { label: 'Unsupported',  icon: AlertCircle,    color: 'bg-rose-50 text-rose-600 border-rose-200'         },
};

const EMPTY_FORM: Partial<EvidenceVaultItem> = {
  title: '',
  description: '',
  evidence_type: 'document',
  dimension_tag: 'general',
  claim_description: '',
  file_url: '',
  external_url: '',
  status: 'declared',
  source_name: '',
  confidence: 0.7,
};

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------
function SummaryBar({ summary }: { summary: EvidenceVaultSummary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-slate-800 tabular-nums">{summary.total_items}</p>
          <p className="text-xs text-slate-500 mt-1">Total items</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-emerald-600 tabular-nums">{summary.verified_items}</p>
          <p className="text-xs text-slate-500 mt-1">Verified / observed</p>
        </CardContent>
      </Card>
      <Card className="col-span-2">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 font-medium">Evidence completeness</span>
            <span className="font-bold tabular-nums text-slate-800">{summary.completeness_pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                summary.completeness_pct >= 70 ? 'bg-emerald-500' :
                summary.completeness_pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
              )}
              style={{ width: `${summary.completeness_pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">Verified evidence across expected dimensions</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dimension coverage grid
// ---------------------------------------------------------------------------
function DimensionCoverage({ summary }: { summary: EvidenceVaultSummary }) {
  const dims = Object.entries(summary.by_dimension);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-700">Coverage by dimension</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {DIMENSION_TAGS.filter(d => d.value !== 'general').map(({ value, label }) => {
            const dim = summary.by_dimension[value];
            const total = dim?.total ?? 0;
            const verified = dim?.verified ?? 0;
            const hasEvidence = total > 0;
            return (
              <div
                key={value}
                className={cn(
                  'rounded-lg border p-3 text-center space-y-1',
                  hasEvidence ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                )}
              >
                <div className="flex items-center justify-center">
                  <EvidenceDimIcon dimKey={value} className={hasEvidence ? 'text-emerald-600' : 'text-slate-400'} />
                </div>
                <p className="text-xs font-medium text-slate-700 leading-tight">{label}</p>
                <p className="text-xs text-slate-500">
                  {hasEvidence ? `${verified}/${total} verified` : 'No evidence'}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Add evidence form
// ---------------------------------------------------------------------------
function AddEvidenceForm({
  onSave,
  onCancel,
  isPending,
}: {
  onSave: (d: Partial<EvidenceVaultItem>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = React.useState<Partial<EvidenceVaultItem>>(EMPTY_FORM);
  const set = (k: keyof EvidenceVaultItem, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-blue-800">Add evidence item</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Title <span className="text-rose-500">*</span></Label>
            <Input
              value={form.title ?? ''}
              placeholder="e.g. Stripe MRR export - August 2026"
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Evidence type</Label>
            <select
              className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
              value={form.evidence_type ?? 'document'}
              onChange={(e) => set('evidence_type', e.target.value)}
            >
              {EVIDENCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Dimension</Label>
            <select
              className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
              value={form.dimension_tag ?? 'general'}
              onChange={(e) => set('dimension_tag', e.target.value as any)}
            >
              {DIMENSION_TAGS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Claim it supports</Label>
            <Input
              value={form.claim_description ?? ''}
              placeholder="e.g. '$12,400 MRR', '480 monthly active users', 'CAC = $45'"
              onChange={(e) => set('claim_description', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select
              className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
              value={form.status ?? 'declared'}
              onChange={(e) => set('status', e.target.value as EvidenceStatus)}
            >
              {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                <option key={v} value={v}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Source name</Label>
            <Input
              value={form.source_name ?? ''}
              placeholder="e.g. Stripe dashboard, Bank statement"
              onChange={(e) => set('source_name', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>File URL (optional)</Label>
            <Input
              value={form.file_url ?? ''}
              placeholder="https://…"
              onChange={(e) => set('file_url', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>External URL (optional)</Label>
            <Input
              value={form.external_url ?? ''}
              placeholder="https://…"
              onChange={(e) => set('external_url', e.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description ?? ''}
              placeholder="Additional context about this evidence item"
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observed / created date</Label>
            <Input
              type="date"
              value={form.observed_date ?? ''}
              onChange={(e) => set('observed_date', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confidence (0–1)</Label>
            <Input
              type="number" min={0} max={1} step={0.05}
              value={form.confidence ?? 0.7}
              onChange={(e) => set('confidence', parseFloat(e.target.value) || 0.5)}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            onClick={() => { if (form.title) onSave(form); }}
            disabled={isPending || !form.title}
          >
            {isPending
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              : <><CheckCircle2 className="h-4 w-4 mr-2" />Add to vault</>
            }
          </Button>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Evidence item card
// ---------------------------------------------------------------------------
function EvidenceCard({
  item,
  onDelete,
  onStatusChange,
}: {
  item: EvidenceVaultItem;
  onDelete: () => void;
  onStatusChange: (status: EvidenceStatus) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.declared;
  const Icon = cfg.icon;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start gap-3 p-4">
        {/* Status indicator */}
        <div className={cn('flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full border', cfg.color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-snug">{item.title}</p>
              {item.claim_description && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Supports: <span className="font-medium text-slate-700">{item.claim_description}</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Badge variant="outline" className={cn('text-xs', cfg.color)}>
                {cfg.label}
              </Badge>
              <Button
                variant="ghost" size="sm" className="h-7 w-7 p-0"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 w-7 p-0 text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400">
            <span className="flex items-center gap-1 capitalize">
              <EvidenceDimIcon dimKey={item.dimension_tag} className="h-3 w-3" />
              {item.dimension_tag_display}
            </span>
            <span className="capitalize">{item.evidence_type_display}</span>
            {item.source_name && <span>{item.source_name}</span>}
            {item.observed_date && <span>{new Date(item.observed_date).toLocaleDateString('en-GB')}</span>}
            {(item.file_url || item.external_url) && (
              <a
                href={item.file_url || item.external_url}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700"
              >
                <ExternalLink className="h-3 w-3" /> View
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <Separator />
            <div className="p-4 space-y-3">
              {item.description && (
                <p className="text-xs text-slate-600">{item.description}</p>
              )}
              {item.contradicts_claim && (
                <div className="flex items-start gap-1.5 text-xs text-rose-600">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>Contradicts: {item.contradicts_claim}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Label className="text-xs">Update status:</Label>
                <select
                  className="h-7 text-xs rounded border border-slate-200 px-2 bg-white"
                  value={item.status}
                  onChange={(e) => onStatusChange(e.target.value as EvidenceStatus)}
                >
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <option key={v} value={v}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function EvidenceVaultPage() {
  React.useEffect(() => { document.title = 'Evidence Vault | Pitchmic'; }, []);
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [filterDim, setFilterDim] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['evidence', filterDim, filterStatus],
    queryFn: () => fundabilityApi.listEvidence({
      dimension: filterDim || undefined,
      status: filterStatus || undefined,
    }),
  });

  const { data: summary } = useQuery({
    queryKey: ['evidence-summary'],
    queryFn: fundabilityApi.getEvidenceSummary,
  });

  const addMutation = useMutation({
    mutationFn: fundabilityApi.addEvidence,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evidence'] });
      qc.invalidateQueries({ queryKey: ['evidence-summary'] });
      setShowAddForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: fundabilityApi.deleteEvidence,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evidence'] });
      qc.invalidateQueries({ queryKey: ['evidence-summary'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EvidenceVaultItem> }) =>
      fundabilityApi.updateEvidence(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evidence'] }),
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <JsonLd id="evidence-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'What evidence do investors ask for during due diligence?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Investors typically ask for: revenue evidence (Stripe exports, financial statements), customer validation (contracts, LOIs, usage data), team credentials (LinkedIn profiles, previous company references), market evidence (third-party reports, industry data), product proof (demo, GitHub, technical documentation), and legal documents (cap table, incorporation, IP filings). Pitchmic\'s Evidence Vault organises these by dimension and tracks verification status.',
                },
              },
              {
                '@type': 'Question',
                name: 'What is the difference between verified and founder-claimed evidence?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Founder-claimed evidence is self-reported without a third-party source - e.g. "we have 100 customers" with no documentation. Verified evidence has an attached source that can be cross-checked - e.g. a Stripe revenue export, signed customer contract, or analytics dashboard screenshot. Verified evidence significantly increases investor confidence and directly improves your fundability score.',
                },
              },
              {
                '@type': 'Question',
                name: 'How many evidence items do I need for a strong pre-seed pitch?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'For a credible pre-seed pitch, aim for at least one verified evidence item per dimension: problem (customer interview notes or survey data), solution (product demo or technical doc), market (third-party TAM source), team (LinkedIn profiles), traction (any revenue or user data with source), business model (pricing page or contract template), and fundraising (use-of-funds plan). Quality matters more than quantity.',
                },
              },
            ],
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
              { '@type': 'ListItem', position: 2, name: 'Evidence Vault', item: '/evidence' },
            ],
          },
        ],
      }} />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-slate-600" />
            Evidence Vault
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Every important claim should have evidence. The vault tracks what you have, what&apos;s verified, and what&apos;s missing.
          </p>
        </div>
        <Button onClick={() => setShowAddForm(true)} disabled={showAddForm}>
          <Plus className="h-4 w-4 mr-2" /> Add evidence
        </Button>
      </div>

      {/* Summary bar */}
      {summary && <SummaryBar summary={summary} />}

      {/* Dimension coverage */}
      {summary && summary.total_items > 0 && <DimensionCoverage summary={summary} />}

      {/* Status guide */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Evidence status guide</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(Object.entries(STATUS_CONFIG) as [EvidenceStatus, typeof STATUS_CONFIG[EvidenceStatus]][]).map(([k, v]) => {
              const Icon = v.icon;
              return (
                <div key={k} className="flex items-center gap-1.5 text-xs">
                  <span className={cn('flex items-center justify-center h-5 w-5 rounded-full border', v.color)}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="text-slate-600">{v.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <AddEvidenceForm
              onSave={(d) => addMutation.mutate(d)}
              onCancel={() => setShowAddForm(false)}
              isPending={addMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Filter className="h-4 w-4" />
          <span className="text-sm">Filter:</span>
        </div>
        <select
          className="h-8 text-sm rounded-md border border-slate-200 px-2 bg-white"
          value={filterDim}
          onChange={(e) => setFilterDim(e.target.value)}
        >
          <option value="">All dimensions</option>
          {DIMENSION_TAGS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <select
          className="h-8 text-sm rounded-md border border-slate-200 px-2 bg-white"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([v, c]) => (
            <option key={v} value={v}>{c.label}</option>
          ))}
        </select>
        {(filterDim || filterStatus) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => { setFilterDim(''); setFilterStatus(''); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Items list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
            <FileText className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-medium text-slate-700">No evidence items yet</p>
            <p className="text-sm text-slate-500 mt-1">
              {filterDim || filterStatus
                ? 'No items match the current filter.'
                : 'Add your first piece of evidence to start building a verifiable startup profile.'}
            </p>
          </div>
          {!showAddForm && (
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add first item
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{items.length} item{items.length !== 1 ? 's' : ''}</p>
          {items.map((item) => (
            <EvidenceCard
              key={item.id}
              item={item}
              onDelete={() => deleteMutation.mutate(item.id)}
              onStatusChange={(status) =>
                updateMutation.mutate({ id: item.id, data: { status } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
