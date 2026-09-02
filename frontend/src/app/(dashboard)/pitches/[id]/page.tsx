'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Edit,
  Eye,
  Heart,
  TrendingUp,
  FileText,
  DollarSign,
  Percent,
  Tag,
  Calendar,
  Building2,
  ExternalLink,
  Play,
  Download,
  Paperclip,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Flame,
  Globe,
  Share2,
  MoreHorizontal,
  Send,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { apiGet, apiPost } from '@/lib/api';
import type { Pitch } from '@/lib/types';
import { cn, formatRelative, formatCurrency } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

/* ── helpers ─────────────────────────────────────── */
function SectionBlock({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="h-4 w-4 text-brand-orange-500" />}
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{title}</h3>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{children}</p>
    </div>
  );
}

function StatPill({ icon: Icon, label, value, color = 'slate' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color?: 'slate' | 'orange' | 'emerald' | 'amber';
}) {
  const colors = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    orange: 'bg-brand-orange-50 border-brand-orange-200 text-brand-orange-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  };
  return (
    <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl border', colors[color])}>
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
        <div className="text-sm font-bold">{value}</div>
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────── */
export default function PitchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isInvestor, isAdmin, isSuperUser, user } = useAuth();
  const pitchId = params?.id as string;

  const { data: pitch, isLoading, isError } = useQuery({
    queryKey: ['pitch', pitchId],
    queryFn: () => apiGet<Pitch>(`/pitches/${pitchId}/`),
    enabled: !!pitchId,
  });

  const likeMutation = useMutation({
    mutationFn: () => apiPost(`/pitches/${pitchId}/like/`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pitch', pitchId] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => apiPost(`/pitches/${pitchId}/publish/`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pitch', pitchId] });
      queryClient.invalidateQueries({ queryKey: ['pitches'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-brand-orange-500 mx-auto" />
          <p className="text-sm text-slate-500">Loading pitch details…</p>
        </div>
      </div>
    );
  }

  if (isError || !pitch) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900">Pitch not found</h2>
          <p className="text-sm text-slate-500 mt-1">
            This pitch may have been deleted or you may not have access to it.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Go back
        </Button>
      </div>
    );
  }

  const isOwner = pitch.startup === user?.id || (isAdmin || isSuperUser);
  const canEdit = isOwner;
  const canPublish = isOwner && pitch.is_draft;

  const hasDeckUrl = !!pitch.deck_url;
  const hasVideoUrl = !!pitch.video_url;
  const hasAttachments = !!pitch.attachments?.length;

  return (
    <div className="space-y-6 pb-12">
      {/* ── Top Bar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                {pitch.title}
              </h1>
              <Badge
                variant={pitch.is_draft ? 'warning' : 'success'}
                className="shrink-0"
              >
                {pitch.is_draft ? 'Draft' : 'Live'}
              </Badge>
              {pitch.is_featured && (
                <Badge className="bg-brand-orange-500 text-white shrink-0">
                  <Flame className="h-3 w-3 mr-1" /> Featured
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {pitch.pitched_at
                ? `Pitched ${formatRelative(pitch.pitched_at)}`
                : `Created ${formatRelative(pitch.created_at)}`}
              {pitch.startup_name && (
                <>
                  <span className="text-slate-300">·</span>
                  <Building2 className="h-3 w-3" />
                  {pitch.startup_name}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canPublish && (
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending}
            >
              {publishMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Publish Pitch
            </Button>
          )}
          {canEdit && (
            <Link href={`/pitches/${pitchId}/edit`}>
              <Button size="sm" variant="outline">
                <Edit className="h-4 w-4 mr-1.5" />
                Edit
              </Button>
            </Link>
          )}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill
          icon={Eye}
          label="Views"
          value={pitch.like_count ?? 0}
          color="slate"
        />
        <StatPill
          icon={Heart}
          label="Likes"
          value={pitch.like_count ?? 0}
          color="orange"
        />
        <StatPill
          icon={TrendingUp}
          label="Offers"
          value={pitch.offers_count ?? 0}
          color="emerald"
        />
        {pitch.asking_amount && (
          <StatPill
            icon={DollarSign}
            label="Asking"
            value={`$${Number(pitch.asking_amount).toLocaleString()}`}
            color="amber"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Main Content ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Cover Image */}
          {pitch.cover_image_url && (
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pitch.cover_image_url}
                alt={`${pitch.title} cover`}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Main Narrative Card */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6 space-y-6">
              {pitch.description && (
                <SectionBlock title="Overview" icon={FileText}>
                  {pitch.description}
                </SectionBlock>
              )}

              {pitch.problem && (
                <>
                  <Separator />
                  <SectionBlock title="The Problem" icon={AlertCircle}>
                    {pitch.problem}
                  </SectionBlock>
                </>
              )}

              {pitch.solution && (
                <>
                  <Separator />
                  <SectionBlock title="The Solution" icon={CheckCircle2}>
                    {pitch.solution}
                  </SectionBlock>
                </>
              )}

              {pitch.market_size && (
                <>
                  <Separator />
                  <SectionBlock title="Market Size" icon={Globe}>
                    {pitch.market_size}
                  </SectionBlock>
                </>
              )}

              {pitch.business_model && (
                <>
                  <Separator />
                  <SectionBlock title="Business Model" icon={Building2}>
                    {pitch.business_model}
                  </SectionBlock>
                </>
              )}

              {pitch.traction && (
                <>
                  <Separator />
                  <SectionBlock title="Traction" icon={TrendingUp}>
                    {pitch.traction}
                  </SectionBlock>
                </>
              )}

              {pitch.use_of_funds && (
                <>
                  <Separator />
                  <SectionBlock title="Use of Funds" icon={DollarSign}>
                    {pitch.use_of_funds}
                  </SectionBlock>
                </>
              )}

              {/* If all fields are empty */}
              {!pitch.description && !pitch.problem && !pitch.solution && !pitch.market_size && !pitch.business_model && !pitch.traction && !pitch.use_of_funds && (
                <div className="text-center py-8 text-sm text-slate-400">
                  No pitch narrative content yet.{' '}
                  {canEdit && (
                    <Link href={`/pitches/${pitchId}/edit`} className="text-brand-orange-600 font-semibold underline underline-offset-2">
                      Add content →
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tags */}
          {pitch.tags && pitch.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="h-4 w-4 text-slate-400 shrink-0" />
              {pitch.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* ── Right Sidebar ── */}
        <div className="space-y-4">

          {/* Funding Terms */}
          {(pitch.asking_amount || pitch.equity_offered) && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-slate-900">Funding Terms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {pitch.asking_amount && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <DollarSign className="h-3.5 w-3.5" /> Asking Amount
                    </span>
                    <span className="font-bold text-slate-900">
                      ${Number(pitch.asking_amount).toLocaleString()}
                    </span>
                  </div>
                )}
                {pitch.equity_offered && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Percent className="h-3.5 w-3.5" /> Equity Offered
                    </span>
                    <span className="font-bold text-slate-900">{pitch.equity_offered}%</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Media & Documents */}
          {(hasDeckUrl || hasVideoUrl || hasAttachments) && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-slate-900">Media & Documents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-0">
                {hasDeckUrl && (
                  <a
                    href={pitch.deck_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-brand-orange-300 hover:bg-brand-orange-50/50 transition-all group text-sm"
                  >
                    <div className="h-8 w-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-red-600" />
                    </div>
                    <span className="flex-1 font-medium text-slate-700 truncate">Pitch Deck</span>
                    <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-orange-500 transition-colors" />
                  </a>
                )}
                {hasVideoUrl && (
                  <a
                    href={pitch.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-brand-orange-300 hover:bg-brand-orange-50/50 transition-all group text-sm"
                  >
                    <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
                      <Play className="h-4 w-4 text-indigo-600" />
                    </div>
                    <span className="flex-1 font-medium text-slate-700 truncate">Pitch Video</span>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-orange-500 transition-colors" />
                  </a>
                )}
                {pitch.attachments?.map((att) => (
                  <a
                    key={att.id}
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 hover:border-brand-orange-300 hover:bg-brand-orange-50/50 transition-all group text-sm"
                  >
                    <div className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                      <Paperclip className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-700 truncate block">{att.file_name}</span>
                      {att.file_size && (
                        <span className="text-[10px] text-slate-400">
                          {(att.file_size / 1024).toFixed(0)} KB
                        </span>
                      )}
                    </div>
                    <Download className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-orange-500 transition-colors" />
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Investor Action Panel */}
          {isInvestor && !pitch.is_draft && (
            <Card className="border-brand-orange-200 bg-gradient-to-br from-brand-orange-50/80 to-white shadow-sm">
              <CardContent className="p-5 space-y-3">
                <div className="text-sm font-bold text-slate-900">Interested in this pitch?</div>
                <p className="text-xs text-slate-600">
                  Send an offer directly to the founding team with your proposed terms.
                </p>
                <Link href={`/offers/new?pitch=${pitchId}`} className="block">
                  <Button className="w-full shadow-md shadow-brand-orange-500/20" size="sm">
                    <DollarSign className="h-4 w-4 mr-1.5" />
                    Make an Offer
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={() => likeMutation.mutate()}
                  disabled={likeMutation.isPending}
                  className={cn(
                    'w-full flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all',
                    pitch.is_liked_by_me
                      ? 'border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600'
                  )}
                >
                  <Heart className={cn('h-3.5 w-3.5', pitch.is_liked_by_me && 'fill-current')} />
                  {pitch.is_liked_by_me ? 'Saved to Watchlist' : 'Save to Watchlist'}
                </button>
              </CardContent>
            </Card>
          )}

          {/* Draft warning for founders */}
          {pitch.is_draft && isOwner && (
            <Card className="border-amber-200 bg-amber-50 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start gap-2.5">
                  <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-amber-900">Draft — not visible to investors</div>
                    <p className="text-xs text-amber-700 mt-1">
                      Publish this pitch to make it visible on the VC discovery feed.
                    </p>
                    {canPublish && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 border-amber-400 text-amber-800 hover:bg-amber-100"
                        onClick={() => publishMutation.mutate()}
                        disabled={publishMutation.isPending}
                      >
                        {publishMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Publish Now
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timestamp */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-2 text-xs text-slate-500">
            <div className="flex justify-between">
              <span>Created</span>
              <span className="font-medium text-slate-700">{new Date(pitch.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Updated</span>
              <span className="font-medium text-slate-700">{formatRelative(pitch.updated_at)}</span>
            </div>
            {pitch.pitched_at && (
              <div className="flex justify-between">
                <span>Published</span>
                <span className="font-medium text-slate-700">{new Date(pitch.pitched_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
