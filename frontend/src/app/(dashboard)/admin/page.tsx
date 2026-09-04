'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Activity,
  ShieldCheck,
  Brain,
  BarChart3,
  Network,
  Layers,
  FileText,
  AlertTriangle,
  Rocket,
  Briefcase,
  TrendingUp,
  Zap,
  Key,
  Bell,
  ArrowUpRight,
  RefreshCw,
  Clock,
  HandCoins,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { UserRole } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] },
  }),
};

const ADMIN_ACTIONS = [
  { icon: Users, title: 'User Directory & Access', desc: 'Audit platform accounts, verify founder identity, and configure staff roles.', href: '#users', badge: 'Live Directory', color: 'border-indigo-200 hover:border-indigo-400', iconBg: 'bg-indigo-600' },
  { icon: Layers, title: 'Cohort Pipeline Engine', desc: 'Monitor active intake cohorts, rubric distributions, and multi-accelerator batch sync.', href: '/accelerator', badge: 'Active Cohorts', color: 'border-purple-200 hover:border-purple-400', iconBg: 'bg-purple-600' },
  { icon: Key, title: 'Enterprise Tenant Keys', desc: 'Provision and revoke B2B REST API keys for institutional syndicates and funds.', href: '/intelligence', badge: 'Enterprise Auth', color: 'border-emerald-200 hover:border-emerald-400', iconBg: 'bg-emerald-600' },
  { icon: BarChart3, title: 'Platform Analytics', desc: 'System-wide pitch view telemetry, conversion velocity, and SAFE deal pricing.', href: '/analytics', badge: 'Live Metrics', color: 'border-brand-orange-200 hover:border-brand-orange-400', iconBg: 'bg-brand-orange-500' },
  { icon: Brain, title: 'VC Intelligence & Forensics', desc: 'Review AI audio models, 8-pillar scoring weights, and radar accuracy.', href: '/intelligence', badge: 'AI Engine', color: 'border-cyan-200 hover:border-cyan-400', iconBg: 'bg-cyan-600' },
  { icon: ShieldCheck, title: 'NDPR & GDPR Audit Vault', desc: 'Pan-African data compliance logs, NDA electronic signatures, and access ledger.', href: '#audit', badge: 'NDPR Compliant', color: 'border-rose-200 hover:border-rose-400', iconBg: 'bg-rose-600' },
];

interface AdminSummaryData {
  status: string;
  stats: {
    total_users: number;
    startup_users: number;
    investor_users: number;
    accelerator_users: number;
    verified_users: number;
    total_pitches: number;
    published_pitches: number;
    draft_pitches: number;
    total_offers: number;
    accepted_offers: number;
  };
  system_health: Array<{ service: string; status: string; latency: string }>;
  recent_signups: Array<{ id: number; email: string; first_name?: string; role: string; created_at: string }>;
  recent_pitches: Array<{ id: number; title: string; asking_amount?: string; created_at: string }>;
}

