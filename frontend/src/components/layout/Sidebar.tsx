'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
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
  section: 'main' | 'manage' | 'account' | 'venture' | 'fundraising';
}

// Each entry is a route that exists and renders. Hash anchors that pointed at
// tab ids no page has, and badges asserting state nobody queried ("Live",
// "Active", "GDPR"), are deliberately gone — a sidebar item is a promise that
// clicking it lands somewhere real.
const ADMIN_MENU: MenuItem[] = [
  { href: '/admin', label: 'Overview & Telemetry', icon: Activity, section: 'main' },
  { href: '/accelerator', label: 'Accelerator Workspace', icon: Layers, section: 'main' },
  { href: '/investors', label: 'Investor OS', icon: Briefcase, section: 'main' },
  { href: '/intelligence', label: 'Enterprise Intelligence', icon: Key, section: 'main' },
  { href: '/analytics', label: 'Platform Analytics', icon: BarChart3, section: 'manage' },
  { href: '/settings', label: 'Admin Settings', icon: Settings, section: 'account' },
];

// The accelerator role sees the selection workspace and its own account
// surfaces — nothing else. Links into the investor, startup or offers
// dashboards used to sit here under accelerator-flavoured labels, which let a
// program operator walk into another tenant's product surface from the menu.
// The accelerator workspace renders its own navigation, so this list matters
// when the operator is on a shared page (messages, profile, settings).
const ACCELERATOR_MENU: MenuItem[] = [
  { href: '/accelerator', label: 'Selection Overview', icon: Layers, section: 'main' },
  { href: '/accelerator/applications', label: 'Applications', icon: FileText, section: 'main' },
  { href: '/accelerator/review-queue', label: 'Review Queue', icon: CheckSquare, section: 'main' },
  { href: '/accelerator/decision-room', label: 'Decision Room', icon: Award, section: 'main' },
  { href: '/accelerator/settings', label: 'Program Configuration', icon: Settings, section: 'main' },
  { href: '/messages', label: 'Inbound Messages', icon: MessageSquare, section: 'manage' },
  { href: '/notifications', label: 'Notifications', icon: Bell, section: 'manage' },
  { href: '/profile/edit', label: 'Your Profile', icon: User, section: 'account' },
  { href: '/settings', label: 'Account Settings', icon: Settings, section: 'account' },
];

const INVESTOR_MENU: MenuItem[] = [
  { href: '/investors', label: 'Investment Operating System', icon: Layers, section: 'main', badge: 'VC OS' },
  { href: '/discover', label: 'Dealflow Radar', icon: Sparkles, section: 'main', badge: 'AI Match' },
  { href: '/offers', label: 'Term Sheets & Offers', icon: HandCoins, section: 'main', badge: 'Active' },
  { href: '/dataroom', label: 'Diligence DataRooms', icon: FolderLock, section: 'main' },
  { href: '/intelligence', label: 'VC Forensics & AI', icon: Brain, section: 'main', badge: 'PRO' },
  { href: '/analytics', label: 'Portfolio & Heatmap', icon: BarChart3, section: 'manage' },
  { href: '/newsfeed', label: 'Ecosystem Pitch Stream', icon: Home, section: 'manage' },
  { href: '/messages', label: 'Direct Messages', icon: MessageSquare, section: 'manage' },
  { href: '/notifications', label: 'Notifications', icon: Bell, section: 'manage' },
  { href: '/profile/edit', label: 'Investor Profile', icon: User, section: 'account' },
  { href: '/settings', label: 'Settings', icon: Settings, section: 'account' },
];

