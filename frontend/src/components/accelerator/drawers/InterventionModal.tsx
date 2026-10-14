'use client';

import * as React from 'react';
import { AlertCircle, Copy, FileText, UserCheck, Wrench, X } from 'lucide-react';
import { useIntelligence } from '@/app/(dashboard)/accelerator/IntelligenceContext';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const DASH = '—';

export function InterventionModal() {
  const { interventionModalOpen, closeInterventionModal, activeInterventionDraft } = useIntelligence();
  const { toast } = useToast();

  const [mentor, setMentor] = React.useState('');
  const [recommendedAction, setRecommendedAction] = React.useState('');
  const [expectedOutcome, setExpectedOutcome] = React.useState('');

  React.useEffect(() => {
    if (activeInterventionDraft) {
      setMentor(activeInterventionDraft.assignedMentor ?? '');
      setRecommendedAction(activeInterventionDraft.recommended ?? '');
      setExpectedOutcome(activeInterventionDraft.expectedOutcome ?? '');
    }
  }, [activeInterventionDraft]);

  if (!interventionModalOpen || !activeInterventionDraft) return null;

  const brief = [
    `Startup: ${activeInterventionDraft.startupName || DASH}`,
    `Signal: ${activeInterventionDraft.problem || DASH}`,
    `Proposed action: ${recommendedAction || DASH}`,
    `Owner: ${mentor || DASH}`,
    `Intended outcome: ${expectedOutcome || DASH}`,
  ].join('\n');

  const hasContent =
    !!recommendedAction.trim() || !!mentor.trim() || !!expectedOutcome.trim();

  const handleCopy = () => {
    // Optional chaining short-circuits the whole chain when clipboard is absent
    // (insecure context), so nothing claims success there.
    navigator.clipboard?.writeText(brief).
      then(() => {
        toast({
          title: 'Brief copied',
          description: 'The text is on your clipboard. Nothing was written to this workspace.',
          variant: 'success',
        });
      }).
      catch(() => {
        toast({
          title: 'Copy failed',
          description: 'The browser refused clipboard access. Select the text and copy it manually.',
          variant: 'error',
        });
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0F1623] text-white shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Wrench className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Intervention Brief</h3>
              <p className="text-xs text-white/50">
                Drafted from the signal you opened &middot; not stored anywhere
              </p>
            </div>
          </div>

          <button
            onClick={closeInterventionModal}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          
          {/* Target Startup & Problem */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                Target Startup
              </span>
              {!!activeInterventionDraft.category && (
                <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/60">
                  {activeInterventionDraft.category}
                </span>
              )}
            </div>
            <div className="text-base font-bold text-white">
              {activeInterventionDraft.startupName || DASH}
            </div>
            <p className="text-xs text-white/60">
              Diagnosis: <strong className="text-white/80">{activeInterventionDraft.problem || DASH}</strong>
            </p>
          </div>

          {/* Intervention Action */}
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Proposed intervention action
            </label>
            <input
              type="text"
              value={recommendedAction}
              onChange={(e) => setRecommendedAction(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Assigned Mentor or Lead */}
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Who would run it
            </label>
            <div className="relative">
              <input
                type="text"
                value={mentor}
                onChange={(e) => setMentor(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 pl-9 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <UserCheck className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
            </div>
          </div>

          {/* Expected Outcome */}
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5">
              Intended outcome
            </label>
            <textarea
              rows={2}
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* The preview is what gets copied — there is no other destination. */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-3.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <FileText className="h-3.5 w-3.5 text-white/40" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Brief text</span>
            </div>
            <pre className="text-[11px] leading-relaxed text-white/70 whitespace-pre-wrap font-mono">{brief}</pre>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] text-amber-300/80 leading-snug">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
            This workspace does not record interventions. Logging one needs a cohort membership and a
            stored risk signal, and a candidate still in selection has neither &mdash; so the brief above
            is all this screen can honestly give you.
          </p>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-white/10">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeInterventionModal}
              className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCopy}
              disabled={!hasContent}
              className="bg-indigo-600 text-white font-semibold hover:bg-indigo-500 shadow-md flex items-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Brief
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
