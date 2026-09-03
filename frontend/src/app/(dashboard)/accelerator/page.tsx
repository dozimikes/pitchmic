'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers,
  Users,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Search,
  Download,
  UploadCloud,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Briefcase,
  Rocket,
  Building2,
  Brain,
  FileText,
  ThumbsUp,
  Play,
  Mic,
  TrendingUp,
  Calendar,
  Plus,
  X,
  Radio,
  MapPin,
  DollarSign,
  Globe,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { UserRole, Pitch, PaginatedResponse } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

const RUBRIC_PILLARS = [
  { name: 'Problem Severity', weight: 15 },
  { name: 'Market Size & Depth', weight: 15 },
  { name: 'Pan-African Defensibility', weight: 15 },
  { name: 'Unit Economics', weight: 15 },
  { name: 'Founding Team DNA', weight: 15 },
  { name: 'Traction Velocity', weight: 10 },
  { name: 'Forensic Audit Integrity', weight: 10 },
  { name: 'Regulatory Moat', weight: 5 },
];

interface CohortItem {
  id: number;
  name: string;
  organization_name: string;
  program_cycle: string;
  target_startups_count: number;
  total_applications: number;
  created_at?: string;
}

interface FundingEventItem {
  id: number;
  title: string;
  event_type: string;
  event_type_display: string;
  cohort_id?: number;
  cohort_name?: string;
  organizer_name: string;
  event_date: string;
  location: string;
  target_commitment_usd: number;
  total_committed_usd: number;
  description: string;
  status: string;
}

function deriveStage(pitch: Pitch): string {
  if (!pitch.is_draft) return 'published';
  return 'review';
}

