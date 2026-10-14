'use client';

import * as React from 'react';
import {
  Building2,
  Sliders,
  Palette,
  Layers,
  FileText,
  Workflow,
  Users,
  ShieldCheck,
  Brain,
  Mail,
  Share2,
  Database,
  Lock,
  History,
  LayoutDashboard,
  Target,
  ScanSearch,
  Gavel,
  CalendarClock,
  CalendarRange,
  Inbox,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type SettingsSectionKey =
  | 'overview'
  | 'eligibility'
  | 'evaluation'
  | 'screening'
  | 'intelligence'
  | 'workflow'
  | 'interview-decision'
  | 'general'
  | 'profile'
  | 'branding'
  | 'programs'
  | 'cycles'
  | 'intake'
  | 'members'
  | 'roles'
  | 'communications'
  | 'integrations'
  | 'data-privacy'
  | 'security'
  | 'audit'
  | 'danger-zone';

interface NavItem {
  key: SettingsSectionKey;
  label: string;
  badge?: string;
  icon?: LucideIcon;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

// Methodology-first IA: the selection methodology comes first, program
// operations (branding, intake defaults, org) are demoted below it.
// Every item here must map to a section that persists something real; a
// section that only re-displays another one's data is not a nav item.
export const SETTINGS_NAV_GROUPS: NavGroup[] = [
  {
    group: 'Selection Methodology',
    items: [
      { key: 'eligibility', label: 'Eligibility', icon: ScanSearch },
      { key: 'evaluation', label: 'Selection Framework', icon: Target },
      { key: 'intelligence', label: 'ML Governance', icon: Brain },
    ],
  },
  {
    group: 'Review & Decision',
    items: [
      { key: 'workflow', label: 'Review Workflow', icon: Workflow },
      { key: 'interview-decision', label: 'Interview & Decision', icon: CalendarClock },
    ],
  },
  {
    group: 'Program Operations',
    items: [
      { key: 'programs', label: 'Programs', icon: Layers },
      { key: 'cycles', label: 'Intake Cycles', icon: CalendarRange },
      // The queue of applications that arrived from outside the dashboard. Its
      // size is read from the server on that screen; a number here would be a
      // second count to keep in sync, and would be wrong the moment anyone posted.
      { key: 'intake', label: 'Intake & Import', icon: Inbox },
      // Named for what it actually writes (question_config.intake_defaults):
      // intake mode, review rounds, reviewer minimum, retention windows.
      { key: 'screening', label: 'Application & Intake Defaults', icon: Sliders },
      { key: 'general', label: 'General', icon: Building2 },
      // Read-only: every field here comes from the session and the active program,
      // so the label says what it is rather than implying an editable profile.
      { key: 'profile', label: 'Account & Session Context', icon: FileText },
      { key: 'branding', label: 'Branding', icon: Palette },
    ],
  },
  {
    group: 'People & Access',
    items: [
      // No member count badge: the roster is queried by the Members screen
      // itself, and a number hard-coded here would be counting nobody.
      { key: 'members', label: 'Members', icon: Users },
      { key: 'roles', label: 'Team & Permissions', icon: ShieldCheck },
    ],
  },
  {
    group: 'Notifications & Data',
    items: [
      { key: 'communications', label: 'Notifications', icon: Mail },
      { key: 'data-privacy', label: 'Data & Privacy', icon: Database },
      { key: 'integrations', label: 'Integrations', icon: Share2 },
    ],
  },
  {
    group: 'Security & Audit',
    items: [
      { key: 'security', label: 'Security & Sessions', icon: Lock },
      { key: 'audit', label: 'Audit Log', icon: History },
    ],
  },
  {
    group: 'System',
    items: [
      { key: 'danger-zone', label: 'Danger Zone', icon: Gavel },
    ],
  },
];

interface SettingsSidebarProps {
  activeSection: SettingsSectionKey;
  onSelectSection: (key: SettingsSectionKey) => void;
  searchQuery: string;
}

export function SettingsSidebar({
  activeSection,
  onSelectSection,
  searchQuery,
}: SettingsSidebarProps) {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return (
    <aside className="w-full md:w-64 shrink-0 space-y-6">
      {/* Overview Button */}
      <button
        onClick={() => onSelectSection('overview')}
        className={cn(
          'w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all',
          activeSection === 'overview'
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
            : 'text-white/70 hover:text-white hover:bg-white/5'
        )}
      >
        <div className="flex items-center gap-2.5">
          <LayoutDashboard className="h-4 w-4" />
          <span>Settings Overview</span>
        </div>
        <span className="text-[10px] uppercase font-mono tracking-wider opacity-60">HUB</span>
      </button>

      <div className="space-y-5">
        {SETTINGS_NAV_GROUPS.map((group) => {
          const filteredItems = group.items.filter((item) =>
            item.label.toLowerCase().includes(normalizedQuery) ||
            group.group.toLowerCase().includes(normalizedQuery)
          );

          if (normalizedQuery && filteredItems.length === 0) return null;

          return (
            <div key={group.group} className="space-y-1">
              <h4 className="px-3 text-[10px] font-black uppercase tracking-widest text-white/40">
                {group.group}
              </h4>
              <nav className="space-y-0.5">
                {filteredItems.map((item) => {
                  const Icon = item.icon || Layers;
                  const isActive = activeSection === item.key;
                  const isDanger = item.key === 'danger-zone';

                  return (
                    <button
                      key={item.key}
                      onClick={() => onSelectSection(item.key)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition text-left',
                        isActive
                          ? isDanger
                            ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
                            : 'bg-white/10 text-white font-bold border border-white/15'
                          : isDanger
                          ? 'text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-indigo-400' : isDanger ? 'text-rose-400' : 'text-white/40')} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={cn(
                            'text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0',
                            isActive
                              ? 'bg-indigo-500/30 text-indigo-200'
                              : 'bg-white/10 text-white/50'
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
