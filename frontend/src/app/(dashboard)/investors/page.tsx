'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Layers, Microscope, Gavel, FileText, TrendingUp,
  Settings, Sparkles, RefreshCw, X, Clock, CheckCircle2,
} from 'lucide-react';
import { investorApi } from '@/lib/investorApi';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

import { InvestorDashboard } from '@/components/investor/InvestorDashboard';
import { DealFlowKanban } from '@/components/investor/DealFlowKanban';
import { UnderwritingWorkspace } from '@/components/investor/UnderwritingWorkspace';
import { ICDeliberationRoom } from '@/components/investor/ICDeliberationRoom';
import { TermSheetWorkspace } from '@/components/investor/TermSheetWorkspace';
import { PortfolioIntelligence } from '@/components/investor/PortfolioIntelligence';
import { InstitutionalSetup } from '@/components/investor/InstitutionalSetup';

type TabType = 'dashboard' | 'dealflow' | 'underwriting' | 'ic' | 'termsheets' | 'portfolio' | 'setup';

const REJECTION_REASONS = [
  { id: 'too_early', label: 'Too Early' },
  { id: 'weak_market', label: 'Weak Market' },
  { id: 'founder_concern', label: 'Founder Concern' },
  { id: 'regulatory', label: 'Regulatory Risk' },
  { id: 'competition', label: 'Competitive Landscape' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'evidence_insufficient', label: 'Insufficient Evidence' },
  { id: 'thesis_mismatch', label: 'Thesis Mismatch' },
  { id: 'unit_economics', label: 'Poor Unit Economics' },
  { id: 'traction', label: 'Insufficient Traction' },
  { id: 'capital_requirements', label: 'Capital Requirements' },
];