export default function AcceleratorDashboardPage() {
  const { isSuperUser, isAdmin, isAccelerator, canSwitchRole, setActiveRole } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedCohortId, setSelectedCohortId] = React.useState<number | null>(null);
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [synced, setSynced] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);

  // Modals
  const [isCreateCohortOpen, setIsCreateCohortOpen] = React.useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = React.useState(false);

  // Form states for Cohort
  const [cohortName, setCohortName] = React.useState('');
  const [cohortOrg, setCohortOrg] = React.useState('Antler Hub');
  const [cohortCycle, setCohortCycle] = React.useState('2026-Q2');
  const [cohortSlots, setCohortSlots] = React.useState('50');

  // Form states for Funding Event
  const [eventTitle, setEventTitle] = React.useState('');
  const [eventType, setEventType] = React.useState('demo_day');
  const [eventDate, setEventDate] = React.useState('');
  const [eventLocation, setEventLocation] = React.useState('Virtual (Live Stream)');
  const [eventTargetCommit, setEventTargetCommit] = React.useState('1000000');
  const [eventDesc, setEventDesc] = React.useState('');

  // 1. Live cohorts from Backend
  const { data: cohortsData, refetch: refetchCohorts } = useQuery<{ cohorts: CohortItem[] }>({
    queryKey: ['accelerator_cohorts'],
    queryFn: async () => {
      const res = await api.get('/intelligence/cohorts/');
      return res.data;
    },
  });

  const cohorts = cohortsData?.cohorts ?? [];
  const activeCohort = cohorts.find((c) => c.id === selectedCohortId) || cohorts[0] || {
    id: 1,
    name: 'Antler East Africa — Cohort 12',
    organization_name: 'Antler Hub v2',
    program_cycle: '2026-Q1',
    target_startups_count: 50,
    total_applications: 428,
  };

  // 2. Live funding events from Backend
  const { data: eventsData, refetch: refetchEvents } = useQuery<{ events: FundingEventItem[] }>({
    queryKey: ['funding_events'],
    queryFn: async () => {
      const res = await api.get('/intelligence/funding-events/');
      return res.data;
    },
  });

  const fundingEvents = eventsData?.events ?? [];

  // 3. Live Pitches from DB
  const { data: pitchPage, isLoading, refetch: refetchPitches } = useQuery<PaginatedResponse<Pitch>>({
    queryKey: ['accelerator_pitches'],
    queryFn: async () => {
      const res = await api.get('/pitches/', { params: { page_size: 50 } });
      return res.data;
    },
    refetchInterval: 60000,
  });

  const allPitches: Pitch[] = pitchPage?.results ?? [];
  const publishedPitches = allPitches.filter((p) => !p.is_draft);
  const draftPitches = allPitches.filter((p) => p.is_draft);

  const handleSync = () => {
    setSyncing(true);
    Promise.all([refetchPitches(), refetchCohorts(), refetchEvents()]).finally(() => {
      setSyncing(false);
      setSynced(true);
      setTimeout(() => setSynced(false), 3000);
    });
  };

  // Create Cohort mutation
  const createCohortMutation = useMutation({
    mutationFn: async (payload: { name: string; organization_name: string; program_cycle: string; target_startups_count: number }) => {
      const res = await api.post('/intelligence/cohorts/', payload);
      return res.data;
    },
    onSuccess: (data) => {
      refetchCohorts();
      setIsCreateCohortOpen(false);
      if (data?.cohort?.id) setSelectedCohortId(data.cohort.id);
      setCohortName('');
    },
  });

  // Create Funding Event mutation
  const createEventMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/intelligence/funding-events/', payload);
      return res.data;
    },
    onSuccess: () => {
      refetchEvents();
      setIsCreateEventOpen(false);
      setEventTitle('');
      setEventDesc('');
    },
  });

  const filteredPitches = allPitches.filter((p) => {
    const stage = deriveStage(p);
    const matchesStatus = filterStatus === 'all' || filterStatus === stage;
    const matchesQuery =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.startup_name ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.tags ?? []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-8">
      {/* ── Top Header with 4-Way Role Switcher & Action Buttons ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Accelerator Console
            </h1>
            <Badge className="bg-purple-600 text-white text-xs font-bold gap-1">
              <Layers className="h-3 w-3" />
              <span>Cohort Management</span>
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Automated cohort ingestion &middot; 8-Pillar rubric matrix &middot; Demo Day syndicates &middot; Consensus IC memos
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* 4-Way Role Switcher for Superusers */}
          {canSwitchRole && (
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setActiveRole(UserRole.ADMIN); router.push('/admin'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-all"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Admin</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRole(UserRole.ACCELERATOR)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white shadow-xs"
              >
                <Layers className="h-3.5 w-3.5 text-purple-400" />
                <span>Accelerator</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveRole(UserRole.INVESTOR); router.push('/newsfeed'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-all"
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>Investor</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveRole(UserRole.STARTUP); router.push('/newsfeed'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-all"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>Startup</span>
              </button>
            </div>
          )}

          {/* Quick Action Buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />}
            className="text-xs"
          >
            {synced ? 'Synced!' : syncing ? 'Syncing...' : 'Sync Hub'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreateCohortOpen(true)}
            leftIcon={<Plus className="h-3.5 w-3.5 text-purple-600" />}
            className="text-xs border-purple-200 hover:bg-purple-50 text-purple-700"
          >
            New Cohort
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => setIsCreateEventOpen(true)}
            leftIcon={<Calendar className="h-3.5 w-3.5" />}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs shadow-xs"
          >
            Create Funding Event
          </Button>
        </div>
      </div>

      {/* ── Cohort Selector & Timeline Strip ── */}
      <Card className="border-purple-200/70 bg-gradient-to-r from-purple-50/50 via-white to-indigo-50/40">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-md shadow-purple-600/20 shrink-0">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-700">Active Batch</span>
                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-bold">
                    {activeCohort.organization_name} &middot; {activeCohort.program_cycle}
                  </Badge>
                </div>
                <h2 className="text-lg font-black text-slate-900 mt-0.5">{activeCohort.name}</h2>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {/* Cohort Dropdown Selector */}
              {cohorts.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 hidden sm:inline">Switch Cohort:</span>
                  <select
                    value={activeCohort.id}
                    onChange={(e) => setSelectedCohortId(Number(e.target.value))}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-purple-500 shadow-2xs"
                  >
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.program_cycle})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="h-8 w-px bg-slate-200 hidden sm:block" />

              <div className="text-right">
                <div className="text-xs font-semibold text-slate-500">Target Startups</div>
                <div className="text-2xl font-black text-purple-700">{activeCohort.target_startups_count} Max</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── UPCOMING FUNDING EVENTS & DEMO DAYS ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Demo Days &amp; Syndicate Funding Events
            </h3>
            <Badge variant="outline" className="text-xs font-bold border-purple-200 text-purple-700">
              {fundingEvents.length} Scheduled
            </Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCreateEventOpen(true)}
            className="text-xs gap-1 h-8"
          >
            <Plus className="h-3 w-3" /> Schedule Event
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fundingEvents.map((evt) => (
            <Card key={evt.id} className="border-slate-200 bg-white hover:border-purple-300 transition-all">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{evt.title}</span>
                      <Badge className="bg-purple-100 text-purple-800 text-[10px] font-bold uppercase">
                        {evt.event_type_display}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50">
                        {evt.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{evt.description}</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <Clock className="h-3.5 w-3.5 text-purple-500" />
                      {new Date(evt.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {evt.location}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                    Target: ${evt.target_commitment_usd.toLocaleString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Cohort Funnel KPI Cards — Live from Pitch DB ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-500">Stage 1: All Ingested Pitches</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {isLoading ? <span className="inline-block h-6 w-8 bg-slate-200 animate-pulse rounded" /> : allPitches.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Live from PitchMic DB
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-500">Stage 2: Under Review (Drafts)</div>
            <div className="text-2xl font-black text-indigo-600 mt-1">
              {isLoading ? <span className="inline-block h-6 w-6 bg-slate-200 animate-pulse rounded" /> : draftPitches.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Awaiting AI screening pass
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-slate-500">Stage 3: Published &amp; Pitching</div>
            <div className="text-2xl font-black text-amber-600 mt-1">
              {isLoading ? <span className="inline-block h-6 w-6 bg-slate-200 animate-pulse rounded" /> : publishedPitches.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Visible to investor dealflow
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/40">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-purple-700">Stage 4: With Ask Set (SAFE)</div>
            <div className="text-2xl font-black text-purple-700 mt-1">
              {isLoading ? '...' : allPitches.filter((p) => p.asking_amount && Number(p.asking_amount) > 0).length}
            </div>
            <div className="text-[11px] text-purple-600/80 mt-1">
              Active fundraise round
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 8-Pillar Scoring Rubric Matrix (Configurable Weights) ── */}
      <Card className="border-slate-200 bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                8-Pillar Pan-African Rubric Calibration
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configured weights applied to each batch application during AI screening
              </p>
            </div>
            <Badge variant="outline" className="text-xs text-purple-700 border-purple-200">
              Antler Calibrated
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-2">
            {RUBRIC_PILLARS.map((p) => (
              <div key={p.name} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/80 text-center">
                <div className="text-[11px] font-semibold text-slate-600 truncate" title={p.name}>
                  {p.name}
                </div>
                <div className="text-base font-black text-purple-700 mt-1">{p.weight}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Live Applicant Triage & Diligence Board ── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Status Tabs */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-semibold gap-1 overflow-x-auto max-w-full">
            {[
              { id: 'all', label: `All Pitches (${allPitches.length})` },
              { id: 'published', label: `Published (${publishedPitches.length})` },
              { id: 'review', label: `Drafts (${draftPitches.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg whitespace-nowrap transition-all text-xs',
                  filterStatus === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search startups, keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs w-48 sm:w-60"
              />
            </div>
          </div>
        </div>

        {/* Live Pitch Rows from DB */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-slate-200 bg-white">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-slate-200 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 bg-slate-200 animate-pulse rounded" />
                      <div className="h-3 w-64 bg-slate-100 animate-pulse rounded" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredPitches.length === 0 ? (
            <Card className="border-slate-200 bg-white">
              <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                <div className="h-12 w-12 rounded-2xl bg-purple-100 flex items-center justify-center">
                  <Mic className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">No pitches found</p>
                  <p className="text-xs text-slate-500 mt-1">No pitches match your current filter. Founders can submit pitches from their startup workspace.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredPitches.map((pitch) => {
              const stage = deriveStage(pitch);
              return (
                <Card key={pitch.id} className="border-slate-200 bg-white hover:border-purple-300 transition-all duration-200">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      {/* Left: Info */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-black text-sm">
                          {(pitch.startup_name ?? pitch.title).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-bold text-slate-900">{pitch.title}</h4>
                            {pitch.startup_name && (
                              <Badge variant="outline" className="text-[10px] font-mono text-slate-500 border-slate-200">
                                {pitch.startup_name}
                              </Badge>
                            )}
                            <Badge
                              className={cn(
                                'text-[10px] font-bold capitalize',
                                stage === 'published' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                'bg-blue-100 text-blue-800 border-blue-200'
                              )}
                            >
                              {stage === 'published' ? 'Live / Pitching' : 'Under Review'}
                            </Badge>
                            {pitch.is_featured && (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold">
                                Featured
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {pitch.description
                              ? pitch.description.slice(0, 100) + (pitch.description.length > 100 ? '...' : '')
                              : 'No description provided.'}
                          </p>
                        </div>
                      </div>

                      {/* Right: Metrics & Actions */}
                      <div className="flex items-center justify-between lg:justify-end gap-6 flex-wrap">
                        {pitch.asking_amount && (
                          <div className="text-center">
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Round Size</div>
                            <div className="text-lg font-black text-purple-700">
                              ${Number(pitch.asking_amount).toLocaleString()}
                            </div>
                          </div>
                        )}

                        {pitch.equity_offered && (
                          <div className="text-center hidden sm:block">
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Equity</div>
                            <div className="text-lg font-black text-slate-700">{pitch.equity_offered}%</div>
                          </div>
                        )}

                        <div className="text-center hidden sm:block">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Signals</div>
                          <div className="flex items-center gap-1 mt-0.5 justify-center text-xs font-bold text-slate-600">
                            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                            {pitch.like_count} likes
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Link href={`/pitches/${pitch.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<Play className="h-3 w-3" />}
                              className="text-xs h-8"
                            >
                              View Pitch
                            </Button>
                          </Link>
                          <Link href="/intelligence">
                            <Button
                              variant="default"
                              size="sm"
                              leftIcon={<FileText className="h-3 w-3" />}
                              className="bg-slate-900 hover:bg-slate-800 text-white text-xs h-8"
                            >
                              IC Memo
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* ── MODAL: CREATE COHORT ── */}
      {isCreateCohortOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Create New Cohort</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateCohortOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createCohortMutation.mutate({
                  name: cohortName,
                  organization_name: cohortOrg,
                  program_cycle: cohortCycle,
                  target_startups_count: Number(cohortSlots) || 50,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-slate-700">Cohort Name</label>
                <Input
                  required
                  placeholder="e.g. Antler West Africa — Cohort 1"
                  value={cohortName}
                  onChange={(e) => setCohortName(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Organization / Hub</label>
                  <Input
                    required
                    placeholder="e.g. Antler Hub"
                    value={cohortOrg}
                    onChange={(e) => setCohortOrg(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Program Cycle</label>
                  <Input
                    required
                    placeholder="e.g. 2026-Q3"
                    value={cohortCycle}
                    onChange={(e) => setCohortCycle(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Target Startups Count (Slots)</label>
                <Input
                  type="number"
                  min="5"
                  max="500"
                  required
                  value={cohortSlots}
                  onChange={(e) => setCohortSlots(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateCohortOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={createCohortMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                >
                  {createCohortMutation.isPending ? 'Creating...' : 'Launch Cohort'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE FUNDING EVENT / DEMO DAY ── */}
      {isCreateEventOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Schedule Funding Event / Demo Day</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateEventOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createEventMutation.mutate({
                  title: eventTitle,
                  event_type: eventType,
                  cohort_id: activeCohort.id,
                  event_date: eventDate ? new Date(eventDate).toISOString() : new Date().toISOString(),
                  location: eventLocation,
                  target_commitment_usd: Number(eventTargetCommit) || 1000000,
                  description: eventDesc,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-slate-700">Event Title</label>
                <Input
                  required
                  placeholder="e.g. Pan-African Demo Day 2026 — East Africa Finalists"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Event Type</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="mt-1 w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="demo_day">Demo Day</option>
                    <option value="pitch_night">Pitch Night</option>
                    <option value="syndicate_round">Syndicate Funding Round</option>
                    <option value="investor_preview">Investor Preview</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Date &amp; Time</label>
                  <Input
                    type="datetime-local"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Location / Format</label>
                  <Input
                    required
                    placeholder="e.g. Nairobi iHub / Hybrid Stream"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Target Commitment ($ USD)</label>
                  <Input
                    type="number"
                    step="50000"
                    required
                    value={eventTargetCommit}
                    onChange={(e) => setEventTargetCommit(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Description / Investor Pitch Instructions</label>
                <textarea
                  rows={3}
                  placeholder="Key details, participating venture firms, investment committee rubric..."
                  value={eventDesc}
                  onChange={(e) => setEventDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateEventOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={createEventMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                >
                  {createEventMutation.isPending ? 'Scheduling...' : 'Publish Event'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
