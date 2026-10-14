'use client';

/**
 * What was actually said on a call, and which of it a human decided was worth
 * checking.
 *
 * A transcript is append-only evidence: the server numbers each turn, stamps it
 * with its own clock and records who wrote it down. Nothing here can be edited
 * or deleted from this screen, because a record of what a founder claimed that
 * somebody can quietly rewrite is not evidence.
 *
 * Recording a turn as a claim is a human act, and it is not a verdict. The row
 * enters the evidence graph as `source='interview'` and unverified — no more
 * trustworthy than the sentence it came from — so the deck answer and the
 * spoken answer can be set against each other. Whether either one holds up is
 * still decided by documents and by the committee.
 *
 * Every count on this screen is read off stored rows: turns from the session's
 * own transcript, and which turns are already recorded from the evidence graph
 * the page already fetched. Nothing is re-tallied in the browser.
 */

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, Mic, Quote, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import {
  acceleratorApi,
  type ApplicationClaim,
  type EvidenceGraphClaim,
  type InterviewTranscriptTurn,
  type TranscriptSpeaker,
} from '@/lib/acceleratorApi';
import { apiErrMessage, formatDateTime } from '@/lib/screening';

/** Mirrors InterviewSession.TRANSCRIPT_SPEAKERS on the model. */
const SPEAKERS: Array<{ value: TranscriptSpeaker; label: string }> = [
  { value: 'founder', label: 'Founder' },
  { value: 'interviewer', label: 'Interviewer' },
  { value: 'team_member', label: 'Team member' },
  { value: 'observer', label: 'Observer' },
];

const SPEAKER_TONE: Record<string, string> = {
  founder: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  interviewer: 'bg-slate-50 text-slate-600 border-slate-200',
  team_member: 'bg-sky-50 text-sky-700 border-sky-200',
  observer: 'bg-slate-50 text-slate-500 border-slate-200',
};

/** Mirrors ApplicationClaim.CATEGORY_CHOICES. */
const CLAIM_CATEGORIES = [
  'commercial_traction',
  'revenue',
  'team',
  'market',
  'product',
  'funding',
  'ip',
  'regulatory',
  'other',
];

/** Mirrors ApplicationClaim.CLAIM_MATERIALITY_CHOICES. */
const MATERIALITIES = ['critical', 'high', 'medium', 'low'];

