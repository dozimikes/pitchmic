'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ThumbsUp, ThumbsDown, Vote, Clock, CheckCircle2, XCircle,
  AlertTriangle, Swords, Gavel, Users, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InvestmentCaseList, InvestmentCaseDetail } from '@/lib/investorApi';
import { Button } from '@/components/ui/Button';

interface ICDeliberationRoomProps {
  deals: InvestmentCaseList[];
  selectedDealId: number | null;
  dealDetail: InvestmentCaseDetail | null;
  onSelectDeal: (id: number) => void;
  onAddDebate: (payload: { comment: string; side: 'bull' | 'bear' }) => void;
  onCastVote: (payload: {
    investment_case_id: number;
    vote: string;
    conviction_score: number;
    recommended_check_usd: number;
    conditions: string;
    notes: string;
  }) => void;
}

const VOTE_OPTIONS = [
  { val: 'INVEST', label: 'Invest', color: 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500', textColor: 'text-emerald-400', icon: CheckCircle2 },
  { val: 'PASS', label: 'Pass', color: 'bg-red-700 hover:bg-red-600 border-red-600', textColor: 'text-red-400', icon: XCircle },
  { val: 'DEFER', label: 'Defer', color: 'bg-amber-700 hover:bg-amber-600 border-amber-600', textColor: 'text-amber-400', icon: Clock },
  { val: 'REQUEST_DILIGENCE', label: 'More Diligence', color: 'bg-violet-700 hover:bg-violet-600 border-violet-600', textColor: 'text-violet-400', icon: AlertTriangle },
];

function VoteTally({ votes }: { votes: InvestmentCaseDetail['partner_votes'] }) {
  const counts = { INVEST: 0, PASS: 0, DEFER: 0, REQUEST_DILIGENCE: 0 };
  let totalConviction = 0;
  votes.forEach((v) => {
    counts[v.vote as keyof typeof counts] = (counts[v.vote as keyof typeof counts] || 0) + 1;
    totalConviction += v.conviction_score;
  });
  const avgConviction = votes.length ? (totalConviction / votes.length).toFixed(1) : '-';
  const majority = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];

  return (
    <div className="rounded-xl border border-neutral-700 bg-neutral-800/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-white uppercase tracking-widest flex items-center gap-2">
          <Vote className="w-3.5 h-3.5 text-violet-400" /> Vote Tally
        </h4>
        <span className="text-xs text-neutral-500">{votes.length} vote{votes.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(counts).map(([vote, count]) => {
          const cfg = VOTE_OPTIONS.find((v) => v.val === vote);
          const Icon = cfg?.icon ?? CheckCircle2;
          return (
            <div key={vote} className="flex items-center gap-2 text-xs">
              <Icon className={cn('w-3.5 h-3.5', cfg?.textColor)} />
              <span className={cn('font-medium', cfg?.textColor)}>{vote.replace('_', ' ')}</span>
              <span className="text-neutral-500 ml-auto font-mono">{count}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-neutral-700">
        <span className="text-xs text-neutral-500">Avg. Conviction</span>
        <span className="text-sm font-bold text-white font-mono">{avgConviction}/10</span>
      </div>
      {votes.length > 0 && (
        <div className={cn(
          'text-xs text-center py-2 rounded-lg font-semibold',
          majority[0] === 'INVEST' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30'
            : majority[0] === 'PASS' ? 'bg-red-900/30 text-red-400 border border-red-700/30'
            : 'bg-amber-900/30 text-amber-400 border border-amber-700/30'
        )}>
          {majority[1] > 0 ? `Preliminary: ${majority[0].replace('_', ' ')}` : 'No consensus yet'}
        </div>
      )}
    </div>
  );
}

export function ICDeliberationRoom({
  deals, selectedDealId, dealDetail, onSelectDeal, onAddDebate, onCastVote,
}: ICDeliberationRoomProps) {
  const [comment, setComment] = React.useState('');
  const [side, setSide] = React.useState<'bull' | 'bear'>('bull');
  const [vote, setVote] = React.useState('INVEST');
  const [conviction, setConviction] = React.useState(7);
  const [checkUsd, setCheckUsd] = React.useState(250000);
  const [conditions, setConditions] = React.useState('');
  const [voteNotes, setVoteNotes] = React.useState('');
  const [activeSubTab, setActiveSubTab] = React.useState<'memo' | 'debate' | 'vote'>('memo');

  const d = dealDetail;
  const icDeals = deals.filter((dl) => ['IC_REVIEW', 'TERM_SHEET', 'UNDERWRITING'].includes(dl.status));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-5 min-h-[600px]">
      {/* IC-ready deal list */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
        <div className="p-4 border-b border-neutral-800">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
            <Gavel className="w-3.5 h-3.5" /> IC Queue
          </h3>
        </div>
        <div className="overflow-y-auto max-h-[680px]">
          {icDeals.length === 0 && (
            <p className="text-center text-neutral-600 text-xs py-8 px-4">
              No deals in IC Review. Advance deals from Underwriting to see them here.
            </p>
          )}
          {icDeals.map((deal) => (
            <button
              key={deal.id}
              onClick={() => onSelectDeal(deal.id)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b border-neutral-800/50 transition-colors cursor-pointer',
                selectedDealId === deal.id ? 'bg-fuchsia-900/30 border-l-2 border-l-fuchsia-500' : 'hover:bg-neutral-800/40'
              )}
            >
              <div className="text-sm font-medium text-white">{deal.company_name}</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                Fit: <span className="text-violet-400">{deal.thesis_fit_score.toFixed(0)}%</span>
                {' · '}
                <span className={cn('px-1 py-0.5 rounded text-[10px]', {
                  'bg-fuchsia-900/30 text-fuchsia-400': deal.status === 'IC_REVIEW',
                  'bg-emerald-900/30 text-emerald-400': deal.status === 'TERM_SHEET',
                  'bg-violet-900/30 text-violet-400': deal.status === 'UNDERWRITING',
                })}>
                  {deal.status.replace('_', ' ')}
                </span>
              </div>
              <div className="text-xs text-neutral-600 mt-1">
                {selectedDealId === deal.id && dealDetail
                  ? `${dealDetail.partner_votes.length} votes cast`
                  : `${deal.claims_count} claims verified`}
              </div>
            </button>
          ))}
          {/* Also show all deals if none are specifically IC_REVIEW */}
          {icDeals.length === 0 && deals.slice(0, 5).map((deal) => (
            <button
              key={deal.id}
              onClick={() => onSelectDeal(deal.id)}
              className={cn(
                'w-full text-left px-4 py-3.5 border-b border-neutral-800/50 transition-colors cursor-pointer',
                selectedDealId === deal.id ? 'bg-fuchsia-900/30 border-l-2 border-l-fuchsia-500' : 'hover:bg-neutral-800/40'
              )}
            >
              <div className="text-sm font-medium text-white">{deal.company_name}</div>
              <div className="text-xs text-neutral-500 mt-0.5">{deal.status.replace('_', ' ')}</div>
            </button>
          ))}
        </div>
      </div>

      {/* IC Room Panel */}
      <div className="space-y-4">
        {!d ? (
          <div className="flex items-center justify-center h-64 rounded-2xl border border-dashed border-neutral-800 text-neutral-600 text-sm">
            Select a deal to open the IC deliberation room.
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-white">{d.company_name}</h2>
                  <p className="text-sm text-neutral-400 mt-0.5">
                    {d.industry} · {d.geography} ·{' '}
                    <span className="text-fuchsia-400 font-medium">{d.status.replace('_', ' ')}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-violet-400 font-mono">{d.thesis_fit_score.toFixed(0)}%</div>
                  <div className="text-xs text-neutral-500">Thesis Fit</div>
                </div>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 border-b border-neutral-800">
              {[
                { id: 'memo', label: 'IC Memo', icon: MessageSquare },
                { id: 'debate', label: 'Debate Room', icon: Swords },
                { id: 'vote', label: 'Cast Vote', icon: Vote },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveSubTab(t.id as any)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer',
                      activeSubTab === t.id
                        ? 'border-fuchsia-500 text-fuchsia-400'
                        : 'border-transparent text-neutral-400 hover:text-neutral-200'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            {/* IC MEMO */}
            {activeSubTab === 'memo' && d.memo && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
                  <h3 className="text-sm font-semibold text-white mb-2">Executive Summary</h3>
                  <p className="text-sm text-neutral-300 leading-relaxed">{d.memo.executive_summary}</p>
                  {d.memo.thesis_alignment_rationale && (
                    <p className="text-xs text-neutral-500 mt-2 italic">{d.memo.thesis_alignment_rationale}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Bull Case */}
                  <div className="rounded-2xl border border-emerald-800/30 bg-emerald-950/20 p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                      <ThumbsUp className="w-3.5 h-3.5" /> Bull Case
                    </h3>
                    {(d.memo.bull_case ?? []).map((b: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-emerald-300">{b.point}</span>
                          <span className={cn('ml-2 px-1 rounded text-[10px] border', {
                            'border-emerald-600/40 text-emerald-400': b.strength === 'High',
                            'border-amber-600/40 text-amber-400': b.strength === 'Medium',
                          })}>
                            {b.strength}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bear Case */}
                  <div className="rounded-2xl border border-red-800/30 bg-red-950/20 p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-red-400 uppercase tracking-widest flex items-center gap-2">
                      <ThumbsDown className="w-3.5 h-3.5" /> Bear Case
                    </h3>
                    {(d.memo.bear_case ?? []).map((b: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-red-300">{b.point}</span>
                          <span className={cn('ml-2 px-1 rounded text-[10px] border', {
                            'border-red-600/40 text-red-400': b.strength === 'High',
                            'border-amber-600/40 text-amber-400': b.strength === 'Medium',
                          })}>
                            {b.strength}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Kill Conditions */}
                {d.memo.kill_conditions?.length > 0 && (
                  <div className="rounded-2xl border border-orange-800/30 bg-orange-950/20 p-4">
                    <h3 className="text-xs font-semibold text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" /> Kill Conditions
                    </h3>
                    <ul className="space-y-1.5">
                      {d.memo.kill_conditions.map((kc: any, i: number) => (
                        <li key={i} className="text-xs text-orange-300 flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                          <span>{kc.condition}</span>
                          <span className="ml-auto shrink-0 text-orange-500/70">{kc.severity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeSubTab === 'memo' && !d.memo && (
              <div className="text-center py-10 text-neutral-500 text-sm rounded-2xl border border-dashed border-neutral-800">
                No IC memo generated yet. Go to Underwriting and click &quot;Generate IC Memo&quot;.
              </div>
            )}

            {/* DEBATE ROOM */}
            {activeSubTab === 'debate' && (
              <div className="space-y-4">
                {/* Add argument */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-white">Add IC Argument</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSide('bull')}
                      className={cn('flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer', side === 'bull' ? 'bg-emerald-700 border-emerald-600 text-white' : 'border-neutral-700 text-neutral-400 hover:border-neutral-600')}
                    >
                      <ThumbsUp className="w-3.5 h-3.5 inline mr-1.5" /> Bull
                    </button>
                    <button
                      onClick={() => setSide('bear')}
                      className={cn('flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer', side === 'bear' ? 'bg-red-800 border-red-700 text-white' : 'border-neutral-700 text-neutral-400 hover:border-neutral-600')}
                    >
                      <ThumbsDown className="w-3.5 h-3.5 inline mr-1.5" /> Bear
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={side === 'bull' ? 'Why this deal should be approved...' : 'Why this deal should be passed...'}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-fuchsia-500"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!comment.trim()}
                      onClick={() => { onAddDebate({ comment, side }); setComment(''); }}
                      className={cn('text-xs', side === 'bull' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-700 hover:bg-red-600', 'text-white')}
                    >
                      Submit {side === 'bull' ? 'Bull' : 'Bear'} Argument
                    </Button>
                  </div>
                </div>

                {/* Debate Log */}
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-fuchsia-400" /> Debate Log
                  </h3>
                  {d.ic_debates.length === 0 || d.ic_debates.every((s) => !s.debate_log?.length) ? (
                    <p className="text-neutral-600 text-xs py-4 text-center">No debate arguments yet. Be the first.</p>
                  ) : (
                    <div className="space-y-2">
                      {d.ic_debates.flatMap((s) => s.debate_log || []).map((entry, i) => (
                        <div
                          key={i}
                          className={cn(
                            'p-3 rounded-xl text-xs border',
                            entry.side === 'bull'
                              ? 'border-emerald-700/30 bg-emerald-950/20'
                              : 'border-red-700/30 bg-red-950/20'
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={cn('font-semibold', entry.side === 'bull' ? 'text-emerald-400' : 'text-red-400')}>
                              {entry.side === 'bull' ? '↑ Bull' : '↓ Bear'} · {entry.partner_name}
                            </span>
                            <span className="text-neutral-600 text-[10px]">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-neutral-300">{entry.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CAST VOTE */}
            {activeSubTab === 'vote' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-5">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Vote className="w-4 h-4 text-fuchsia-400" /> Cast Your IC Vote
                  </h3>

                  <div className="grid grid-cols-2 gap-2">
                    {VOTE_OPTIONS.map((v) => {
                      const Icon = v.icon;
                      return (
                        <button
                          key={v.val}
                          onClick={() => setVote(v.val)}
                          className={cn(
                            'py-3 rounded-xl text-sm font-bold border transition-all cursor-pointer',
                            vote === v.val ? `${v.color} text-white shadow-lg` : 'border-neutral-700 bg-neutral-800/50 text-neutral-400 hover:border-neutral-600'
                          )}
                        >
                          <Icon className="w-4 h-4 inline mr-2" />
                          {v.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-neutral-400 font-medium block mb-1.5">
                        Conviction: <span className="text-fuchsia-400 font-mono">{conviction}/10</span>
                      </label>
                      <input type="range" min={1} max={10} value={conviction} onChange={(e) => setConviction(Number(e.target.value))} className="w-full accent-fuchsia-500" />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-400 font-medium block mb-1.5">Recommended Check (USD)</label>
                      <input
                        type="number"
                        value={checkUsd}
                        onChange={(e) => setCheckUsd(Number(e.target.value))}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-400 font-medium block mb-1.5">Conditions</label>
                      <input
                        type="text"
                        value={conditions}
                        onChange={(e) => setConditions(e.target.value)}
                        placeholder="e.g. Requires co-investor confirmation"
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-neutral-400 font-medium block mb-1.5">Notes</label>
                      <input
                        type="text"
                        value={voteNotes}
                        onChange={(e) => setVoteNotes(e.target.value)}
                        placeholder="Additional rationale..."
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => onCastVote({ investment_case_id: d.id, vote, conviction_score: conviction, recommended_check_usd: checkUsd, conditions, notes: voteNotes })}
                    className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold"
                  >
                    <Vote className="w-4 h-4 mr-2" /> Submit IC Vote: {vote.replace('_', ' ')}
                  </Button>
                </div>

                {/* Tally */}
                {d.partner_votes.length > 0 && <VoteTally votes={d.partner_votes} />}

                {/* All votes */}
                {d.partner_votes.length > 0 && (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" /> Partner Votes
                    </h4>
                    {d.partner_votes.map((v) => {
                      const cfg = VOTE_OPTIONS.find((o) => o.val === v.vote);
                      return (
                        <div key={v.id} className="flex items-center gap-3 text-xs p-2.5 rounded-lg bg-neutral-800/40">
                          <span className="text-white font-medium">{v.partner_name || v.partner_email}</span>
                          <span className={cn('px-1.5 py-0.5 rounded font-semibold', cfg?.textColor)}>{v.vote.replace('_', ' ')}</span>
                          <span className="text-neutral-500 ml-auto">conviction: <span className="text-white font-mono">{v.conviction_score}/10</span></span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