export default function InvestorOperatingSystemPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = React.useState<TabType>('dashboard');
  const [selectedDealId, setSelectedDealId] = React.useState<number | null>(null);
  const [selectedFirmId, setSelectedFirmId] = React.useState<number | null>(null);
  const [selectedFundId, setSelectedFundId] = React.useState<number | null>(null);

  // Modal state
  const [showRejectModal, setShowRejectModal] = React.useState(false);
  const [showWatchlistModal, setShowWatchlistModal] = React.useState(false);
  const [rejectReasons, setRejectReasons] = React.useState<string[]>([]);
  const [rejectNotes, setRejectNotes] = React.useState('');
  const [watchlistDate, setWatchlistDate] = React.useState('');
  const [watchlistTrigger, setWatchlistTrigger] = React.useState('');

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: firms = [], refetch: refetchFirms } = useQuery({
    queryKey: ['investor-firms'],
    queryFn: investorApi.getFirms,
  });

  const { data: funds = [], refetch: refetchFunds } = useQuery({
    queryKey: ['investor-funds', selectedFirmId],
    queryFn: () => investorApi.getFunds(selectedFirmId || undefined),
  });

  const { data: mandates = [], refetch: refetchMandates } = useQuery({
    queryKey: ['investor-mandates'],
    queryFn: investorApi.getMandates,
  });

  const { data: deals = [], refetch: refetchDeals } = useQuery({
    queryKey: ['investor-deals', selectedFundId],
    queryFn: () => investorApi.getDealFlow(selectedFundId ? { fund_id: selectedFundId } : undefined),
  });

  const { data: dealDetail, refetch: refetchDealDetail } = useQuery({
    queryKey: ['investor-deal-detail', selectedDealId],
    queryFn: () => (selectedDealId ? investorApi.getDealDetail(selectedDealId) : null),
    enabled: !!selectedDealId,
  });

  const { data: dashboardSummary, refetch: refetchDashboard } = useQuery({
    queryKey: ['investor-dashboard', selectedFundId],
    queryFn: () => investorApi.getDashboardSummary(selectedFundId || undefined),
    enabled: activeTab === 'dashboard',
  });

  const { data: portfolio = [], refetch: refetchPortfolio } = useQuery({
    queryKey: ['investor-portfolio', selectedFirmId],
    queryFn: () => investorApi.getPortfolio(selectedFirmId || undefined),
    enabled: activeTab === 'portfolio',
  });

  const { data: exposure, refetch: refetchExposure } = useQuery({
    queryKey: ['investor-exposure', selectedFirmId, selectedFundId],
    queryFn: () => investorApi.getFundExposure(
      selectedFirmId ? { firm_id: selectedFirmId, fund_id: selectedFundId || undefined } : undefined
    ),
    enabled: activeTab === 'portfolio',
  });

  const { data: availableStartups = [] } = useQuery({
    queryKey: ['investor-available-startups'],
    queryFn: investorApi.getAvailableStartups,
    enabled: activeTab === 'dealflow',
  });

  const { data: relationships = [], refetch: refetchRelationships } = useQuery({
    queryKey: ['investor-relationships', selectedFirmId],
    queryFn: () => investorApi.getRelationships(selectedFirmId || undefined),
    enabled: activeTab === 'setup',
  });

  // ─── Auto-select first firm/fund ────────────────────────────────────────────

  React.useEffect(() => {
    if (firms.length > 0 && !selectedFirmId) setSelectedFirmId(firms[0].id);
  }, [firms, selectedFirmId]);

  React.useEffect(() => {
    if (funds.length > 0 && !selectedFundId) setSelectedFundId(funds[0].id);
  }, [funds, selectedFundId]);

  React.useEffect(() => {
    if (deals.length > 0 && !selectedDealId) setSelectedDealId(deals[0].id);
  }, [deals, selectedDealId]);

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const seedMutation = useMutation({
    mutationFn: investorApi.seedDefaults,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investor-firms'] });
      queryClient.invalidateQueries({ queryKey: ['investor-deals'] });
      queryClient.invalidateQueries({ queryKey: ['investor-portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['investor-dashboard'] });
      alert('Seeded Savannah Alpha Capital, Fund II, investment cases, and portfolio companies.');
    },
    onError: (err: any) => alert(err?.response?.data?.detail || 'Seeding failed.'),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      investorApi.advanceStatus(id, status),
    onSuccess: () => { refetchDeals(); refetchDealDetail(); },
    onError: (err: any) => alert(err?.response?.data?.error || 'Status update failed.'),
  });

  const challengeMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      investorApi.challengeAssessment(id, payload),
    onSuccess: (data) => {
      refetchDealDetail();
      alert(`Challenge accepted. Score updated: ${data.old_score?.toFixed(1)} → ${data.new_underwriting_score?.toFixed(1)}`);
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Challenge failed.'),
  });

  const memoMutation = useMutation({
    mutationFn: (id: number) => investorApi.generateMemo(id),
    onSuccess: () => { refetchDealDetail(); alert('IC Memo generated successfully.'); },
    onError: (err: any) => alert(err?.response?.data?.detail || 'Memo generation failed.'),
  });

  const debateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      investorApi.addICDebate(id, payload),
    onSuccess: () => refetchDealDetail(),
    onError: (err: any) => alert(err?.response?.data?.error || 'Debate submission failed.'),
  });

  const voteMutation = useMutation({
    mutationFn: investorApi.castICVote,
    onSuccess: () => { refetchDealDetail(); alert('IC vote recorded.'); },
    onError: (err: any) => alert(err?.response?.data?.detail || 'Voting failed.'),
  });

  const closeMutation = useMutation({
    mutationFn: investorApi.acceptAndClose,
    onSuccess: () => {
      refetchDeals();
      refetchDealDetail();
      refetchPortfolio();
      alert('Deal closed. Company enrolled in Active Portfolio.');
    },
    onError: (err: any) => alert(err?.response?.data?.detail || 'Closing failed.'),
  });

  const resolveAlertMutation = useMutation({
    mutationFn: ({ companyId, alertId }: { companyId: number; alertId: number }) =>
      investorApi.resolveAlert(companyId, alertId),
    onSuccess: () => refetchPortfolio(),
    onError: (err: any) => alert(err?.response?.data?.detail || 'Could not resolve alert.'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      investorApi.rejectDeal(id, payload),
    onSuccess: () => {
      setShowRejectModal(false);
      setRejectReasons([]);
      setRejectNotes('');
      refetchDeals();
      refetchDealDetail();
      refetchDashboard();
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Rejection failed.'),
  });

  const watchlistMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      investorApi.addToWatchlist(id, payload),
    onSuccess: () => {
      setShowWatchlistModal(false);
      setWatchlistDate('');
      setWatchlistTrigger('');
      refetchDeals();
      refetchDealDetail();
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Watchlist action failed.'),
  });

  const ingestDealMutation = useMutation({
    mutationFn: investorApi.ingestDeal,
    onSuccess: (data) => {
      refetchDeals();
      refetchDashboard();
      alert(`Deal ingested: ${data.company_name} → ${data.status}`);
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Deal ingestion failed.'),
  });

  const recalculateFitMutation = useMutation({
    mutationFn: (id: number) => investorApi.recalculateFit(id),
    onSuccess: (data) => {
      refetchDealDetail();
      alert(`Thesis fit score updated: ${(data.thesis_fit_score * 100).toFixed(1)}%`);
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Recalculation failed.'),
  });

  const extractClaimsMutation = useMutation({
    mutationFn: (id: number) => investorApi.extractClaims(id),
    onSuccess: (data) => {
      refetchDealDetail();
      alert(`${data.claims_created} claims extracted from deck.`);
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Claim extraction failed.'),
  });

  const counterOfferMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      investorApi.proposeCounterOffer(id, payload),
    onSuccess: (data) => {
      refetchDealDetail();
      alert(`Counter-offer v${data.version_number} published and synced with founder portal.`);
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Counter-offer failed.'),
  });

  const updateMandateMutation = useMutation({
    mutationFn: ({ mandateId, payload }: { mandateId: number; payload: any }) =>
      investorApi.updateMandate(mandateId, payload),
    onSuccess: () => {
      refetchMandates();
      alert('Investment mandate policy updated. Thesis engine will use new rules on next evaluation.');
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Mandate update failed.'),
  });

  const createRelationshipMutation = useMutation({
    mutationFn: investorApi.createRelationship,
    onSuccess: () => {
      refetchRelationships();
      alert('Relationship edge saved to network graph.');
    },
    onError: (err: any) => alert(err?.response?.data?.error || 'Relationship creation failed.'),
  });

  const refetchAll = () => {
    refetchFirms();
    refetchFunds();
    refetchDeals();
    refetchDealDetail();
    refetchDashboard();
    if (activeTab === 'portfolio') { refetchPortfolio(); refetchExposure(); }
    if (activeTab === 'setup') refetchRelationships();
  };

  const activeFund = funds.find((f) => f.id === selectedFundId);

  // ─── Tab definitions ─────────────────────────────────────────────────────────

  const TABS: Array<{ id: TabType; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'dealflow', label: 'Deal Flow', icon: Layers, badge: deals.filter((d) => d.status === 'INBOX').length || undefined },
    { id: 'underwriting', label: 'Underwriting', icon: Microscope },
    { id: 'ic', label: 'IC Room', icon: Gavel, badge: deals.filter((d) => d.status === 'IC_REVIEW').length || undefined },
    { id: 'termsheets', label: 'Term Sheets', icon: FileText },
    { id: 'portfolio', label: 'Portfolio', icon: TrendingUp },
    { id: 'setup', label: 'Firm Setup', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 lg:p-8 space-y-8">
      {/* ── PAGE HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-neutral-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-semibold tracking-wide uppercase bg-violet-500/10 text-violet-400 border border-violet-500/20">
              Investment Operating System
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-mono bg-neutral-900 text-neutral-400 border border-neutral-800">
              Institutional Grade
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="text-neutral-500">{firms[0]?.name || 'Investment Firm'}</span>
            <span className="text-neutral-600 font-light">/</span>
            <span>{activeFund?.name || 'Select Fund'}</span>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Deal Sourcing → Thesis Fit → Forensic Underwriting → IC Deliberation → Term Sheet → Portfolio Intelligence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Fund selector */}
          <div className="relative">
            <select
              value={selectedFundId || ''}
              onChange={(e) => setSelectedFundId(Number(e.target.value))}
              className="bg-neutral-900 text-neutral-200 text-xs rounded-lg px-3 py-2 border border-neutral-800 focus:outline-none focus:border-violet-500 pr-8 cursor-pointer"
            >
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.firm_name} - {f.name} (${(parseFloat(f.fund_size_usd) / 1_000_000).toFixed(0)}M)
                </option>
              ))}
            </select>
          </div>

          {/* Reject + Watchlist quick actions for selected deal */}
          {selectedDealId && dealDetail && !['PORTFOLIO', 'PASSED'].includes(dealDetail.status) && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowWatchlistModal(true)}
                className="text-xs border-amber-700/40 text-amber-400 hover:bg-amber-900/20"
              >
                <Clock className="w-3.5 h-3.5 mr-1.5" /> Watchlist
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRejectModal(true)}
                className="text-xs border-red-800/40 text-red-400 hover:bg-red-900/20"
              >
                <X className="w-3.5 h-3.5 mr-1.5" /> Reject Deal
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="text-xs bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-300"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            Seed Firm Data
          </Button>

          <Button
            size="sm"
            onClick={refetchAll}
            className="text-xs bg-violet-600 hover:bg-violet-500 text-white font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Sync
          </Button>
        </div>
      </div>

      {/* ── NAVIGATION TABS ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-800">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors relative cursor-pointer',
                isActive
                  ? 'border-violet-500 text-violet-400 bg-violet-500/5'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
              )}
            >
              <Icon className={cn('w-4 h-4', isActive ? 'text-violet-400' : 'text-neutral-500')} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-xs font-mono',
                  isActive ? 'bg-violet-500/20 text-violet-300' : 'bg-neutral-800 text-neutral-400'
                )}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENTS ─────────────────────────────────────────────────────────── */}

      {activeTab === 'dashboard' && (
        <InvestorDashboard
          summary={dashboardSummary}
          funds={funds}
          selectedFundId={selectedFundId}
          onNavigateTab={(tab) => setActiveTab(tab as TabType)}
        />
      )}

      {activeTab === 'dealflow' && (
        <DealFlowKanban
          deals={deals}
          selectedDealId={selectedDealId}
          startups={availableStartups}
          onSelectDeal={(id) => { setSelectedDealId(id); setActiveTab('underwriting'); }}
          onAdvanceStatus={(id, st) => advanceMutation.mutate({ id, status: st })}
          onIngestDeal={(payload) => ingestDealMutation.mutate(payload)}
        />
      )}

      {activeTab === 'underwriting' && (
        <UnderwritingWorkspace
          deals={deals}
          selectedDealId={selectedDealId}
          dealDetail={dealDetail || null}
          onSelectDeal={setSelectedDealId}
          onChallengeScore={(payload) =>
            selectedDealId && challengeMutation.mutate({ id: selectedDealId, payload })
          }
          onGenerateMemo={() => selectedDealId && memoMutation.mutate(selectedDealId)}
          onAdvanceToIC={() =>
            selectedDealId && advanceMutation.mutate({ id: selectedDealId, status: 'IC_REVIEW' })
          }
          onRecalculateFit={() => selectedDealId && recalculateFitMutation.mutate(selectedDealId)}
          onExtractClaims={() => selectedDealId && extractClaimsMutation.mutate(selectedDealId)}
        />
      )}

      {activeTab === 'ic' && (
        <ICDeliberationRoom
          deals={deals}
          selectedDealId={selectedDealId}
          dealDetail={dealDetail || null}
          onSelectDeal={setSelectedDealId}
          onAddDebate={(payload) =>
            selectedDealId && debateMutation.mutate({ id: selectedDealId, payload })
          }
          onCastVote={voteMutation.mutate}
        />
      )}

      {activeTab === 'termsheets' && (
        <TermSheetWorkspace
          deals={deals}
          selectedDealId={selectedDealId}
          dealDetail={dealDetail || null}
          onSelectDeal={setSelectedDealId}
          onAcceptAndClose={closeMutation.mutate}
          onProposeCounterOffer={(termSheetId, payload) =>
            counterOfferMutation.mutate({ id: termSheetId, payload })
          }
        />
      )}

      {activeTab === 'portfolio' && (
        <PortfolioIntelligence
          portfolio={portfolio}
          exposure={exposure}
          onResolveAlert={(companyId, alertId) => resolveAlertMutation.mutate({ companyId, alertId })}
          onRefresh={() => { refetchPortfolio(); refetchExposure(); }}
        />
      )}

      {activeTab === 'setup' && (
        <InstitutionalSetup
          firms={firms}
          funds={funds}
          mandates={mandates}
          relationships={relationships}
          selectedFirmId={selectedFirmId}
          selectedFundId={selectedFundId}
          onSelectFirm={(id) => { setSelectedFirmId(id); setSelectedFundId(null); }}
          onSelectFund={setSelectedFundId}
          onUpdateMandate={(mandateId, payload) => updateMandateMutation.mutate({ mandateId, payload })}
          onCreateRelationship={(payload) => createRelationshipMutation.mutate(payload as any)}
        />
      )}

      {/* ── MODALS ──────────────────────────────────────────────────────────────── */}

      {/* Watchlist Modal */}
      <AnimatePresence>
        {showWatchlistModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-amber-700/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-400" /> Add to Watchlist
                </h3>
                <button onClick={() => setShowWatchlistModal(false)} className="text-neutral-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-neutral-400">
                Move <strong className="text-white">{dealDetail?.company_name}</strong> to Watchlist with structured re-assessment triggers.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Reassess Date</label>
                  <input
                    type="date"
                    value={watchlistDate}
                    onChange={(e) => setWatchlistDate(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Milestone Trigger</label>
                  <input
                    type="text"
                    value={watchlistTrigger}
                    onChange={(e) => setWatchlistTrigger(e.target.value)}
                    placeholder="e.g. Reassess once $30k MRR or 5 corporate pilots live"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowWatchlistModal(false)} className="text-xs">Cancel</Button>
                <Button
                  size="sm"
                  disabled={!watchlistDate}
                  onClick={() => selectedDealId && watchlistMutation.mutate({
                    id: selectedDealId,
                    payload: { reassess_date: watchlistDate, milestone_trigger: watchlistTrigger },
                  })}
                  className="text-xs bg-amber-600 hover:bg-amber-500 text-white"
                >
                  <Clock className="w-3.5 h-3.5 mr-1.5" /> Move to Watchlist
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rejection Modal */}
      <AnimatePresence>
        {showRejectModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-red-800/40 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <X className="w-5 h-5 text-red-400" /> Structured Rejection
                </h3>
                <button onClick={() => setShowRejectModal(false)} className="text-neutral-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-neutral-400">
                Reject <strong className="text-white">{dealDetail?.company_name}</strong>. Select rejection reasons to build institutional memory.
              </p>
              <div>
                <label className="text-xs text-neutral-400 block mb-2">Rejection Reasons</label>
                <div className="flex flex-wrap gap-2">
                  {REJECTION_REASONS.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setRejectReasons((prev) =>
                        prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]
                      )}
                      className={cn(
                        'text-xs px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer',
                        rejectReasons.includes(r.id)
                          ? 'bg-red-700 border-red-600 text-white'
                          : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                      )}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Notes (optional)</label>
                <textarea
                  rows={3}
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Additional context for institutional memory..."
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white resize-none focus:outline-none focus:border-red-500"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowRejectModal(false)} className="text-xs">Cancel</Button>
                <Button
                  size="sm"
                  disabled={rejectReasons.length === 0}
                  onClick={() => selectedDealId && rejectMutation.mutate({
                    id: selectedDealId,
                    payload: { rejection_reasons: rejectReasons, rejection_notes: rejectNotes },
                  })}
                  className="text-xs bg-red-700 hover:bg-red-600 text-white"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" /> Confirm Rejection ({rejectReasons.length})
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