function humanise(value: string): string {
  return (value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** The session row as this panel needs it — a subset of InterviewSessionRow,
 *  so the page keeps owning the one fetch. */
export interface TranscriptSession {
  id: number;
  round_number?: number;
  interview_type?: string;
  status?: string;
  interviewer_name?: string;
  scheduled_at?: string | null;
  transcript?: InterviewTranscriptTurn[];
  transcript_turn_count?: number;
  claims_recorded_from_it?: number;
}

const selectCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-indigo-300 disabled:bg-slate-50';

export function TranscriptPanel({
  session,
  applicationId,
  applicationLabel,
  claims,
  canWrite,
  afterWrite,
}: {
  session: TranscriptSession | null;
  applicationId: number;
  applicationLabel: string;
  /** The application's evidence-graph claims — where interview provenance lives. */
  claims: EvidenceGraphClaim[];
  canWrite: boolean;
  afterWrite: () => void;
}) {
  const { toast } = useToast();
  const [speaker, setSpeaker] = React.useState<TranscriptSpeaker>('founder');
  const [draft, setDraft] = React.useState('');
  const [claimTurn, setClaimTurn] = React.useState<number | null>(null);

  const turns = session?.transcript ?? [];
  // Which turns already became claims, read off the graph rows rather than
  // counted here — the same relation the diligence and decision screens use.
  const recordedTurns = React.useMemo(() => {
    const set = new Set<number>();
    if (session) {
      for (const c of claims) {
        if (c.interview?.session_id === session.id && c.interview.turn != null) set.add(c.interview.turn);
      }
    }
    return set;
  }, [claims, session]);

  const invalidate = () => {
    afterWrite();
  };

  const appendTurn = useMutation({
    mutationFn: () => acceleratorApi.captureInterviewTranscript(session!.id, [{ speaker, text: draft.trim() }]),
    onSuccess: (res) => {
      setDraft('');
      invalidate();
      toast({
        title: 'Turn added to the transcript',
        description: `Turn ${res.session.transcript.length - 1} of ${res.transcript_turns} on record, stamped by the server.`,
        variant: 'success',
      });
    },
    onError: (err) =>
      toast({
        title: 'That turn was not written down',
        description: apiErrMessage(err),
        variant: 'error',
        duration: 8000,
      }),
  });

  const recordClaim = useMutation({
    mutationFn: (input: { turn: number; statement: string; category: string; materiality: string; evidence_required: boolean }) =>
      acceleratorApi.recordInterviewClaim(session!.id, input),
    onSuccess: (claim: ApplicationClaim) => {
      setClaimTurn(null);
      invalidate();
      toast({
        title: 'Recorded as a claim',
        description: `${claim.claim_id} is in the evidence graph as unverified. Something has to prove it.`,
        variant: 'success',
      });
    },
    onError: (err) =>
      toast({
        title: 'Not recorded',
        description: apiErrMessage(err),
        variant: 'error',
        duration: 8000,
      }),
  });

  if (!session) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <PanelHeading title="Interview transcript" subtitle={`${applicationLabel} · no session`} />
        <p className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
          Nothing has been scheduled or logged for this candidate, so there is no record of what
          they said. That is an absence of evidence, not a finding about them — schedule a session
          from the header to start one.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <PanelHeading
        title="Interview transcript"
        subtitle={`Round ${session.round_number ?? '—'} · ${humanise(session.interview_type || '')}${
          session.interviewer_name ? ` · with ${session.interviewer_name}` : ''
        }`}
        right={
          <span className="text-[11px] font-semibold text-slate-500">
            {turns.length === 0
              ? 'nothing written down yet'
              : `${turns.length} turn${turns.length === 1 ? '' : 's'} on record`}
          </span>
        }
      />

      <p className="text-[11px] text-slate-500">
        {session.claims_recorded_from_it === 0 || session.claims_recorded_from_it == null ? (
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {turns.length} turns were heard and none of them was written down as something to
            verify. That is a choice somebody made; it is worth making deliberately.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            {session.claims_recorded_from_it} of {turns.length} turns are recorded as claims in the
            evidence graph.
          </span>
        )}
      </p>

      {/* ── Stored turns ──────────────────────────────────────────────────── */}
      {turns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
          No turns on this session yet. Whoever held the call writes down what was said here; a
          founder cannot add to the record of their own answers.
        </p>
      ) : (
        <ol className="space-y-2">
          {turns.map((t) => {
            const isClaimed = recordedTurns.has(t.turn);
            const open = claimTurn === t.turn;
            return (
              <li
                key={t.turn}
                className={cn(
                  'rounded-xl border px-3 py-2.5',
                  isClaimed ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                      <span
                        className={cn(
                          'rounded-full border px-1.5 py-0.5 font-semibold',
                          SPEAKER_TONE[t.speaker] ?? 'border-slate-200 bg-slate-50 text-slate-600'
                        )}
                      >
                        {humanise(String(t.speaker))}
                      </span>
                      <span className="font-mono text-slate-400">turn {t.turn}</span>
                      <span>{t.timestamp ? formatDateTime(t.timestamp) : 'no server timestamp'}</span>
                      {t.recorded_by ? <span>· written down by {t.recorded_by}</span> : null}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{t.text}</p>
                  </div>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant={isClaimed ? 'secondary' : 'outline'}
                      disabled={isClaimed || recordClaim.isPending}
                      leftIcon={<Quote className="h-3.5 w-3.5" />}
                      onClick={() => setClaimTurn(open ? null : t.turn)}
                    >
                      {isClaimed ? 'Recorded' : 'Record as claim'}
                    </Button>
                  )}
                </div>

                {open && (
                  <ClaimFromTurnForm
                    turnText={t.text}
                    busy={recordClaim.isPending}
                    onCancel={() => setClaimTurn(null)}
                    onSubmit={(input) => recordClaim.mutate({ turn: t.turn, ...input })}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}

      {/* ── Append ────────────────────────────────────────────────────────── */}
      {canWrite ? (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Add what was said
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Who spoke this turn"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value as TranscriptSpeaker)}
              className={cn(selectCls, 'sm:w-40 shrink-0')}
            >
              {SPEAKERS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write the sentence as it was said. Not your summary of it, and not your read on it."
              rows={2}
              className="flex-1 border-slate-200 bg-slate-50/50 focus-visible:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
              loading={appendTurn.isPending}
              disabled={appendTurn.isPending || !draft.trim()}
              onClick={() => appendTurn.mutate()}
            >
              Add turn <Send className="h-3.5 w-3.5 ml-1" />
            </Button>
            <span className="text-[10px] text-slate-400">
              Append-only — the turn number, the clock and your name are set by the server, and
              nothing written here can be edited away afterwards.
            </span>
          </div>
        </div>
      ) : (
        <p className="border-t border-slate-100 pt-4 text-[11px] text-slate-500">
          Reading the record is open to reviewers on this program; writing it down is not. Only
          program staff can add a turn to a transcript.
        </p>
      )}
    </div>
  );
}

function PanelHeading({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-700">
          <Mic className="h-3.5 w-3.5" /> {title}
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

function ClaimFromTurnForm({
  turnText,
  busy,
  onCancel,
  onSubmit,
}: {
  turnText: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { statement: string; category: string; materiality: string; evidence_required: boolean }) => void;
}) {
  const [statement, setStatement] = React.useState(turnText);
  const [category, setCategory] = React.useState('revenue');
  const [materiality, setMateriality] = React.useState('high');
  const [evidenceRequired, setEvidenceRequired] = React.useState(true);

  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ statement: statement.trim(), category, materiality, evidence_required: evidenceRequired });
      }}
    >
      <p className="text-[11px] text-slate-600">
        This writes down that the sentence is an assertion worth checking. It does not make it
        true, and it does not make it false — it arrives unverified.
      </p>
      <Textarea
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        rows={2}
        aria-label="Claim statement"
        className="border-slate-200 bg-white text-xs focus-visible:ring-indigo-500"
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[10rem] flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">What it is about</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={cn(selectCls, 'mt-1')}>
            {CLAIM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {humanise(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[8rem]">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Materiality</span>
          <select value={materiality} onChange={(e) => setMateriality(e.target.value)} className={cn(selectCls, 'mt-1')}>
            {MATERIALITIES.map((m) => (
              <option key={m} value={m}>
                {humanise(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={evidenceRequired}
            onChange={(e) => setEvidenceRequired(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
          />
          Evidence will be required
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
          loading={busy}
          disabled={busy || !statement.trim()}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Record the claim
        </Button>
        <Button size="sm" type="button" variant="ghost" onClick={onCancel}>
          Leave it as a sentence
        </Button>
      </div>
    </form>
  );
}
