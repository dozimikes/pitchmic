'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Brain,
  Building2,
  Calendar,
  CheckSquare,
  FileSearch,
  Inbox,
  LayoutDashboard,
  Search,
  Sliders,
  Sparkles,
  Users2,
  Vote,
  X,
} from 'lucide-react';
import { useIntelligence } from '@/app/(dashboard)/accelerator/IntelligenceContext';
import { useActiveProgram } from '@/app/(dashboard)/accelerator/ProgramContext';
import { useQuery } from '@tanstack/react-query';
import { acceleratorApi } from '@/lib/acceleratorApi';

export function AcceleratorCommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, openIntelligenceDrawer } = useIntelligence();
  const { activeProgram } = useActiveProgram();
  const [query, setQuery] = React.useState('');
  const router = useRouter();

  const { data: applications = [] } = useQuery({
    queryKey: ['accelerator-applications', activeProgram?.id],
    queryFn: () => acceleratorApi.getApplications(activeProgram?.id),
    enabled: !!activeProgram?.id && commandPaletteOpen,
  });

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const navigateTo = (href: string) => {
    setCommandPaletteOpen(false);
    router.push(href);
  };

  const startupItems = applications.slice(0, 10).map((app, idx) => {
    const name = app.company_name || app.startup_name || `Applicant ${idx + 1}`;
    const readScore = app.startup_strength_score || app.readiness_score;
    return {
      label: `Inspect Startup: ${name} (${app.sector || 'Applicant'})`,
      icon: Building2,
      category: 'Startups',
      action: () => {
        setCommandPaletteOpen(false);
        openIntelligenceDrawer({
          title: `${name} Application Dossier`,
          entityName: name,
          category: app.sector || 'Applicant',
          severity: (readScore && readScore < 60) ? 'HIGH' : 'LOW',
          confidence: Math.round(app.evidence_confidence_score || 0),
          detectedAt: 'Current Intake Cycle',
          evidence: [
            `Stage: ${app.inferred_stage || app.declared_stage || 'Not recorded'}`,
            `Status: ${app.status}`,
            `Startup strength: ${readScore ? `${readScore.toFixed(0)}/100` : 'No data yet'}`,
            `Program fit: ${app.program_fit_score ? `${app.program_fit_score.toFixed(0)}/100` : 'No data yet'}`,
          ],
          sources: ['Application record'],
          model: 'ML-assisted screening',
        });
      },
    };
  });

  const COMMAND_ITEMS = [
    // Navigation — one entry per real sidebar item, exact routes.
    { label: 'Go to Dashboard · Command Center', icon: LayoutDashboard, category: 'Navigation', action: () => navigateTo('/accelerator') },
    { label: 'Go to Applications', icon: Inbox, category: 'Navigation', action: () => navigateTo('/accelerator/applications') },
    { label: 'Go to Review Queue', icon: CheckSquare, category: 'Navigation', action: () => navigateTo('/accelerator/review-queue') },
    { label: 'Go to Interviews', icon: Calendar, category: 'Navigation', action: () => navigateTo('/accelerator/interviews') },
    { label: 'Go to Due Diligence', icon: FileSearch, category: 'Navigation', action: () => navigateTo('/accelerator/due-diligence') },
    { label: 'Go to Decisions · Decision Room', icon: Vote, category: 'Navigation', action: () => navigateTo('/accelerator/decision-room') },
    { label: 'Go to Intelligence', icon: Brain, category: 'Navigation', action: () => navigateTo('/accelerator/intelligence') },
    { label: 'Go to Analytics & Reports', icon: BarChart3, category: 'Navigation', action: () => navigateTo('/accelerator/analytics') },
    { label: 'Go to Outcomes', icon: Activity, category: 'Navigation', action: () => navigateTo('/accelerator/outcomes') },
    { label: 'Go to Program Settings', icon: Sliders, category: 'Navigation', action: () => navigateTo('/accelerator/settings') },
    { label: 'Go to Cohorts Runtime', icon: Users2, category: 'Navigation (Program Operations)', action: () => navigateTo('/accelerator/cohorts') },

    // Real Startups (if any)
    ...startupItems,

    // Actions — ML produces evidence and recommendations; humans decide.
    { label: 'Run ML Screening on All Applications', icon: Sparkles, category: 'Operational Actions', action: () => navigateTo('/accelerator') },
    { label: 'Open Reviewer Consensus & Contradictions', icon: Brain, category: 'Operational Actions', action: () => navigateTo('/accelerator/intelligence?tab=contradictions') },
    { label: 'Generate Cohort Impact & Outcomes Report', icon: Activity, category: 'Operational Actions', action: () => navigateTo('/accelerator/outcomes') },
    { label: 'Configure the Selection Framework', icon: Sliders, category: 'Operational Actions', action: () => navigateTo('/accelerator/settings?section=evaluation') },
  ];

  const filteredItems = COMMAND_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#0F1623] text-white shadow-2xl overflow-hidden">
        
        {/* Search Input Bar */}
        <div className="relative border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <Search className="h-5 w-5 text-indigo-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search commands, startups, risk signals, or navigation hubs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder-white/40 focus:outline-none"
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="rounded p-1 text-white/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/40">
              No matching commands or entities found.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={item.action}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-white/5 transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 text-white/60 transition">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-medium text-white/90 group-hover:text-white">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-semibold text-white/40 group-hover:text-white/70">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="border-t border-white/5 px-4 py-2 bg-black/40 flex items-center justify-between text-[11px] text-white/40">
          <span>Navigate with <code>↑</code> <code>↓</code> and <code>Enter</code></span>
          <span><code>Esc</code> to dismiss</span>
        </div>
      </div>
    </div>
  );
}
