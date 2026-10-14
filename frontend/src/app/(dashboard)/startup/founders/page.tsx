'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { RefreshCw, Plus, Trash2, Star, Save, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { fundabilityApi, type FounderProfile } from '@/lib/fundabilityApi';
import { cn } from '@/lib/utils';
import { JsonLd } from '@/components/seo/JsonLd';

const ROLES = [
  { value: 'ceo', label: 'CEO / Co-Founder' },
  { value: 'cto', label: 'CTO / Technical Co-Founder' },
  { value: 'coo', label: 'COO / Operations' },
  { value: 'cpo', label: 'CPO / Product' },
  { value: 'cfo', label: 'CFO / Finance' },
  { value: 'cmo', label: 'CMO / Marketing' },
  { value: 'other', label: 'Other' },
];

const COMMITMENTS = [
  { value: 'full_time', label: 'Full-Time' },
  { value: 'part_time', label: 'Part-Time' },
  { value: 'advisory', label: 'Advisory / Fractional' },
];

function CapabilitySlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const color = value >= 8 ? 'text-emerald-600' : value >= 5 ? 'text-amber-600' : 'text-rose-600';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <Label className="text-slate-600">{label}</Label>
        <span className={cn('font-bold tabular-nums', color)}>{value}/10</span>
      </div>
      <input
        type="range" min={1} max={10} step={1} value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-slate-800"
      />
    </div>
  );
}