const STARTUP_MENU: MenuItem[] = [
  // VENTURE section
  { href: '/company', label: 'Venture Profile', icon: Building2, section: 'venture' },
  { href: '/pitches', label: 'Pitch Studio', icon: Lightbulb, section: 'venture' },
  { href: '/pitches/new', label: 'Pitch Decks', icon: FileText, section: 'venture' },
  { href: '/fundability', label: 'Fundability & Readiness', icon: ShieldCheck, section: 'venture' },
  { href: '/application-intelligence', label: 'Application Intelligence', icon: Brain, section: 'venture', badge: 'NEW' },
  // FUNDRAISING section
  { href: '/pipeline', label: 'Fundraising Pipeline', icon: Activity, section: 'fundraising' },
  { href: '/newsfeed', label: 'Investor Network', icon: Users, section: 'fundraising' },
  { href: '/offers', label: 'Offers & Term Sheets', icon: HandCoins, section: 'fundraising' },
  { href: '/dataroom', label: 'Data Room', icon: FolderLock, section: 'fundraising' },
  { href: '/analytics', label: 'Traction & Metrics', icon: BarChart3, section: 'fundraising' },
  { href: '/messages', label: 'Messages', icon: MessageSquare, section: 'fundraising' },
  // ACCOUNT section
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
  // Major #8 — live unread message / notification counts from the notifications
  // hook (which can be wired to a real API). Replaces previously hardcoded '3'.
  const { messageCount, notificationCount } = useNotifications();

  const allowedItems = React.useMemo(() => {
    const raw = isAdminMode ? ADMIN_MENU : isAccelerator ? ACCELERATOR_MENU : isInvestor ? INVESTOR_MENU : STARTUP_MENU;
    // Inject live counts into Messages / Notifications entries so the badge
    // updates dynamically instead of being a stale literal.
    return raw.map((item) => {
      const href = item.href.split('?')[0];
      if (href === '/messages' && messageCount > 0) {
        return { ...item, badge: String(messageCount) };
      }
      if (href === '/notifications' && notificationCount > 0) {
        return { ...item, badge: String(notificationCount) };
      }
      if (href === '/messages' || href === '/notifications') {
        // Strip any stale hardcoded badge literal when count is 0
        const { badge: _omit, ...rest } = item;
        return rest as MenuItem;
      }
      return item;
    });
  }, [isAdminMode, isAccelerator, isInvestor, messageCount, notificationCount]);

  const groupedItems = {
    main: allowedItems.filter((i) => i.section === 'main' || i.section === 'venture'),
    manage: allowedItems.filter((i) => i.section === 'manage' || i.section === 'fundraising'),
    account: allowedItems.filter((i) => i.section === 'account'),
  };

  // The nav item that owns the deepest matching route. A plain
  // startsWith(href) lit up every ancestor entry, so with several
  // /accelerator/* links in play the workspace root highlighted on all of them.
  const activeHref = React.useMemo(() => {
    if (!pathname) return null;
    let best: string | null = null;
    for (const item of allowedItems) {
      const path = item.href.split('?')[0].split('#')[0];
      if (pathname === path || pathname.startsWith(path + '/')) {
        if (!best || path.length > best.length) best = path;
      }
    }
    return best;
  }, [allowedItems, pathname]);

  const isItemActive = (href: string) =>
    activeHref === href.split('?')[0].split('#')[0];

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
                if (pathname === '/admin' || pathname === '/accelerator' || pathname === '/newsfeed') router.push('/discover');
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
              ? 'Selection Workspace'
              : isInvestor
              ? 'Diligence & Dealflow'
              : 'Venture'}
          </p>
        )}
        <ul className="space-y-1">
          {groupedItems.main.map((item) => {
            return (
              <SidebarItem
                key={item.label}
                item={item}
                collapsed={collapsed}
                isActive={isItemActive(item.href)}
              />
            );
          })}
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
                    ? 'Communication'
                    : isInvestor
                    ? 'Portfolio & Returns'
                    : 'Fundraising'}
                </p>
              </>
            )}
            <ul className="space-y-1">
              {groupedItems.manage.map((item) => {
                return (
                  <SidebarItem
                    key={item.label}
                    item={item}
                    collapsed={collapsed}
                    isActive={isItemActive(item.href)}
                  />
                );
              })}
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
              isActive={isItemActive(item.href)}
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
        {!collapsed && <span className="flex-1 truncate mr-2">{item.label}</span>}
        {!collapsed && item.badge && (
          <>
            <span className="sr-only"> </span>
            <Badge
              variant={isActive ? 'default' : 'secondary'}
              className={cn(
                'ml-auto text-[10px] font-semibold px-1.5 py-0.5 shrink-0',
                isActive
                  ? 'bg-brand-orange-500 text-white'
                  : 'bg-slate-100 text-slate-600'
              )}
            >
              {item.badge}
            </Badge>
          </>
        )}
      </Link>
    </li>
  );
}
