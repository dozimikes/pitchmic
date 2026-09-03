'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Mic,
  Home,
  HandCoins,
  Lightbulb,
  User,
  Building2,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Brain,
  MessageSquare,
  Bell,
  FolderLock,
  ArrowLeftRight,
  Rocket,
  Briefcase,
  ShieldCheck,
  Layers,
  Activity,
  Users,
  Key,
  FileText,
  Award,
  CheckSquare,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/lib/types';

export interface SidebarProps {
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface MenuItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string | undefined }>;
  badge?: string;
  section: 'main' | 'manage' | 'account';
}

const ADMIN_MENU: MenuItem[] = [
  { href: '/admin', label: 'Overview & Telemetry', icon: Activity, section: 'main', badge: 'Live' },
  { href: '/admin#users', label: 'User Directory', icon: Users, section: 'main' },
  { href: '/accelerator', label: 'Cohort Pipeline', icon: Layers, section: 'main', badge: 'Batches' },
  { href: '/intelligence#api-keys', label: 'Enterprise API Keys', icon: Key, section: 'main' },
  { href: '/admin#audit', label: 'Audit Logs & NDPR', icon: ShieldCheck, section: 'manage', badge: 'GDPR' },
  { href: '/analytics', label: 'Platform Analytics', icon: BarChart3, section: 'manage' },
  { href: '/settings', label: 'Admin Settings', icon: Settings, section: 'account' },
];

const ACCELERATOR_MENU: MenuItem[] = [
  { href: '/accelerator', label: 'Cohort Intake Funnel', icon: Layers, section: 'main', badge: 'C-12' },
  { href: '/accelerator#triage', label: 'Applicant Triage', icon: Mic, section: 'main', badge: 'Active' },
  { href: '/accelerator#rubric', label: '8-Pillar Scoring', icon: Award, section: 'main' },
  { href: '/accelerator#voting', label: 'Committee Votes', icon: CheckSquare, section: 'main' },
  { href: '/accelerator#sync', label: 'Antler Hub Sync', icon: RefreshCw, section: 'main', badge: 'API' },
  { href: '/newsfeed', label: 'Dealflow Radar', icon: Home, section: 'manage' },
  { href: '/offers', label: 'Syndicate Term Sheets', icon: HandCoins, section: 'manage' },
  { href: '/dataroom', label: 'DataRoom Diligence', icon: FolderLock, section: 'manage' },
  { href: '/messages', label: 'Inbound Messages', icon: MessageSquare, section: 'manage', badge: '3' },
  { href: '/profile/edit', label: 'Accelerator Profile', icon: User, section: 'account' },
  { href: '/settings', label: 'Settings', icon: Settings, section: 'account' },
];

const INVESTOR_MENU: MenuItem[] = [
  { href: '/newsfeed', label: 'Live Deal Stream', icon: Home, section: 'main', badge: 'Deals' },
  { href: '/discover', label: 'Deal Discovery Radar', icon: Sparkles, section: 'main', badge: 'Match' },
  { href: '/intelligence', label: 'VC Forensics & AI', icon: Brain, section: 'main', badge: 'PRO' },
  { href: '/offers', label: 'Term Sheets & Offers', icon: HandCoins, section: 'main', badge: 'Active' },
  { href: '/dataroom', label: 'Diligence DataRooms', icon: FolderLock, section: 'main' },
  { href: '/analytics', label: 'Portfolio ROI & Heatmap', icon: BarChart3, section: 'manage' },
  { href: '/messages', label: 'Direct Messages', icon: MessageSquare, section: 'manage' },
  { href: '/notifications', label: 'Notifications', icon: Bell, section: 'manage' },
  { href: '/profile/edit', label: 'Investor Profile', icon: User, section: 'account' },
  { href: '/settings', label: 'Settings', icon: Settings, section: 'account' },
];