function FounderCard({ founder, onSave, onDelete }: {
  founder: Partial<FounderProfile> & { _new?: boolean };
  onSave: (f: Partial<FounderProfile>) => void;
  onDelete: (id?: string) => void;
}) {
  const [form, setForm] = React.useState<Partial<FounderProfile>>(founder);
  const [expanded, setExpanded] = React.useState(!founder.id);
  const [saved, setSaved] = React.useState(false);

  const set = (k: keyof FounderProfile, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setExpanded(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {form.is_primary && <Star className="h-4 w-4 text-amber-500 fill-amber-400" />}
            <div>
              <p className="font-semibold text-slate-800">{form.full_name || 'New Founder'}</p>
              <p className="text-xs text-slate-500 capitalize">{ROLES.find(r => r.value === form.role)?.label ?? 'Role not set'} · {COMMITMENTS.find(c => c.value === form.commitment)?.label ?? ''}</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
              onClick={() => onDelete(form.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={form.full_name ?? ''} onChange={(e) => set('full_name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>LinkedIn URL</Label>
              <Input value={form.linkedin_url ?? ''} placeholder="https://linkedin.com/in/…" onChange={(e) => set('linkedin_url', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.role ?? 'ceo'} onChange={(e) => set('role', e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Commitment</Label>
              <select className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                value={form.commitment ?? 'full_time'} onChange={(e) => set('commitment', e.target.value)}>
                {COMMITMENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id={`primary-${form.id ?? 'new'}`} checked={form.is_primary ?? false}
              onChange={(e) => set('is_primary', e.target.checked)}
              className="rounded border-slate-300" />
            <Label htmlFor={`primary-${form.id ?? 'new'}`} className="text-sm cursor-pointer">Primary / lead founder</Label>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Education</Label>
              <Textarea value={form.education_summary ?? ''} rows={2} placeholder="Degrees, institutions, relevant academic background"
                onChange={(e) => set('education_summary', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Previous companies / roles</Label>
              <Textarea value={form.previous_companies ?? ''} rows={2} placeholder="Previous startups or companies. Include exits if any."
                onChange={(e) => set('previous_companies', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Previous exits</Label>
                <Input type="number" min={0} value={form.previous_exits ?? 0}
                  onChange={(e) => set('previous_exits', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Years industry experience</Label>
                <Input type="number" min={0} value={form.years_industry_experience ?? 0}
                  onChange={(e) => set('years_industry_experience', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Self-assessed capabilities</p>
            <CapabilitySlider label="Technical capability" value={form.technical_capability ?? 5}
              onChange={(v) => set('technical_capability', v)} />
            <CapabilitySlider label="Commercial / sales capability" value={form.commercial_capability ?? 5}
              onChange={(v) => set('commercial_capability', v)} />
            <CapabilitySlider label="Domain expertise" value={form.domain_expertise ?? 5}
              onChange={(v) => set('domain_expertise', v)} />
          </div>

          <div className="space-y-1.5">
            <Label>Founder-market fit</Label>
            <Textarea value={form.founder_market_fit_description ?? ''} rows={3}
              placeholder="Why are you uniquely positioned to solve this problem? Personal experience, industry relationships, proprietary insight."
              onChange={(e) => set('founder_market_fit_description', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Responsibilities</Label>
            <Textarea value={form.responsibilities ?? ''} rows={2}
              placeholder="What does this founder own in the company right now?"
              onChange={(e) => set('responsibilities', e.target.value)} />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave}><Save className="h-4 w-4 mr-2" />Save founder</Button>
            {saved && <span className="flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />Saved</span>}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function FoundersPage() {
  React.useEffect(() => {
    document.title = 'Founders & Team | Pitchmic';
  }, []);

  const qc = useQueryClient();
  const [drafts, setDrafts] = React.useState<Array<Partial<FounderProfile> & { _key: string }>>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['founders'],
    queryFn: fundabilityApi.getFounders,
  });

  const founders = React.useMemo(() => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray((data as any).results)) return (data as any).results;
    return [] as FounderProfile[];
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (f: Partial<FounderProfile>) =>
      f.id ? fundabilityApi.updateFounder(f.id, f) : fundabilityApi.createFounder(f),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['founders'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fundabilityApi.deleteFounder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['founders'] }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-24"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <JsonLd id="founders-schema" data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'BreadcrumbList', itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
            { '@type': 'ListItem', position: 2, name: 'Startup', item: '/startup' },
            { '@type': 'ListItem', position: 3, name: 'Founders & Team', item: '/startup/founders' },
          ]},
          { '@type': 'FAQPage', mainEntity: [
            { '@type': 'Question', name: 'What do investors look for in a founding team?',
              acceptedAnswer: { '@type': 'Answer', text: 'Investors evaluate founding teams on five dimensions: (1) domain expertise - does the founder deeply understand the problem from personal experience? (2) technical capability - can the team build the product without outsourcing core engineering? (3) commercial capability - can they sell, hire, and manage? (4) founder-market fit - is there a non-obvious reason this team will win this specific market? (5) previous exits or startup experience - have they been here before? At pre-seed, the team is often 80% of the investment decision.' },
            },
            { '@type': 'Question', name: 'Should I list advisors on my pitch?',
              acceptedAnswer: { '@type': 'Answer', text: 'Only list advisors with genuine engagement - a monthly call or active introductions. An advisor wall of logos with no real involvement is a red flag sophisticated investors recognise immediately.' },
            },
          ]},
        ],
      }} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Tell the real story of the people building this company: who is here, what they bring, and why they are the right team for this problem.
          </p>
        </div>
        <Button size="sm" onClick={() => setDrafts((d) => [...d, { _key: Date.now().toString(), role: 'ceo', commitment: 'full_time', technical_capability: 5, commercial_capability: 5, domain_expertise: 5 }])}>
          <Plus className="h-4 w-4 mr-1.5" /> Add founder
        </Button>
      </div>

      {[...drafts, ...founders].map((f) => (
        <FounderCard
          key={'_key' in f ? (f as any)._key : f.id}
          founder={f}
          onSave={(updated) => {
            saveMutation.mutate(updated);
            setDrafts((d) => d.filter((dr) => (dr as any)._key !== (f as any)._key));
          }}
          onDelete={(id) => {
            if (id) deleteMutation.mutate(id);
            else setDrafts((d) => d.filter((dr) => (dr as any)._key !== (f as any)._key));
          }}
        />
      ))}

      {founders.length === 0 && drafts.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm">No founders added yet.</p>
          <Button size="sm" className="mt-3" onClick={() => setDrafts([{ _key: '0', role: 'ceo', commitment: 'full_time', technical_capability: 5, commercial_capability: 5, domain_expertise: 5 }])}>
            <Plus className="h-4 w-4 mr-1.5" /> Add your first founder
          </Button>
        </div>
      )}
    </div>
  );
}
