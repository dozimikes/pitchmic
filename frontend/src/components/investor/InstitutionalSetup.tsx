'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, DollarSign, Globe, Layers, Users, Tag,
  CheckCircle2, Info, Edit3, Plus, Network, UserCheck, Sparkles, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InvestmentFirm, InvestmentFund, InvestmentMandate, RelationshipEdge } from '@/lib/investorApi';
import { Button } from '@/components/ui/Button';

interface InstitutionalSetupProps {
  firms: InvestmentFirm[];
  funds: InvestmentFund[];
  mandates: InvestmentMandate[];
  relationships?: RelationshipEdge[];
  selectedFirmId: number | null;
  selectedFundId: number | null;
  onSelectFirm: (id: number) => void;
  onSelectFund: (id: number) => void;
  onUpdateMandate?: (mandateId: number, payload: Partial<InvestmentMandate>) => void;
  onCreateRelationship?: (payload: Partial<RelationshipEdge>) => void;
}

const ROLE_COLORS: Record<string, string> = {
  GP: 'bg-violet-900/40 text-violet-300 border-violet-700/40',
  MANAGING_PARTNER: 'bg-violet-900/30 text-violet-400 border-violet-700/30',
  PARTNER: 'bg-blue-900/30 text-blue-400 border-blue-700/30',
  PRINCIPAL: 'bg-teal-900/30 text-teal-400 border-teal-700/30',
  INVESTMENT_DIRECTOR: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/30',
  INVESTMENT_MANAGER: 'bg-green-900/30 text-green-400 border-green-700/30',
  ASSOCIATE: 'bg-amber-900/30 text-amber-400 border-amber-700/30',
  ANALYST: 'bg-orange-900/30 text-orange-400 border-orange-700/30',
  SCOUT: 'bg-rose-900/30 text-rose-400 border-rose-700/30',
  OPERATING_PARTNER: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  IC_MEMBER: 'bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-700/30',
  ADMIN: 'bg-neutral-800 text-neutral-500 border-neutral-700',
};

