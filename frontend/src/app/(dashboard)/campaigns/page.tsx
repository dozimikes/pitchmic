'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone, Play, Pause, BarChart2, Users, Plus, RefreshCw,
  CheckCircle2, Clock, Send, MessageSquare, Calendar, Target,
  ChevronRight, Trash2, Settings, Zap,
} from 'lucide-react';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

//  Types 

interface Campaign {
  id: number;
  startup_name?: string;
  name: string;
  description?: string;
  target_industries: string[];
  target_stages: string[];
  min_ticket_size?: string;
  max_ticket_size?: string;
  min_compatibility_score: number;
  subject_template: string;
  body_template: string;
  max_outreach_per_day: number;
  pause_on_interest: boolean;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  total_reached: number;
  positive_responses: number;
  meetings_scheduled: number;
  response_rate: number;
  messages_count: number;
  created_at: string;
  updated_at: string;
}

interface CampaignAnalytics {
  campaign_id: number;
  name: string;
  status: string;
  total_reached: number;
  positive_responses: number;
  meetings_scheduled: number;
  response_rate: number;
  status_breakdown: Record<string, number>;
  total_messages: number;
}

//  Helpers 

function statusVariant(s: string): 'success' | 'warning' | 'secondary' | 'destructive' {
  if (s === 'active') return 'success';
  if (s === 'paused') return 'warning';
  if (s === 'draft') return 'secondary';
  if (s === 'completed') return 'success';
  return 'secondary';
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'active') return <Play className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'paused') return <Pause className="w-3.5 h-3.5 text-amber-500" />;
  if (status === 'completed') return <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />;
  return <Clock className="w-3.5 h-3.5 text-slate-400" />;
}

//  Campaign Card 

