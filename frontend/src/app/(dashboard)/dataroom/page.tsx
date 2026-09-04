'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderLock, Upload, Users, ShieldCheck, Clock, Eye,
  Plus, Trash2, RefreshCw, CheckCircle2, Lock, Unlock,
  FileText, DollarSign, Gavel, Code2, Search, Briefcase, Package,
} from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

//  Types 

interface DataRoomDocument {
  id: number;
  startup_name?: string;
  name: string;
  description?: string;
  file_url: string;
  file_type?: string;
  file_size_bytes?: number;
  category: string;
  is_active: boolean;
  version: string;
  created_at: string;
}

interface DataRoomAccess {
  id: number;
  startup_name?: string;
  investor_name?: string;
  status: 'pending_nda' | 'active' | 'expired' | 'revoked';
  is_active: boolean;
  access_expires_at?: string;
  can_view_financials: boolean;
  can_view_legal: boolean;
  can_view_technical: boolean;
  nda_required: boolean;
  nda_signed_at?: string;
  view_log?: { category: string; viewed_at: string; duration_seconds?: number }[];
  granted_at: string;
  watermark_text?: string;
}

//  Helpers 

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pitch_deck: FileText,
  financials: DollarSign,
  legal: Gavel,
  technical: Code2,
  market_research: Search,
  team: Users,
  product: Package,
  other: Briefcase,
};

const CATEGORY_LABELS: Record<string, string> = {
  pitch_deck: 'Pitch Deck',
  financials: 'Financials',
  legal: 'Legal / Cap Table',
  technical: 'Technical Arch',
  market_research: 'Market Research',
  team: 'Team / CVs',
  product: 'Product / Roadmap',
  other: 'Other',
};

function fmtSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function statusVariant(s: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (s === 'active') return 'success';
  if (s === 'pending_nda') return 'warning';
  if (s === 'revoked' || s === 'expired') return 'destructive';
  return 'secondary';
}

//  Document Card 