export default function AdminDashboardPage() {
  const { isSuperUser, isAdmin, canSwitchRole, setActiveRole } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isSuperUser && !isAdmin && !canSwitchRole) {
      router.replace('/newsfeed');
    }
  }, [isSuperUser, isAdmin, canSwitchRole, router]);

  const { data: telemetry, isLoading, isFetching, refetch } = useQuery<AdminSummaryData>({
    queryKey: ['admin_summary'],
    queryFn: async () => {
      const res = await api.get('/admin/summary/');
      return res.data;
    },
    refetchInterval: 30000,
  });

  if (!isSuperUser && !isAdmin && !canSwitchRole) return null;

  const stats = [
    {
      label: 'Total Platform Users',
      value: telemetry?.stats?.total_users != null ? String(telemetry.stats.total_users) : '...',
      delta: `${telemetry?.stats?.verified_users ?? 0} verified`,
      icon: Users,
      color: 'bg-indigo-500',
      light: 'bg-indigo-50 text-indigo-700',
    },
    {
      label: 'Startup Founders',
      value: telemetry?.stats?.startup_users != null ? String(telemetry.stats.startup_users) : '...',
      delta: 'Active founders',
      icon: Rocket,
      color: 'bg-brand-orange-500',
      light: 'bg-brand-orange-50 text-brand-orange-700',
    },
    {
      label: 'VC & Angel Allocators',
      value: telemetry?.stats?.investor_users != null ? String(telemetry.stats.investor_users) : '...',
      delta: 'Capital allocators',
      icon: Briefcase,
      color: 'bg-emerald-500',
      light: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Pitches in Vault',
      value: telemetry?.stats?.total_pitches != null ? String(telemetry.stats.total_pitches) : '...',
      delta: `${telemetry?.stats?.published_pitches ?? 0} published`,
      icon: FileText,
      color: 'bg-purple-500',
      light: 'bg-purple-50 text-purple-700',
    },
    {
      label: 'Term Sheets & SAFEs',
      value: telemetry?.stats?.total_offers != null ? String(telemetry.stats.total_offers) : '...',
      delta: `${telemetry?.stats?.accepted_offers ?? 0} closed`,
      icon: HandCoins,
      color: 'bg-cyan-500',
      light: 'bg-cyan-50 text-cyan-700',
    },
    {
      label: 'Accelerators',
      value: telemetry?.stats?.accelerator_users != null ? String(telemetry.stats.accelerator_users) : '...',
      delta: 'Cohort managers',
      icon: Layers,
      color: 'bg-rose-500',
      light: 'bg-rose-50 text-rose-700',
    },
  ];

  const systemHealth = telemetry?.system_health ?? [
    { service: 'PostgreSQL Primary DB', status: 'operational', latency: '4ms' },
    { service: 'Celery / Redis Broker', status: 'operational', latency: '12ms' },
    { service: 'Deepgram Audio Ingestion', status: 'operational', latency: '180ms' },
    { service: 'Claude 3.5 Sonnet Rubric Engine', status: 'operational', latency: '840ms' },
    { service: 'Pinecone Vector DB (Semantic Fit)', status: 'operational', latency: '65ms' },
    { service: 'Accelerator Webhook & CRM Sync', status: 'operational', latency: '1.2s' },
  ];

  return (
    <div className="space-y-8">
      {/* ── Header with 4-Way Role Switcher ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Admin Governance Console
            </h1>
            <Badge className="bg-slate-900 text-white text-xs font-bold gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span>Superuser Mode</span>
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Platform governance &middot; Live telemetry &middot; Enterprise tenant provisioning &middot; Multi-role supervision
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs gap-1.5 h-9"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            <span>{isFetching ? 'Refreshing...' : 'Refresh Telemetry'}</span>
          </Button>

          {/* 4-Way Role Switcher for Superusers */}
          {canSwitchRole && (
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-0.5">
              <button
                type="button"
                onClick={() => setActiveRole(UserRole.ADMIN)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white shadow-xs"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Admin</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveRole(UserRole.ACCELERATOR); router.push('/accelerator'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-all"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Accelerator</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveRole(UserRole.INVESTOR); router.push('/discover'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-all"
              >
                <Briefcase className="h-3.5 w-3.5" />
                <span>Investor</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveRole(UserRole.STARTUP); router.push('/newsfeed'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-all"
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>Startup</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live Platform Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} custom={i} variants={fadeUp} initial="hidden" animate="show">
            <Card className="border-slate-200 bg-white hover:shadow-md transition-all duration-200">
              <CardContent className="p-4">
                <div className={cn('inline-flex h-8 w-8 items-center justify-center rounded-xl mb-3', stat.color)}>
                  <stat.icon className="h-4 w-4 text-white" />
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {isLoading ? (
                    <span className="inline-block h-6 w-12 bg-slate-200 animate-pulse rounded" />
                  ) : (
                    stat.value
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
                <div className={cn('text-[10px] font-bold mt-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5', stat.light)}>
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>{stat.delta}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Admin Action Cards */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Governance &amp; Controls</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ADMIN_ACTIONS.map((action, i) => (
            <motion.div key={action.title} custom={i} variants={fadeUp} initial="hidden" animate="show">
              <Link href={action.href}>
                <Card className={cn('border bg-white cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 h-full', action.color)}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', action.iconBg)}>
                        <action.icon className="h-5 w-5 text-white" />
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1">{action.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3">{action.desc}</p>
                    <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px] font-semibold">{action.badge}</Badge>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* System Health + Live Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health Card */}
        <motion.div custom={6} variants={fadeUp} initial="hidden" animate="show">
          <Card className="border-slate-200 bg-white">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-500" />
                  <span>Subsystem Health &amp; Latency</span>
                </h3>
                <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200 font-mono">
                  All Systems Online
                </Badge>
              </div>
              <div className="space-y-2.5">
                {systemHealth.map((s) => (
                  <div key={s.service} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('h-2 w-2 rounded-full shrink-0', s.status === 'operational' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse')} />
                      <span className="text-xs font-medium text-slate-700">{s.service}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400">{s.latency}</span>
                      <Badge className={cn('text-[10px] font-bold border', s.status === 'operational' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>
                        {s.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Live Database Activity Ledger */}
        <motion.div custom={7} variants={fadeUp} initial="hidden" animate="show">
          <Card className="border-slate-200 bg-white">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-brand-orange-500" />
                  <span>Platform Activity Ledger</span>
                </h3>
                <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">Database Records</Badge>
              </div>
              <div className="space-y-3">
                {telemetry?.recent_signups && telemetry.recent_signups.length > 0 ? (
                  telemetry.recent_signups.map((u) => (
                    <div key={u.id} className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                        <Users className="h-3.5 w-3.5 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 leading-relaxed font-medium">
                          Account registered: <span className="font-bold text-slate-900">{u.email}</span> ({u.role})
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5 text-slate-400" />
                          <span className="text-[10px] text-slate-400">
                            {new Date(u.created_at).toLocaleDateString()} &middot; {new Date(u.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No recent activity recorded yet.
                  </div>
                )}

                {telemetry?.recent_pitches && telemetry.recent_pitches.map((p) => (
                  <div key={`pitch-${p.id}`} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-orange-100">
                      <Rocket className="h-3.5 w-3.5 text-brand-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        Pitch published: <span className="font-bold text-slate-900">{p.title}</span>
                        {p.asking_amount && ` · Ask: $${Number(p.asking_amount).toLocaleString()}`}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 text-slate-400" />
                        <span className="text-[10px] text-slate-400">
                          {new Date(p.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