function CampaignCard({
  campaign,
  onActivate,
  onPause,
  onSelect,
}: {
  campaign: Campaign;
  onActivate: (id: number) => void;
  onPause: (id: number) => void;
  onSelect: (id: number) => void;
}) {
  return (
    <Card className="border-slate-200 hover:border-indigo-200 transition-colors">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusIcon status={campaign.status} />
              <span className="font-bold text-slate-900 text-sm truncate">{campaign.name}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {campaign.target_industries.join(', ') || 'All industries'} ·
              Max {campaign.max_outreach_per_day}/day
            </div>
          </div>
          <Badge variant={statusVariant(campaign.status)}>
            {campaign.status}
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-slate-50 rounded-lg">
            <div className="text-lg font-black text-slate-800">{campaign.total_reached}</div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Reached</div>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg">
            <div className="text-lg font-black text-emerald-600">
              {(campaign.response_rate * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Response</div>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg">
            <div className="text-lg font-black text-indigo-600">{campaign.meetings_scheduled}</div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Meetings</div>
          </div>
        </div>

        {/* Match threshold */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Target className="w-3.5 h-3.5" />
          Min match score: <strong>{Math.round(campaign.min_compatibility_score * 100)}%</strong>
          <span className="mx-1">·</span>
          <MessageSquare className="w-3.5 h-3.5" />
          {campaign.messages_count} messages queued
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          {campaign.status === 'draft' || campaign.status === 'paused' ? (
            <Button
              size="sm"
              className="bg-emerald-600 text-white text-xs flex-1"
              onClick={() => onActivate(campaign.id)}
            >
              <Play className="w-3.5 h-3.5 mr-1" />
              {campaign.status === 'paused' ? 'Resume' : 'Activate'}
            </Button>
          ) : campaign.status === 'active' ? (
            <Button
              size="sm"
              variant="outline"
              className="text-amber-600 border-amber-200 text-xs flex-1"
              onClick={() => onPause(campaign.id)}
            >
              <Pause className="w-3.5 h-3.5 mr-1" /> Pause
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => onSelect(campaign.id)}
          >
            <BarChart2 className="w-3.5 h-3.5 mr-1" /> Analytics
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

//  Analytics Drawer 

function AnalyticsDrawer({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<CampaignAnalytics>({
    queryKey: ['campaign-analytics', campaignId],
    queryFn: () =>
      apiGet<CampaignAnalytics>(`/marketing/campaigns/${campaignId}/analytics/`),
  });

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
      <div className="flex items-center justify-between p-5 border-b border-slate-200">
        <h3 className="font-bold text-slate-900">Campaign Analytics</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-lg bg-slate-100" />)}
          </div>
        ) : data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Reached', value: data.total_reached, icon: Send },
                { label: 'Response Rate', value: `${(data.response_rate * 100).toFixed(1)}%`, icon: MessageSquare },
                { label: 'Meetings', value: data.meetings_scheduled, icon: Calendar },
                { label: 'Total Messages', value: data.total_messages, icon: Users },
              ].map((s) => (
                <div key={s.label} className="p-3 bg-slate-50 rounded-xl">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold mb-1 flex items-center gap-1">
                    <s.icon className="w-3 h-3" /> {s.label}
                  </div>
                  <div className="text-xl font-black text-slate-900">{s.value}</div>
                </div>
              ))}
            </div>

            <div>
              <div className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wide">
                Message Status Breakdown
              </div>
              <div className="space-y-2">
                {Object.entries(data.status_breakdown).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 w-28 capitalize">{status.replace('_', ' ')}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-2 rounded-full bg-indigo-500"
                        style={{
                          width: `${data.total_messages ? (count / data.total_messages) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-600 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

//  Create Campaign Form 

function CreateCampaignForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = React.useState('');
  const [industries, setIndustries] = React.useState('');
  const [stages, setStages] = React.useState('seed,series_a');
  const [minScore, setMinScore] = React.useState('0.5');
  const [maxPerDay, setMaxPerDay] = React.useState('10');

  const mutation = useMutation({
    mutationFn: (data: object) => apiPost('/marketing/campaigns/', data),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name,
      target_industries: industries.split(',').map((s) => s.trim()).filter(Boolean),
      target_stages: stages.split(',').map((s) => s.trim()).filter(Boolean),
      min_compatibility_score: parseFloat(minScore),
      max_outreach_per_day: parseInt(maxPerDay, 10),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs">
      <div>
        <label className="font-semibold block mb-1 text-slate-700">Campaign Name *</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seed Round Outreach Q3"
          required
          className="text-xs"
        />
      </div>
      <div>
        <label className="font-semibold block mb-1 text-slate-700">Target Industries (comma-separated)</label>
        <Input
          value={industries}
          onChange={(e) => setIndustries(e.target.value)}
          placeholder="fintech, saas, healthcare"
          className="text-xs"
        />
      </div>
      <div>
        <label className="font-semibold block mb-1 text-slate-700">Target Stages</label>
        <Input
          value={stages}
          onChange={(e) => setStages(e.target.value)}
          placeholder="seed, series_a"
          className="text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-semibold block mb-1 text-slate-700">Min Match Score</label>
          <select
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
          >
            <option value="0.3">30% (Broad)</option>
            <option value="0.5">50% (Moderate)</option>
            <option value="0.65">65% (Targeted)</option>
            <option value="0.8">80% (Precise)</option>
          </select>
        </div>
        <div>
          <label className="font-semibold block mb-1 text-slate-700">Max / Day</label>
          <Input
            type="number"
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(e.target.value)}
            min={1}
            max={50}
            className="text-xs"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={mutation.isPending || !name}
        className="w-full bg-indigo-600 text-white text-xs"
      >
        {mutation.isPending ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
        ) : (
          <Plus className="w-3.5 h-3.5 mr-1.5" />
        )}
        Create Campaign
      </Button>
    </form>
  );
}

//  Main Page 

export default function CampaignsPage() {
  const { isStartup } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = React.useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<number | null>(null);

  const { data: campaigns, isLoading, refetch } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: () =>
      apiGet<{ results?: Campaign[] } | Campaign[]>('/marketing/campaigns/')
        .then((r) => (Array.isArray(r) ? r : r.results ?? [])),
    enabled: isStartup,
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/marketing/campaigns/${id}/activate/`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/marketing/campaigns/${id}/pause/`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  if (!isStartup) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Megaphone className="w-12 h-12 mb-4" />
        <p className="text-sm font-medium">Outreach campaigns are available for startup accounts.</p>
      </div>
    );
  }

  const activeCampaigns = campaigns?.filter((c) => c.status === 'active') ?? [];
  const totalReached = campaigns?.reduce((s, c) => s + c.total_reached, 0) ?? 0;
  const totalMeetings = campaigns?.reduce((s, c) => s + c.meetings_scheduled, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Outreach Campaigns
            </h1>
            <Badge variant="secondary">AI-Powered</Badge>
          </div>
          <p className="text-sm text-slate-600">
            Automated investor outreach using AI-ranked match scores.
            Campaigns respect daily limits and pause on investor interest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 text-white"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Campaign
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Campaigns', value: campaigns?.length ?? 0, icon: Megaphone },
          { label: 'Active', value: activeCampaigns.length, icon: Play, accent: 'text-emerald-500' },
          { label: 'Investors Reached', value: totalReached, icon: Users, accent: 'text-indigo-500' },
          { label: 'Meetings Booked', value: totalMeetings, icon: Calendar, accent: 'text-amber-500' },
        ].map((s) => (
          <Card key={s.label} className="border-slate-200">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 ${s.accent ?? 'text-slate-400'}`} />
              <div>
                <div className="text-xl font-black text-slate-900">{s.value}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create form (collapsible) */}
      {showCreate && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-500" />
              Create New Campaign
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CreateCampaignForm
              onSuccess={() => {
                setShowCreate(false);
                queryClient.invalidateQueries({ queryKey: ['campaigns'] });
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Campaign grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : campaigns?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onActivate={(id) => activateMutation.mutate(id)}
              onPause={(id) => pauseMutation.mutate(id)}
              onSelect={(id) => setSelectedCampaignId(id)}
            />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200">
          <Megaphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700 mb-1">No campaigns yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            Create your first AI-powered outreach campaign. The engine will automatically
            select the best-matching investors based on your compatibility scores.
          </p>
          <Button
            size="sm"
            className="bg-indigo-600 text-white"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create First Campaign
          </Button>
        </Card>
      )}

      {/* Analytics drawer */}
      {selectedCampaignId && (
        <AnalyticsDrawer
          campaignId={selectedCampaignId}
          onClose={() => setSelectedCampaignId(null)}
        />
      )}
    </div>
  );
}