function MandatePill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className={cn('inline-flex px-2.5 py-1 rounded-full text-xs font-medium border', color || 'bg-neutral-800 text-neutral-300 border-neutral-700')}>
      {children}
    </span>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-neutral-800 bg-neutral-900/40">
        <Icon className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function InstitutionalSetup({
  firms, funds, mandates, relationships = [], selectedFirmId, selectedFundId,
  onSelectFirm, onSelectFund, onUpdateMandate, onCreateRelationship,
}: InstitutionalSetupProps) {
  const firm = firms.find((f) => f.id === selectedFirmId) || firms[0];
  const fund = funds.find((f) => f.id === selectedFundId) || funds[0];
  const mandate = mandates.find((m) => m.fund === fund?.id);

  // Edit Mandate Modal State
  const [showMandateModal, setShowMandateModal] = React.useState(false);
  const [geoInput, setGeoInput] = React.useState('');
  const [sectorInput, setSectorInput] = React.useState('');
  const [stageInput, setStageInput] = React.useState('');
  const [exclusionInput, setExclusionInput] = React.useState('');
  const [minRevInput, setMinRevInput] = React.useState('0');
  const [preRevAllowed, setPreRevAllowed] = React.useState(true);
  const [thesisSummary, setThesisSummary] = React.useState('');

  // Add Contact Modal State
  const [showContactModal, setShowContactModal] = React.useState(false);
  const [contactName, setContactName] = React.useState('');
  const [contactOrg, setContactOrg] = React.useState('');
  const [contactEmail, setContactEmail] = React.useState('');
  const [contactType, setContactType] = React.useState('former_colleague');
  const [contactWarmth, setContactWarmth] = React.useState(0.85);
  const [contactNotes, setContactNotes] = React.useState('');

  const handleOpenMandateEdit = () => {
    if (!mandate) return;
    setGeoInput((mandate.geography_whitelist || []).join(', '));
    setSectorInput((mandate.sector_whitelist || []).join(', '));
    setStageInput((mandate.stage_rules || []).join(', '));
    setExclusionInput((mandate.exclusion_list || []).join(', '));
    setMinRevInput(mandate.min_revenue_usd || '0');
    setPreRevAllowed(mandate.pre_revenue_allowed);
    setThesisSummary(mandate.thesis_summary || '');
    setShowMandateModal(true);
  };

  const handleSaveMandate = () => {
    if (!mandate || !onUpdateMandate) return;
    onUpdateMandate(mandate.id, {
      geography_whitelist: geoInput.split(',').map((s) => s.trim()).filter(Boolean),
      sector_whitelist: sectorInput.split(',').map((s) => s.trim()).filter(Boolean),
      stage_rules: stageInput.split(',').map((s) => s.trim()).filter(Boolean),
      exclusion_list: exclusionInput.split(',').map((s) => s.trim()).filter(Boolean),
      min_revenue_usd: minRevInput,
      pre_revenue_allowed: preRevAllowed,
      thesis_summary: thesisSummary,
    });
    setShowMandateModal(false);
  };

  const handleSaveContact = () => {
    if (!firm || !onCreateRelationship || !firm.members.length) return;
    onCreateRelationship({
      firm: firm.id,
      member: firm.members[0].id,
      target_person_name: contactName,
      target_organization: contactOrg,
      target_email: contactEmail,
      connection_type: contactType,
      strength_score: contactWarmth,
      notes: contactNotes,
    });
    setShowContactModal(false);
    setContactName('');
    setContactOrg('');
    setContactEmail('');
    setContactNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Firm + Fund selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Firm</label>
          <select
            value={selectedFirmId || ''}
            onChange={(e) => onSelectFirm(Number(e.target.value))}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
          >
            {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Fund</label>
          <select
            value={selectedFundId || ''}
            onChange={(e) => onSelectFund(Number(e.target.value))}
            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
          >
            {funds.filter((f) => !selectedFirmId || f.firm === selectedFirmId).map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* FIRM PROFILE */}
        {firm && (
          <Section title="Firm Profile" icon={Building2}>
            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-bold text-white">{firm.name}</h2>
                {firm.website && (
                  <a href={firm.website} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 mt-0.5 block"
                  >
                    {firm.website}
                  </a>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'HQ', val: firm.headquarters },
                  { label: 'Fund Type', val: firm.fund_type.replace('_', ' ').toUpperCase() },
                  { label: 'Founded', val: firm.founded_year ? String(firm.founded_year) : '-' },
                  { label: 'AUM', val: `$${(parseFloat(firm.aum_usd) / 1_000_000).toFixed(0)}M` },
                ].map((m) => (
                  <div key={m.label} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{m.label}</div>
                    <div className="text-sm font-semibold text-white mt-0.5">{m.val}</div>
                  </div>
                ))}
              </div>
              {firm.investment_regions && (
                <div>
                  <div className="text-xs text-neutral-500 mb-1.5">Investment Regions</div>
                  <div className="flex flex-wrap gap-1.5">
                    {firm.investment_regions.split(',').map((r) => (
                      <MandatePill key={r} color="bg-blue-900/20 text-blue-300 border-blue-800/30">{r.trim()}</MandatePill>
                    ))}
                  </div>
                </div>
              )}

              {/* Team */}
              {firm.members?.length > 0 && (
                <div>
                  <div className="text-xs text-neutral-500 mb-2 uppercase tracking-wide font-medium">Team</div>
                  <div className="space-y-2">
                    {firm.members.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-neutral-800/30 border border-neutral-700/50">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {(m.user_name || m.user_email || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-white truncate">{m.user_name || m.user_email}</div>
                          <div className="text-[10px] text-neutral-500">{m.title}</div>
                        </div>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0', ROLE_COLORS[m.institutional_role] || 'bg-neutral-800 text-neutral-400 border-neutral-700')}>
                          {m.institutional_role.replace('_', ' ')}
                        </span>
                        <div className="flex gap-1 shrink-0">
                          {m.can_vote_ic && <span title="IC Voting" className="text-[10px] px-1 py-0.5 rounded bg-fuchsia-900/20 text-fuchsia-500 border border-fuchsia-800/30">IC</span>}
                          {m.can_issue_term_sheet && <span title="Term Sheet" className="text-[10px] px-1 py-0.5 rounded bg-emerald-900/20 text-emerald-500 border border-emerald-800/30">TS</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* FUND SETUP */}
        {fund && (
          <Section title="Fund Setup" icon={DollarSign}>
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-white">{fund.name}</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Vintage {fund.vintage_year}</p>
              </div>

              {/* Fund Size Progress */}
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-neutral-400">Deployment Progress</span>
                  <span className="text-white font-mono">
                    ${(parseFloat(fund.deployed_capital_usd) / 1_000_000).toFixed(1)}M /
                    ${(parseFloat(fund.fund_size_usd) / 1_000_000).toFixed(0)}M
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-neutral-800 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (parseFloat(fund.deployed_capital_usd) / parseFloat(fund.fund_size_usd)) * 100)}%` }}
                    transition={{ duration: 1 }}
                    className="h-full rounded-full bg-gradient-to-r from-violet-600 to-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Stage Focus', val: fund.stage_focus.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) },
                  { label: 'Check Range', val: `$${(parseFloat(fund.min_check_size_usd) / 1000).toFixed(0)}k–$${(parseFloat(fund.max_check_size_usd) / 1_000_000).toFixed(1)}M` },
                  { label: 'Target Ownership', val: `${fund.target_ownership_pct_min}–${fund.target_ownership_pct_max}%` },
                  { label: 'Reserves', val: fund.has_reserves ? `Yes (${(fund.reserves_ratio * 100).toFixed(0)}%)` : 'No' },
                  { label: 'Active Cases', val: String(fund.active_cases_count) },
                  { label: 'Status', val: fund.is_active ? 'Active' : 'Closed' },
                ].map((m) => (
                  <div key={m.label} className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wide">{m.label}</div>
                    <div className="text-sm font-semibold text-white mt-0.5">{m.val}</div>
                  </div>
                ))}
              </div>

              {fund.geography_focus && (
                <div>
                  <div className="text-xs text-neutral-500 mb-1.5 uppercase tracking-wide font-medium">Geography</div>
                  <div className="flex flex-wrap gap-1.5">
                    {fund.geography_focus.split(',').map((g) => (
                      <MandatePill key={g} color="bg-emerald-900/20 text-emerald-300 border-emerald-800/30">
                        <Globe className="w-2.5 h-2.5 inline mr-1" />{g.trim()}
                      </MandatePill>
                    ))}
                  </div>
                </div>
              )}

              {fund.sector_focus && (
                <div>
                  <div className="text-xs text-neutral-500 mb-1.5 uppercase tracking-wide font-medium">Sectors</div>
                  <div className="flex flex-wrap gap-1.5">
                    {fund.sector_focus.split(',').map((s) => (
                      <MandatePill key={s} color="bg-blue-900/20 text-blue-300 border-blue-800/30">
                        <Tag className="w-2.5 h-2.5 inline mr-1" />{s.trim()}
                      </MandatePill>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}
      </div>

      {/* RELATIONSHIP INTELLIGENCE GRAPH SECTION */}
      <Section title="Relationship Intelligence Network (Affinity Graph)" icon={Network}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-400">
              Institutional network edges connecting partners, portfolio CEOs, alumni, and syndicate co-investors for warm-path routing.
            </p>
            {onCreateRelationship && (
              <Button
                size="sm"
                onClick={() => setShowContactModal(true)}
                className="text-xs bg-violet-600 hover:bg-violet-500 text-white"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Network Contact
              </Button>
            )}
          </div>

          {relationships.length === 0 ? (
            <p className="text-neutral-600 text-xs text-center py-6 border border-dashed border-neutral-800 rounded-xl">
              No relationship edges logged yet. Seed defaults or click "Add Network Contact".
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {relationships.map((rel) => (
                <div key={rel.id} className="p-3 rounded-xl bg-neutral-800/40 border border-neutral-700/60 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white truncate">{rel.target_person_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/30 text-violet-300 border border-violet-700/40 font-mono">
                      {(rel.strength_score * 100).toFixed(0)}% warmth
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400">{rel.target_organization}</div>
                  <div className="text-[10px] text-violet-400 font-medium">
                    {rel.connection_type_display || rel.connection_type.replace('_', ' ')}
                  </div>
                  {rel.notes && <p className="text-[11px] text-neutral-400/80 italic mt-1">{rel.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* MACHINE-READABLE MANDATE */}
      {mandate && (
        <Section title="Machine-Readable Investment Mandate" icon={Layers}>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-400">{mandate.thesis_summary}</p>
              {onUpdateMandate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenMandateEdit}
                  className="text-xs border-violet-700/50 text-violet-400 hover:bg-violet-900/20"
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit Mandate Rules
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: 'Stage Rules', items: mandate.stage_rules, color: 'bg-violet-900/20 text-violet-300 border-violet-800/30' },
                { label: 'Geography Whitelist', items: mandate.geography_whitelist, color: 'bg-emerald-900/20 text-emerald-300 border-emerald-800/30' },
                { label: 'Sector Whitelist', items: mandate.sector_whitelist, color: 'bg-blue-900/20 text-blue-300 border-blue-800/30' },
                { label: 'Exclusions', items: mandate.exclusion_list, color: 'bg-red-900/20 text-red-300 border-red-800/30' },
                { label: 'Moat Signals', items: mandate.target_moat_signals, color: 'bg-amber-900/20 text-amber-300 border-amber-800/30' },
              ].map(({ label, items, color }) => (
                <div key={label}>
                  <div className="text-xs text-neutral-500 mb-1.5 uppercase tracking-wide font-medium">{label}</div>
                  {items.length === 0
                    ? <span className="text-neutral-700 text-xs italic">Not configured</span>
                    : <div className="flex flex-wrap gap-1.5">{items.map((item) => <MandatePill key={item} color={color}>{item}</MandatePill>)}</div>
                  }
                </div>
              ))}

              <div>
                <div className="text-xs text-neutral-500 mb-1.5 uppercase tracking-wide font-medium">Revenue Requirements</div>
                <div className="p-3 rounded-xl bg-neutral-800/50 border border-neutral-700 space-y-1">
                  <div className="text-xs flex justify-between">
                    <span className="text-neutral-400">Min. Revenue</span>
                    <span className="text-white font-mono">${parseFloat(mandate.min_revenue_usd).toLocaleString()}</span>
                  </div>
                  <div className="text-xs flex justify-between">
                    <span className="text-neutral-400">Pre-Revenue OK</span>
                    <span className={mandate.pre_revenue_allowed ? 'text-emerald-400' : 'text-red-400'}>
                      {mandate.pre_revenue_allowed ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Founder preferences */}
            {Object.keys(mandate.founder_preferences).length > 0 && (
              <div>
                <div className="text-xs text-neutral-500 mb-1.5 uppercase tracking-wide font-medium">Founder Preferences</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(mandate.founder_preferences).map(([key, val]) => (
                    <div key={key} className={cn(
                      'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border',
                      val ? 'bg-emerald-900/20 text-emerald-300 border-emerald-800/30' : 'bg-neutral-800 text-neutral-500 border-neutral-700'
                    )}>
                      {val ? <CheckCircle2 className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                      {key.replace(/_/g, ' ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* JSON preview */}
            <div>
              <div className="text-xs text-neutral-500 mb-1.5 uppercase tracking-wide font-medium">Raw Mandate Schema</div>
              <pre className="text-[10px] font-mono text-neutral-400 bg-neutral-950 border border-neutral-800 rounded-xl p-4 overflow-x-auto leading-relaxed">
                {JSON.stringify({
                  stage_rules: mandate.stage_rules,
                  geography_whitelist: mandate.geography_whitelist,
                  sector_whitelist: mandate.sector_whitelist,
                  min_revenue_usd: mandate.min_revenue_usd,
                  pre_revenue_allowed: mandate.pre_revenue_allowed,
                  exclusion_list: mandate.exclusion_list,
                  target_moat_signals: mandate.target_moat_signals,
                  founder_preferences: mandate.founder_preferences,
                }, null, 2)}
              </pre>
            </div>
          </div>
        </Section>
      )}

      {/* Edit Mandate Modal */}
      <AnimatePresence>
        {showMandateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-violet-700/40 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-violet-400" /> Edit Investment Mandate Policy
                </h3>
                <button onClick={() => setShowMandateModal(false)} className="text-neutral-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-neutral-400 block mb-1">Thesis Summary</label>
                  <textarea
                    rows={2}
                    value={thesisSummary}
                    onChange={(e) => setThesisSummary(e.target.value)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2.5 text-white resize-none"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Geography Whitelist (Comma-separated)</label>
                  <input
                    type="text"
                    value={geoInput}
                    onChange={(e) => setGeoInput(e.target.value)}
                    placeholder="Nigeria, Kenya, South Africa, Egypt, Ghana"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Sector Whitelist (Comma-separated)</label>
                  <input
                    type="text"
                    value={sectorInput}
                    onChange={(e) => setSectorInput(e.target.value)}
                    placeholder="Fintech, Logistics, B2B SaaS, Climate"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Exclusions (Comma-separated)</label>
                  <input
                    type="text"
                    value={exclusionInput}
                    onChange={(e) => setExclusionInput(e.target.value)}
                    placeholder="Crypto speculative, Gambling, Weapons"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-neutral-400 block mb-1">Min. Monthly Revenue (USD)</label>
                    <input
                      type="number"
                      value={minRevInput}
                      onChange={(e) => setMinRevInput(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input
                      type="checkbox"
                      id="preRevCheck"
                      checked={preRevAllowed}
                      onChange={(e) => setPreRevAllowed(e.target.checked)}
                      className="accent-violet-500 w-4 h-4 cursor-pointer"
                    />
                    <label htmlFor="preRevCheck" className="text-neutral-300 cursor-pointer">Allow Pre-Revenue</label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <Button variant="outline" size="sm" onClick={() => setShowMandateModal(false)} className="text-xs">
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveMandate} className="text-xs bg-violet-600 hover:bg-violet-500 text-white">
                  Save Mandate & Update Engine
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showContactModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-neutral-900 border border-violet-700/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-violet-400" /> Add Network Relationship Edge
                </h3>
                <button onClick={() => setShowContactModal(false)} className="text-neutral-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-neutral-400 block mb-1">Contact Full Name</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Shola Akinlade"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Organization / Former Company</label>
                  <input
                    type="text"
                    value={contactOrg}
                    onChange={(e) => setContactOrg(e.target.value)}
                    placeholder="e.g. Paystack / YC Alumni"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-neutral-400 block mb-1">Connection Type</label>
                    <select
                      value={contactType}
                      onChange={(e) => setContactType(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white"
                    >
                      <option value="former_colleague">Former Colleague</option>
                      <option value="portfolio_founder">Portfolio CEO</option>
                      <option value="co_investor">Syndicate Co-Investor</option>
                      <option value="scout_network">Venture Scout</option>
                      <option value="alumni_network">University / Accelerator Alumni</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-neutral-400 block mb-1">Warmth Index (0-1.0)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="1.0"
                      value={contactWarmth}
                      onChange={(e) => setContactWarmth(Number(e.target.value))}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-neutral-400 block mb-1">Relationship Context Notes</label>
                  <textarea
                    rows={2}
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    placeholder="e.g. Co-invested in logistics seed round; responsive via Signal."
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2.5 text-white resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
                <Button variant="outline" size="sm" onClick={() => setShowContactModal(false)} className="text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!contactName.trim()}
                  onClick={handleSaveContact}
                  className="text-xs bg-violet-600 hover:bg-violet-500 text-white"
                >
                  Save Relationship Edge
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
