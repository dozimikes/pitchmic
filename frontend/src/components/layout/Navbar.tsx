'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  X,
  Search,
  Plus,
  Bell,
  MessageSquare,
  LogOut,
  User as UserIcon,
  Building2,
  Briefcase,
  Settings,
  ArrowRight,
  Clock,
  CheckCheck,
  Inbox,
  Brain,
  ArrowLeftRight,
  Rocket,
  ShieldCheck,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useAuth, getDefaultLandingPath } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { UserRole } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/Sheet';
import { Logo } from '@/components/ui/Logo';
import { Sidebar } from './Sidebar';

export interface NavbarProps {
  showSidebarToggle?: boolean;
  onToggleSidebar?: () => void;
  className?: string;
  variant?: 'dashboard' | 'marketing';
}

const MARKETING_NAV = [
  { label: 'Platform & Diligence', href: '/#features' },
  { label: '8-Pillar Scoring', href: '/#how-it-works' },
  { label: 'IC Memo Radar', href: '/#memos' },
  { label: 'Pricing & API', href: '/#pricing' },
];

function EmptyState({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-2 text-xs text-slate-500">{label}</p>
    </div>
  );
}

export function Navbar({
  showSidebarToggle = false,
  onToggleSidebar,
  className,
  variant = 'dashboard',
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout, isStartup, isInvestor, isAccelerator, isAdminMode, canSwitchRole, setActiveRole, toggleRole } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const {
    notifications,
    notificationCount,
    messages,
    messageCount,
    markNotificationsRead,
    markMessagesRead,
  } = useNotifications();

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fullName =
    user?.first_name || user?.last_name
      ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
      : null;

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignored
    }
  };

  const isMarketingActive = (href: string) => {
    if (!pathname) return false;
    const path = href.split('#')[0] || '/';
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const isMarketing = variant === 'marketing';

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full transition-all duration-200',
        // ─── Marketing: clean translucent white ───
        isMarketing && (
          scrolled
            ? 'border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xs'
            : 'border-b border-slate-200/60 bg-white/80 backdrop-blur-sm'
        ),
        // ─── Dashboard: distinct muted surface ───
        !isMarketing && (
          scrolled
            ? 'border-b border-slate-200 bg-slate-50/98 backdrop-blur-md shadow-sm'
            : 'border-b border-slate-200/80 bg-slate-50/90 backdrop-blur-sm'
        ),
        className
      )}
    >
      <div className={cn(
        'mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8',
        isMarketing ? 'h-16 max-w-7xl' : 'h-14 max-w-full'
      )}>

        {/* Left Side: Sidebar Toggle (Dashboard) / Marketing Mobile Menu / Logo */}
        <div className="flex items-center gap-3">
          {variant === 'dashboard' && showSidebarToggle ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                aria-label="Toggle sidebar"
                className="hidden md:inline-flex h-9 w-9 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors"
              >
                <Menu className="h-4.5 w-4.5" />
              </Button>

              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger
                  aria-label="Open menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg p-0 text-slate-700 hover:bg-slate-100 md:hidden transition-colors"
                >
                  <Menu className="h-5 w-5" />
                </SheetTrigger>
                <SheetContent side="left" showClose={false} className="p-0">
                  <Sidebar />
                </SheetContent>
              </Sheet>
            </>
          ) : null}

          {/* Marketing Mobile Menu Trigger */}
          {variant === 'marketing' && (
            <Sheet>
              <SheetTrigger
                aria-label="Open navigation menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 p-0 text-slate-700 hover:bg-slate-100 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-white p-6 shadow-2xl">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <Logo size="sm" />
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700 text-[10px]">
                      Pan-African VC
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                    {MARKETING_NAV.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                    <Link
                      href="/intelligence"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-indigo-600 hover:bg-indigo-50 transition-colors font-semibold"
                    >
                      <Brain className="h-4 w-4" />
                      Intelligence Hub
                    </Link>
                  </div>

                  <div className="flex flex-col gap-2 pt-4 border-t border-slate-100 mt-auto">
                    <Link href="/sign-in">
                      <Button variant="outline" className="w-full justify-center h-10 text-xs font-semibold">
                        Sign in
                      </Button>
                    </Link>
                    <Link href="/sign-up/investor">
                      <Button variant="default" className="w-full justify-center h-10 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white">
                        Request Fund Access &rarr;
                      </Button>
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}

          {/* Logo is shown on marketing OR on mobile in dashboard mode */}
          <Link
            href={isAuthenticated ? getDefaultLandingPath(user) : '/'}
            className={cn(
              'flex items-center',
              variant === 'dashboard' && 'md:hidden'
            )}
          >
            <Logo size={isMarketing ? 'md' : 'sm'} />
          </Link>
        </div>

        {/* Center: Clean Marketing Navigation Links (Desktop) */}
        {variant === 'marketing' && (
          <nav className="hidden lg:flex items-center gap-1">
            {MARKETING_NAV.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  isMarketingActive(href)
                    ? 'bg-slate-100/80 text-slate-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                )}
              >
                {label}
              </Link>
            ))}

            <Link
              href="/intelligence"
              className="ml-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-slate-700 bg-slate-100/70 border border-slate-200/60 hover:bg-slate-100 hover:text-slate-900 transition-all"
            >
              <Sparkles className="h-3 w-3 text-indigo-600" />
              <span>VC Hub</span>
            </Link>
          </nav>
        )}

        {/* Dashboard Search Bar */}
        {variant === 'dashboard' && isAuthenticated && (
          <div className="ml-2 hidden flex-1 md:block max-w-md">
            <div className="relative flex items-center transition-all duration-200">
              <Search
                className={cn(
                  'pointer-events-none absolute left-3 h-3.5 w-3.5 transition-colors',
                  searchOpen ? 'text-brand-orange-500' : 'text-slate-400'
                )}
              />
              <input
                type="search"
                placeholder="Search deals, offers, pitches..."
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setSearchOpen(false)}
                className="h-9 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 pl-8.5 pr-9 text-xs placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/5 transition-all shadow-2xs"
              />
              <kbd className="pointer-events-none absolute right-2.5 hidden h-4.5 select-none items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 font-mono text-[9px] font-semibold text-slate-400 sm:flex">
                ⌘K
              </kbd>
            </div>
          </div>
        )}

        {/* Right Side: Modern Minimalist Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {variant === 'marketing' && !isAuthenticated && (
            <>
              <Link
                href="/sign-in"
                className="hidden sm:inline-flex px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Sign in
              </Link>

              <Link href="/sign-up/investor">
                <Button
                  size="sm"
                  className="h-9 px-4 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs gap-1.5 transition-all hover:scale-[1.02]"
                >
                  <span>Request Access</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </>
          )}

          {isAuthenticated && (
            <>
              {/* Superuser Mode Switcher: Admin | Accelerator | Investor | Startup */}
              {/* Superuser Mode Switcher: Admin | Accelerator | Investor | Startup */}
              {canSwitchRole && (
                <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 border border-slate-200/90 shadow-2xs">
                  {/* Admin */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRole(UserRole.ADMIN);
                      router.push('/admin');
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-xs font-semibold',
                      isAdminMode
                        ? 'bg-slate-900 text-white shadow-2xs font-bold ring-1 ring-slate-900/10'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    )}
                    title="Switch to Admin Dashboard"
                  >
                    <ShieldCheck className={cn('h-3.5 w-3.5 shrink-0', isAdminMode ? 'text-emerald-400' : 'text-slate-500')} />
                    <span>Admin</span>
                  </button>

                  <span className="text-slate-300 font-light select-none">|</span>

                  {/* Accelerator */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRole(UserRole.ACCELERATOR);
                      router.push('/accelerator');
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-xs font-semibold',
                      isAccelerator
                        ? 'bg-slate-900 text-white shadow-2xs font-bold ring-1 ring-slate-900/10'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    )}
                    title="Switch to Accelerator Dashboard"
                  >
                    <Layers className={cn('h-3.5 w-3.5 shrink-0', isAccelerator ? 'text-purple-400' : 'text-slate-500')} />
                    <span>Accelerator</span>
                  </button>

                  <span className="text-slate-300 font-light select-none">|</span>

                  {/* Investor */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRole(UserRole.INVESTOR);
                      if (pathname === '/admin' || pathname === '/accelerator' || pathname === '/newsfeed') router.push('/discover');
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-xs font-semibold',
                      isInvestor
                        ? 'bg-slate-900 text-white shadow-2xs font-bold ring-1 ring-slate-900/10'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    )}
                    title="Switch to Investor Dashboard"
                  >
                    <Briefcase className={cn('h-3.5 w-3.5 shrink-0', isInvestor ? 'text-indigo-400' : 'text-slate-500')} />
                    <span>Investor</span>
                  </button>

                  <span className="text-slate-300 font-light select-none">|</span>

                  {/* Startup */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRole(UserRole.STARTUP);
                      if (pathname === '/admin' || pathname === '/accelerator') router.push('/newsfeed');
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-xs font-semibold',
                      isStartup
                        ? 'bg-slate-900 text-white shadow-2xs font-bold ring-1 ring-slate-900/10'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    )}
                    title="Switch to Startup Dashboard"
                  >
                    <Rocket className={cn('h-3.5 w-3.5 shrink-0', isStartup ? 'text-brand-orange-400' : 'text-slate-500')} />
                    <span>Startup</span>
                  </button>
                </div>
              )}


              {/* New Pitch button removed - accessible via sidebar */}

              {/* Messages Popover */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Messages"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  onClick={markMessagesRead}
                >
                  <MessageSquare className="h-4 w-4" />
                  {messageCount > 0 && (
                    <Badge
                      variant="default"
                      className="absolute -right-0.5 -top-0.5 h-4 min-w-[16px] justify-center rounded-full px-1 text-[10px] font-bold leading-none pointer-events-none bg-brand-orange-500"
                    >
                      {messageCount > 99 ? '99+' : messageCount}
                    </Badge>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-80 p-0 bg-white border border-slate-200 shadow-lg rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Messages</span>
                    {messageCount > 0 && (
                      <Badge variant="default" className="text-[10px] font-bold px-1.5 bg-brand-orange-500">
                        {messageCount} unread
                      </Badge>
                    )}
                  </div>
                  {messages.length === 0 ? (
                    <EmptyState icon={Inbox} label="No messages yet" />
                  ) : (
                    <ul className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                      {messages.slice(0, 5).map((msg) => (
                        <li key={msg.id}>
                          <Link
                            href={msg.href}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
                          >
                            <Avatar
                              src={msg.senderAvatar ?? null}
                              alt={msg.senderName}
                              fallback={msg.senderName}
                              size="sm"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-900 truncate">
                                  {msg.senderName}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {msg.createdAt}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{msg.preview}</p>
                            </div>
                            {!msg.read && (
                              <span className="mt-1.5 h-2 w-2 rounded-full bg-brand-orange-500 shrink-0" />
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
                    <Link
                      href="/messages"
                      className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-900 hover:text-slate-700 transition-colors"
                    >
                      View all messages
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Notifications Popover */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Notifications"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  onClick={markNotificationsRead}
                >
                  <Bell className="h-4 w-4" />
                  {notificationCount > 0 && (
                    <Badge
                      variant="default"
                      className="absolute -right-0.5 -top-0.5 h-4 min-w-[16px] justify-center rounded-full px-1 text-[10px] font-bold leading-none pointer-events-none bg-brand-orange-500"
                    >
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </Badge>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-80 p-0 bg-white border border-slate-200 shadow-lg rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Notifications</span>
                    {notificationCount > 0 && (
                      <Badge variant="default" className="text-[10px] font-bold px-1.5 bg-brand-orange-500">
                        {notificationCount} new
                      </Badge>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <EmptyState icon={CheckCheck} label="You're all caught up" />
                  ) : (
                    <ul className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                      {notifications.slice(0, 5).map((n) => (
                        <li key={n.id}>
                          <Link
                            href={n.href}
                            className={cn(
                              'flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors',
                              !n.read && 'bg-slate-50/80'
                            )}
                          >
                            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-orange-500 opacity-0 data-[unread=true]:opacity-100" data-unread={!n.read} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-900 truncate">{n.title}</p>
                              <p className="text-xs text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{n.body}</p>
                              <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock className="h-3 w-3" />
                                {n.createdAt}
                              </span>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
                    <Link
                      href="/notifications"
                      className="flex items-center justify-center gap-1 text-xs font-semibold text-slate-900 hover:text-slate-700 transition-colors"
                    >
                      View all notifications
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden="true" />

              {/* User Profile Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="User menu"
                  className="rounded-full transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:ring-offset-2 ring-1 ring-slate-200"
                >
                  <Avatar
                    src={user?.avatar_url ?? null}
                    alt={fullName ?? 'User'}
                    fallback={fullName ?? null}
                    size="sm"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-56 bg-white border border-slate-200 shadow-xl rounded-2xl p-1.5">
                  <div className="px-3 py-2">
                    <p className="truncate text-xs font-bold text-slate-900 leading-tight">
                      {fullName ?? 'Signed in'}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 mt-0.5">{user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-3">My Account</DropdownMenuLabel>
                  <Link href="/profile/edit">
                    <DropdownMenuItem className="text-xs rounded-lg">
                      <UserIcon className="h-3.5 w-3.5 text-slate-500 mr-2" />
                      Edit Profile
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/profile/avatar">
                    <DropdownMenuItem className="text-xs rounded-lg">
                      <Settings className="h-3.5 w-3.5 text-slate-500 mr-2" />
                      Avatar &amp; Settings
                    </DropdownMenuItem>
                  </Link>
                  {isStartup && (
                    <Link href="/profile/logo">
                      <DropdownMenuItem className="text-xs rounded-lg">
                        <Building2 className="h-3.5 w-3.5 text-slate-500 mr-2" />
                        Company Logo
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-3">Workspace</DropdownMenuLabel>
                  <Link href="/newsfeed">
                    <DropdownMenuItem className="text-xs rounded-lg">
                      <Briefcase className="h-3.5 w-3.5 text-slate-500 mr-2" />
                      Newsfeed
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/offers">
                    <DropdownMenuItem className="text-xs rounded-lg">
                      <MessageSquare className="h-3.5 w-3.5 text-slate-500 mr-2" />
                      Offers
                    </DropdownMenuItem>
                  </Link>
                  {isStartup && (
                    <>
                      <Link href="/pitches/new">
                        <DropdownMenuItem className="text-xs rounded-lg">
                          <Plus className="h-3.5 w-3.5 text-slate-500 mr-2" />
                          Create Pitch
                        </DropdownMenuItem>
                      </Link>
                      <Link href="/fundability">
                        <DropdownMenuItem className="text-xs rounded-lg">
                          <ShieldCheck className="h-3.5 w-3.5 text-brand-orange-500 mr-2" />
                          Fundability Score
                        </DropdownMenuItem>
                      </Link>
                    </>
                  )}
                  {canSwitchRole && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-3">View Mode (Superuser)</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setActiveRole(UserRole.ADMIN)} className="cursor-pointer font-medium text-xs rounded-lg">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 mr-2" />
                        <span>Switch to Admin Mode</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setActiveRole(UserRole.INVESTOR)} className="cursor-pointer font-medium text-xs rounded-lg">
                        <Briefcase className="h-3.5 w-3.5 text-indigo-600 mr-2" />
                        <span>Switch to Investor Mode</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setActiveRole(UserRole.STARTUP)} className="cursor-pointer font-medium text-xs rounded-lg">
                        <Rocket className="h-3.5 w-3.5 text-brand-orange-500 mr-2" />
                        <span>Switch to Startup Mode</span>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 hover:bg-red-50 hover:text-red-700 text-xs rounded-lg">
                    <LogOut className="h-3.5 w-3.5 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
