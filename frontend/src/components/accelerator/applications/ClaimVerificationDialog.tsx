'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, StickyNote } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { acceleratorApi, ClaimVerificationChoice } from '@/lib/acceleratorApi';

/**
 * The one control that can change what a claim's verification state is.
 *
 * The state list, each state's precondition and the model's own labels all come
 * from the claim row (`GET /accelerator/claims/<id>/`), because a dropdown that
 * kept its own copy of the vocabulary would drift from the endpoint — the drift
 * that matters being a reviewer offered `Verified` on a claim with nothing
 * attached, and taking the refusal after the click rather than before it.
 *
 * `Verified` is the state this form cannot grant on its own: it needs something
 * in hand, and what is in hand is shown from the server's own answer. A founder's
 * interview answer is a source for the claim and is deliberately not in that
 * list — if saying it were enough, every application would verify itself by
 * talking.
 */
export function ClaimVerificationDialog({
  open,
  onOpenChange,
  claimId,
  claimText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: number | null;
  claimText: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [choice, setChoice] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');

  const offer = useQuery({
    queryKey: ['claim-verification-offer', claimId],
    queryFn: () => acceleratorApi.getClaimVerificationOffer(claimId!),
    enabled: open && claimId != null,
    staleTime: 10_000,
  });

  React.useEffect(() => {
    if (!open) {
      setChoice(null);
      setNote('');
    }
  }, [open]);

  const choices = offer.data?.verification_choices ?? [];
  const selected: ClaimVerificationChoice | undefined =
    choices.find((c) => c.value === choice);

  const needsNote = selected?.needs_note ?? false;
  const needsEvidence = selected?.needs_evidence ?? false;
  const evidenceMissing = needsEvidence && (selected?.evidence_attached.length ?? 0) === 0;
  const noteMissing = needsNote && note.trim() === '';

  const record = useMutation({
    mutationFn: () =>
      acceleratorApi.recordClaimVerification(claimId!, {
        state: choice!,
        note: note.trim() || undefined,
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-card'] });
      queryClient.invalidateQueries({ queryKey: ['claim-verification-offer', claimId] });
      toast({
        title: 'Verification recorded',
        description: `${row.verification_status.replace(/_/g, ' ')} — your name and today's date are on the note.`,
        variant: 'success',
      });
      onOpenChange(false);
    },
    onError: (err: any) =>
      toast({
        title: 'The server refused this decision',
        description:
          err?.response?.data?.note
          || err?.response?.data?.detail
          || err?.message
          || 'No reason came back with the refusal.',
        variant: 'error',
      }),
  });

  const mayVerify = offer.data?.may_verify;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm font-black tracking-tight text-slate-900">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            Record a verification decision
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs leading-relaxed text-slate-500">
            <span className="block max-h-16 overflow-y-auto italic text-slate-700">
              &ldquo;{claimText}&rdquo;
            </span>
            A state here is a human conclusion, so it is recorded with who took
            it and why. It does not score the candidate — it says what the
            evidence carried.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {offer.isLoading ? (
            <p className="text-xs text-slate-400">Reading the states this ledger carries…</p>
          ) : offer.isError ? (
            <p className="text-xs text-rose-600">
              The claim could not be read, so no decision is being offered.
            </p>
          ) : mayVerify === false ? (
            <p className="text-xs text-slate-500">
              This account is not on the operating side of this application, so it
              cannot record a decision on the claim.
            </p>
          ) : (
            <>
              <fieldset className="space-y-1.5">
                <legend className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  What the evidence carried
                </legend>
                {choices.map((c) => (
                  <label
                    key={c.value}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="claim-verification-state"
                      checked={choice === c.value}
                      onChange={() => setChoice(c.value)}
                      className="mt-0.5 h-4 w-4 accent-indigo-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold text-slate-800">
                        {c.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {c.needs_evidence
                          ? c.evidence_attached.length > 0
                            ? `In hand: ${c.evidence_attached.join('; ')}.`
                            : 'Needs something attached — nothing in the file establishes this claim yet.'
                          : c.needs_note
                          ? 'Needs the reason in words.'
                          : 'The state the claim arrived in.'}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <StickyNote className="h-3.5 w-3.5" />
                  {needsNote ? 'Reason (required)' : 'Reason (optional)'}
                </label>
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What was checked, against what, and what it came to."
                  className="text-[12px]"
                />
                {needsEvidence && evidenceMissing && (
                  <p className="mt-1.5 text-[11px] text-amber-600">
                    Nothing is attached to check this claim against, so
                    &ldquo;Verified&rdquo; would record only that a button was
                    pressed. File the document, then come back.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t border-slate-100 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => record.mutate()}
            disabled={
              record.isPending
              || claimId == null
              || !choice
              || noteMissing
              || evidenceMissing
              || mayVerify === false
            }
          >
            {record.isPending ? 'Recording…' : 'Record decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