const STARTUP_MENU: MenuItem[] = [
  { href: '/pitches', label: 'Founder Studio & Pitches', icon: Lightbulb, section: 'main', badge: 'Live' },
  { href: '/pitches/new', label: 'Record Pitch Deck', icon: Mic, section: 'main', badge: 'Studio' },
  { href: '/fundability', label: '8-Pillar Fundability', icon: ShieldCheck, section: 'main', badge: 'AI Audit' },
  { href: '/company', label: 'Company Profile', icon: Building2, section: 'main' },
  { href: '/offers', label: 'Offers Received', icon: HandCoins, section: 'manage', badge: 'Offers' },
  { href: '/dataroom', label: 'DataRoom Vault', icon: FolderLock, section: 'manage' },
  { href: '/analytics', label: 'Traction & SAFE Calc', icon: BarChart3, section: 'manage' },
  { href: '/newsfeed', label: 'Peer Ecosystem Feed', icon: Home, section: 'manage' },
  { href: '/messages', label: 'Direct Messages', icon: MessageSquare, section: 'manage' },
  { href: '/profile/edit', label: 'Profile', icon: User, section: 'account' },
  { href: '/settings', label: 'Settings', icon: Settings, section: 'account' },
];

export function Sidebar({
  className,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isStartup, isInvestor, isAccelerator, isAdminMode, canSwitchRole, activeRole, setActiveRole, toggleRole } = useAuth();

  const allowedItems = React.useMemo(() => {
    if (isAdminMode) return ADMIN_MENU;
    if (isAccelerator) return ACCELERATOR_MENU;
    if (isInvestor) return INVESTOR_MENU;
    return STARTUP_MENU;
  }, [isAdminMode, isAccelerator, isInvestor]);

  const groupedItems = {
    main: allowedItems.filter((i) => i.section === 'main'),
    manage: allowedItems.filter((i) => i.section === 'manage'),
    account: allowedItems.filter((i) => i.section === 'account'),
  };

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r border-slate-200 bg-white',
        collapsed ? 'w-16' : 'w-64',
        'transition-[width] duration-300 ease-in-out',
        className
      )}
    >
      <div className={cn(
        "flex h-16 shrink-0 items-center border-b border-slate-200 transition-all",
        collapsed ? "justify-center px-2" : "justify-between px-4"
      )}>
        <Link
          href="/newsfeed"
          className="flex items-center justify-center"
          title="PitchMic"
        >
          <Logo size="sm" variant={collapsed ? 'icon' : 'full'} priority />
        </Link>
        {onToggleCollapse && !collapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="hidden h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:inline-flex transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Superuser / Admin Role Switcher with Admin | Accelerator | Investor | Startup buttons */}
      {canSwitchRole && !collapsed && (
        <div className="p-2.5 border-b border-slate-100 bg-slate-50/80">
          <div className="px-1 pb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Superuser Switcher
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 uppercase">
              {isAdminMode ? 'ADMIN' : isAccelerator ? 'ACCELERATOR' : isInvestor ? 'INVESTOR' : 'STARTUP'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-1 rounded-xl">
            {/* Admin */}
            <button
              type="button"
              onClick={() => {
                setActiveRole(UserRole.ADMIN);
                router.push('/admin');
              }}
              className={cn(
                'flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-all text-[10px] font-bold',
                isAdminMode
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              )}
              title="Admin Dashboard"
            >
              <ShieldCheck className={cn('h-3.5 w-3.5 mb-0.5', isAdminMode ? 'text-emerald-400' : 'text-slate-500')} />
              <span>Admin</span>
            </button>

            {/* Accelerator */}
            <button
              type="button"
              onClick={() => {
                setActiveRole(UserRole.ACCELERATOR);
                router.push('/accelerator');
              }}
              className={cn(
                'flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-all text-[10px] font-bold',
                isAccelerator
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              )}
              title="Accelerator Dashboard"
            >
              <Layers className={cn('h-3.5 w-3.5 mb-0.5', isAccelerator ? 'text-purple-400' : 'text-slate-500')} />
              <span>Accel</span>
            </button>

            {/* Investor */}
            <button
              type="button"
              onClick={() => {
                setActiveRole(UserRole.INVESTOR);
                if (pathname === '/admin' || pathname === '/accelerator') router.push('/newsfeed');
              }}
              className={cn(
                'flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-all text-[10px] font-bold',
                isInvestor
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              )}
              title="Investor Dashboard"
            >
              <Briefcase className={cn('h-3.5 w-3.5 mb-0.5', isInvestor ? 'text-indigo-400' : 'text-slate-500')} />
              <span>Investor</span>
            </button>

            {/* Startup */}
            <button
              type="button"
              onClick={() => {
                setActiveRole(UserRole.STARTUP);
                if (pathname === '/admin' || pathname === '/accelerator') router.push('/newsfeed');
              }}
              className={cn(
                'flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-all text-[10px] font-bold',
                isStartup
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
              )}
              title="Startup Dashboard"
            >
              <Rocket className={cn('h-3.5 w-3.5 mb-0.5', isStartup ? 'text-brand-orange-400' : 'text-slate-500')} />
              <span>Startup</span>
            </button>
          </div>
        </div>
      )}

      {/* Collapsed view role switcher */}
      {canSwitchRole && collapsed && (
        <div className="p-2 flex justify-center border-b border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={toggleRole}
            title={`Current: ${isAdminMode ? 'Admin' : isInvestor ? 'Investor' : 'Startup'} (Click to cycle)`}
            className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs hover:scale-105 transition-all"
          >
            {isAdminMode ? (
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            ) : isInvestor ? (
              <Briefcase className="h-4 w-4 text-indigo-400" />
            ) : (
              <Rocket className="h-4 w-4 text-brand-orange-400" />
            )}
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-4">
        {!collapsed && (
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {isAdminMode
              ? 'Platform Governance'
              : isAccelerator
              ? 'Cohort Management'
              : isInvestor
              ? 'Diligence & Dealflow'
              : 'Pitch & Fundability'}
          </p>
        )}
        <ul className="space-y-1">
          {groupedItems.main.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              collapsed={collapsed}
              isActive={
                item.href === '/newsfeed'
                  ? pathname === item.href
                  : pathname?.startsWith(item.href)
              }
            />
          ))}
        </ul>

        {groupedItems.manage.length > 0 && (
          <>
            {!collapsed && (
              <>
                <Separator className="my-4" />
                <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {isAdminMode
                    ? 'System & Audit'
                    : isAccelerator
                    ? 'Dealflow Syndicate'
                    : isInvestor
                    ? 'Portfolio & Returns'
                    : 'Fundraising Pipeline'}
                </p>
              </>
            )}
            <ul className="space-y-1">
              {groupedItems.manage.map((item) => (
                <SidebarItem
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  isActive={pathname?.startsWith(item.href)}
                />
              ))}
            </ul>
          </>
        )}

        {!collapsed && (
          <>
            <Separator className="my-4" />
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Account
            </p>
          </>
        )}
        <ul className="space-y-1">
          {groupedItems.account.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              collapsed={collapsed}
              isActive={pathname?.startsWith(item.href)}
            />
          ))}
        </ul>
      </nav>

      {!collapsed && (
        <div className="shrink-0 border-t border-slate-200 p-4">
          <div className="rounded-xl border border-brand-orange-200 bg-gradient-to-br from-brand-orange-50 via-white to-brand-deep-pitch-50 p-4">
            <p className="text-xs font-semibold text-brand-orange-700">
              {isStartup ? 'Pitchmic Founder Pro' : 'Pitchmic VC Fund Pro'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {isStartup
                ? 'Unlock automated forensic deck scoring and telemetry.'
                : 'Unlock 1-click IC memos and automated deal triage.'}
            </p>
            <Link
              href="/upgrade"
              className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-brand-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-orange-600 transition-colors"
            >
              Upgrade
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}

interface SidebarItemProps {
  item: MenuItem;
  collapsed: boolean;
  isActive?: boolean;
}

function SidebarItem({ item, collapsed, isActive = false }: SidebarItemProps) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-gradient-to-r from-brand-orange-500/10 to-brand-deep-pitch-500/10 text-brand-orange-600'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
          collapsed && 'justify-center px-2'
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-orange-500 to-brand-deep-pitch-500" />
        )}
        <Icon
          className={cn(
            'h-5 w-5 shrink-0 transition-colors',
            isActive ? 'text-brand-orange-500' : 'text-slate-500 group-hover:text-slate-700'
          )}
        />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {!collapsed && item.badge && (
          <Badge
            variant={isActive ? 'default' : 'secondary'}
            className={cn(
              isActive
                ? 'bg-brand-orange-500 text-white'
                : 'bg-slate-200 text-slate-700'
            )}
          >
            {item.badge}
          </Badge>
        )}
      </Link>
    </li>
  );
}