function DocCard({ doc, onDelete }: { doc: DataRoomDocument; onDelete: (id: number) => void }) {
  const Icon = CATEGORY_ICONS[doc.category] ?? Briefcase;
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-slate-800 truncate">{doc.name}</div>
        <div className="text-[10px] text-slate-500">
          {CATEGORY_LABELS[doc.category] ?? doc.category}
          {doc.file_size_bytes ? ` · ${fmtSize(doc.file_size_bytes)}` : ''}
          {' · v'}{doc.version}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={doc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-indigo-600"
        >
          <Eye className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={() => onDelete(doc.id)}
          className="p-1.5 rounded-md hover:bg-rose-100 text-slate-400 hover:text-rose-600"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

//  Access Row 

function AccessRow({ access, onRevoke, onSignNDA }: {
  access: DataRoomAccess;
  onRevoke: (id: number) => void;
  onSignNDA: (id: number) => void;
}) {
  return (
    <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-800">{access.investor_name ?? 'Investor'}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Granted {new Date(access.granted_at).toLocaleDateString()}
            {access.access_expires_at && (
              <span className="ml-2 flex items-center gap-0.5 inline-flex">
                <Clock className="w-3 h-3" />
                Expires {new Date(access.access_expires_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <Badge variant={statusVariant(access.status)}>
          {access.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Section permissions */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: 'Financials', allowed: access.can_view_financials },
          { label: 'Legal', allowed: access.can_view_legal },
          { label: 'Technical', allowed: access.can_view_technical },
        ].map((p) => (
          <span
            key={p.label}
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
              p.allowed
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            {p.allowed ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
            {p.label}
          </span>
        ))}
        {access.nda_signed_at && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-700 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" /> NDA Signed
          </span>
        )}
      </div>

      {/* View log count */}
      {Array.isArray(access.view_log) && access.view_log.length > 0 && (
        <div className="text-[10px] text-slate-400 flex items-center gap-1">
          <Eye className="w-3 h-3" />
          {access.view_log.length} document view{access.view_log.length !== 1 ? 's' : ''} recorded
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {access.status === 'pending_nda' && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs text-indigo-600 border-indigo-200"
            onClick={() => onSignNDA(access.id)}
          >
            <ShieldCheck className="w-3 h-3 mr-1" /> Sign NDA
          </Button>
        )}
        {access.status === 'active' && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs text-rose-600 border-rose-200"
            onClick={() => onRevoke(access.id)}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Revoke
          </Button>
        )}
      </div>
    </div>
  );
}

//  Main Page 

export default function DataRoomPage() {
  const { isStartup, isInvestor } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = React.useState<'documents' | 'access'>('documents');

  // Upload form state
  const [uploadName, setUploadName] = React.useState('');
  const [uploadUrl, setUploadUrl] = React.useState('');
  const [uploadCategory, setUploadCategory] = React.useState('pitch_deck');
  const [uploadDesc, setUploadDesc] = React.useState('');

  function ensureArray<T>(val: unknown): T[] {
    if (Array.isArray(val)) return val as T[];
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      if (Array.isArray(obj.results)) return obj.results as T[];
      if (Array.isArray(obj.data)) return obj.data as T[];
    }
    return [];
  }

  //  Queries 
  const { data: docsRaw, isLoading: docsLoading, refetch: refetchDocs } = useQuery({
    queryKey: ['dataroom-documents'],
    queryFn: () =>
      apiGet<{ results?: DataRoomDocument[] } | DataRoomDocument[]>('/dataroom/documents/'),
  });
  const docs = ensureArray<DataRoomDocument>(docsRaw);

  const { data: accessesRaw, isLoading: accessLoading, refetch: refetchAccess } = useQuery({
    queryKey: ['dataroom-access'],
    queryFn: () =>
      apiGet<{ results?: DataRoomAccess[] } | DataRoomAccess[]>(
        isStartup ? '/dataroom/access/' : '/dataroom/my-access/'
      ),
  });
  const accesses = ensureArray<DataRoomAccess>(accessesRaw);

  //  Mutations 
  const addDocMutation = useMutation({
    mutationFn: (data: object) => apiPost('/dataroom/documents/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataroom-documents'] });
      setUploadName(''); setUploadUrl(''); setUploadDesc('');
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/dataroom/documents/${id}/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dataroom-documents'] }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/dataroom/access/${id}/revoke/`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dataroom-access'] }),
  });

  const signNDAMutation = useMutation({
    mutationFn: (id: number) =>
      apiPost(`/dataroom/access/${id}/sign-nda/`, { nda_version: 'v1.0', agreed: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dataroom-access'] }),
  });

  const handleAddDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadName || !uploadUrl) return;
    addDocMutation.mutate({
      name: uploadName,
      file_url: uploadUrl,
      category: uploadCategory,
      description: uploadDesc,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Smart Data Room
          </h1>
          <Badge variant="secondary">Secure</Badge>
        </div>
        <p className="text-sm text-slate-600">
          Granular document access control, time-limited windows, NDA tracking, and view analytics.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        {(['documents', 'access'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab === 'documents' ? <FolderLock className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            {tab === 'documents' ? 'Documents' : isStartup ? 'Access Grants' : 'My Access'}
          </button>
        ))}
      </div>

      {/* DOCUMENTS TAB */}
      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Document list */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700">
                {docs?.length ?? 0} Document{docs?.length !== 1 ? 's' : ''}
              </h2>
              <Button size="sm" variant="outline" onClick={() => refetchDocs()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
            </div>

            {docsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : docs?.length ? (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <DocCard
                    key={doc.id}
                    doc={doc}
                    onDelete={(id) => deleteDocMutation.mutate(id)}
                  />
                ))}
              </div>
            ) : (
              <div className="p-10 text-center text-slate-400 text-xs border-dashed border-2 rounded-xl">
                No documents in data room yet.
                {isStartup && ' Add your first document using the form.'}
              </div>
            )}
          </div>

          {/* Upload form (startup only) */}
          {isStartup && (
            <Card className="border-slate-200 h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-500" />
                  Add Document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddDoc} className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold block mb-1 text-slate-700">Name *</label>
                    <Input
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      placeholder="Q3 2026 Financials"
                      required
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1 text-slate-700">File URL *</label>
                    <Input
                      value={uploadUrl}
                      onChange={(e) => setUploadUrl(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      required
                      type="url"
                      className="text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1 text-slate-700">Category</label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold block mb-1 text-slate-700">Description</label>
                    <Input
                      value={uploadDesc}
                      onChange={(e) => setUploadDesc(e.target.value)}
                      placeholder="Brief description..."
                      className="text-xs"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={addDocMutation.isPending || !uploadName || !uploadUrl}
                    className="w-full bg-indigo-600 text-white text-xs"
                  >
                    {addDocMutation.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Add to Data Room
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ACCESS TAB */}
      {activeTab === 'access' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">
              {accesses?.length ?? 0} Access Grant{accesses?.length !== 1 ? 's' : ''}
            </h2>
            <Button size="sm" variant="outline" onClick={() => refetchAccess()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
            </Button>
          </div>

          {accessLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-slate-100 animate-pulse" />)}
            </div>
          ) : accesses?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accesses.map((access) => (
                <AccessRow
                  key={access.id}
                  access={access}
                  onRevoke={(id) => revokeMutation.mutate(id)}
                  onSignNDA={(id) => signNDAMutation.mutate(id)}
                />
              ))}
            </div>
          ) : (
            <div className="p-10 text-center text-slate-400 text-xs border-dashed border-2 rounded-xl">
              {isStartup
                ? 'No access grants yet. Grant investor access from the offers workflow.'
                : 'No data rooms are currently shared with you.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
