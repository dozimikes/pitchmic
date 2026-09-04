'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Search,
  Send,
  Paperclip,
  Smile,
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Sparkles,
  HandCoins,
  CheckCheck,
  Check,
  Building2,
  Briefcase,
  Calendar,
  ExternalLink,
  ShieldCheck,
  FileText,
  Clock,
  ChevronRight,
  X,
  XCircle,
  Plus,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Separator } from '@/components/ui/Separator';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { apiGet } from '@/lib/api';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read: boolean;
  attachments?: Array<{ name: string; size: string; type: string }>;
}

interface Conversation {
  id: string;
  participant_name: string;
  participant_avatar_url?: string;
  participant_role: 'startup' | 'investor' | 'admin';
  participant_company?: string;
  last_message_body: string;
  last_message_at: string;
  unread_count: number;
  is_online?: boolean;
  last_offer_preview?: {
    amount: number;
    equity_pct: number;
    status: 'Sent' | 'Accepted' | 'Under Review' | 'Negotiating';
  };
}

const SUGGESTED_REPLIES_STARTUP = [
  'Happy to jump on a 20-min diligence call tomorrow. Does 2pm ET work?',
  'Thanks for the interest! Here is the link to our updated data room & cap table.',
  'We have $150K allocation remaining in this round before closing next week.',
  'Our Q3 gross margins expanded to 78% with $42K MRR across 18 B2B clients.',
];

const SUGGESTED_REPLIES_INVESTOR = [
  'Could you share your latest cohort retention and customer acquisition cost breakdown?',
  'We reviewed the deck and would like to propose a formal term sheet.',
  'Are there other co-investors committed to filling this round?',
  'Let us schedule a partner meeting for next Tuesday to walk through the technical architecture.',
];

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  const diffDays = Math.floor((startOfToday.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function MessagesPage() {
  const router = useRouter();
  const { user, isStartup, isInvestor } = useAuth();
  const [search, setSearch] = React.useState('');
  const [filterTab, setFilterTab] = React.useState<'all' | 'unread' | 'offers'>('all');
  const [selectedId, setSelectedId] = React.useState<string | null>('c1');
  const [draft, setDraft] = React.useState('');
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [showCallModal, setShowCallModal] = React.useState(false);
  const [callType, setCallType] = React.useState<'video' | 'phone'>('video');
  const [callScheduledNotice, setCallScheduledNotice] = React.useState(false);
  const [showMobileList, setShowMobileList] = React.useState(true);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  const currentUserId = user?.id ?? 'me';

  // Fetch real database offers to synthesize live deal conversations
  const { data: dbOffers = [], isLoading } = useQuery({
    queryKey: ['messages', 'offers'],
    queryFn: async () => {
      try {
        const res = await apiGet<{ results?: any[] } | any[]>('/offers/');
        const offers = Array.isArray(res) ? res : res.results ?? [];
        return offers;
      } catch {
        return [];
      }
    },
    staleTime: 15000,
  });

  const [conversationList, setConversationList] = React.useState<Conversation[]>([]);
  const [messageThreads, setMessageThreads] = React.useState<Record<string, Message[]>>({});

  // Populate dynamic conversations & initial messages from database offers
  React.useEffect(() => {
    if (dbOffers && dbOffers.length > 0) {
      const dbConvList: Conversation[] = dbOffers.map((o: any) => {
        const isUserInvestor = isInvestor;
        const otherPartyName = isUserInvestor
          ? o.pitch_title || o.pitch?.title || 'Startup Founder'
          : o.investor_name || o.investor?.firm_name || 'Venture Partner';
        const company = isUserInvestor
          ? o.startup_company || 'Portfolio Startup'
          : o.investor?.firm_name || 'Institutional Fund';

        return {
          id: `offer_conv_${o.id}`,
          participant_name: otherPartyName,
          participant_role: isUserInvestor ? 'startup' : 'investor',
          participant_company: company,
          last_message_body: o.message || `Official Offer: $${Number(o.amount || 0).toLocaleString()} for ${o.equity_pct}% equity`,
          last_message_at: o.created_at || new Date().toISOString(),
          unread_count: o.status === 'sent' && !isUserInvestor ? 1 : 0,
          is_online: true,
          last_offer_preview: {
            amount: Number(o.amount || 0),
            equity_pct: Number(o.equity_pct || 0),
            status: o.status === 'sent' ? 'Sent' : o.status === 'accepted' ? 'Accepted' : 'Negotiating',
          },
        };
      });

      setConversationList(dbConvList);

      const newThreads: Record<string, Message[]> = {};
      dbOffers.forEach((o: any) => {
        const convId = `offer_conv_${o.id}`;
        newThreads[convId] = [
          {
            id: `msg_init_${o.id}`,
            conversation_id: convId,
            sender_id: isInvestor ? 'me' : 'them',
            body: o.message || `Submitted formal term sheet: $${Number(o.amount || 0).toLocaleString()} for ${o.equity_pct}% equity.`,
            created_at: o.created_at || new Date().toISOString(),
            read: true,
          },
        ];
      });
      setMessageThreads((prev) => ({ ...newThreads, ...prev }));
      if (!selectedId && dbConvList[0]) {
        setSelectedId(dbConvList[0].id);
      }
    } else {
      setConversationList([]);
    }
  }, [dbOffers, isInvestor, selectedId]);

  const selected = conversationList.find((c) => c.id === selectedId) ?? conversationList[0] ?? null;
  const currentMessages = selectedId ? messageThreads[selectedId] ?? [] : [];

  const filteredConversations = React.useMemo(() => {
    return conversationList.filter((c) => {
      // Tab filter
      if (filterTab === 'unread' && c.unread_count === 0) return false;
      if (filterTab === 'offers' && !c.last_offer_preview) return false;

      // Text search
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        c.participant_name.toLowerCase().includes(q) ||
        (c.participant_company?.toLowerCase().includes(q) ?? false) ||
        c.last_message_body.toLowerCase().includes(q)
      );
    });
  }, [conversationList, filterTab, search]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length, selectedId]);

  // Mark conversation as read on select
  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    setShowMobileList(false);
    setConversationList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c))
    );
    setMessageThreads((prev) => {
      const thread = prev[id];
      if (!thread) return prev;
      return {
        ...prev,
        [id]: thread.map((m) => ({ ...m, read: true })),
      };
    });
  };

  const handleSendMessage = (textToSend?: string) => {
    const body = (textToSend ?? draft).trim();
    if (!body || !selectedId) return;

    const newMessage: Message = {
      id: `m_${Date.now()}`,
      conversation_id: selectedId,
      sender_id: 'me',
      body,
      created_at: new Date().toISOString(),
      read: true,
    };

    // Update messages
    setMessageThreads((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] ?? []), newMessage],
    }));

    // Update conversation snippet & sort to top
    setConversationList((prev) => {
      const target = prev.find((c) => c.id === selectedId);
      if (!target) return prev;
      const updated: Conversation = {
        ...target,
        last_message_body: body,
        last_message_at: new Date().toISOString(),
      };
      return [updated, ...prev.filter((c) => c.id !== selectedId)];
    });

    setDraft('');
    setShowSuggestions(false);
  };

  const totalUnread = conversationList.reduce((sum, c) => sum + c.unread_count, 0);
  const activeOffersCount = conversationList.filter((c) => !!c.last_offer_preview).length;
  const suggestedReplies = isStartup ? SUGGESTED_REPLIES_STARTUP : SUGGESTED_REPLIES_INVESTOR;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Deal Messaging
            </h1>
            {totalUnread > 0 && (
              <Badge variant="default" className="bg-brand-orange-500 hover:bg-brand-orange-600 shadow-sm">
                <MessageSquare className="mr-1 h-3 w-3" />
                {totalUnread} unread
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {isStartup
              ? 'Direct, verified deal room messaging with institutional investors and active funds.'
              : 'Direct communication channels with founders, pitch inquiries, and term negotiations.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showSuggestions ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowSuggestions((v) => !v)}
            leftIcon={<Sparkles className="h-3.5 w-3.5" />}
            className="text-xs"
          >
            {showSuggestions ? 'Hide suggestions' : 'Suggested replies'}
          </Button>
          <Link href="/offers">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<HandCoins className="h-3.5 w-3.5 text-brand-orange-500" />}
              className="text-xs"
            >
              Offers ({activeOffersCount})
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Messaging Container */}
      <Card className="border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-[680px] h-[calc(100vh-14rem)]">
          {/* Left Column: Conversation Directory */}
          <div
            className={cn(
              'flex flex-col border-slate-200 bg-white lg:border-r',
              selected && !showMobileList ? 'hidden lg:flex' : 'flex'
            )}
          >
            {/* Search & Tabs */}
            <div className="border-b border-slate-200 p-3.5 space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  placeholder="Search conversations, funds, offers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-lg">
                {[
                  { id: 'all', label: 'All', count: conversationList.length },
                  { id: 'unread', label: 'Unread', count: totalUnread },
                  { id: 'offers', label: 'With Offers', count: activeOffersCount },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id as 'all' | 'unread' | 'offers')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded-md transition-all',
                      filterTab === tab.id
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span
                        className={cn(
                          'px-1.5 py-0.2 text-[10px] rounded-full font-bold',
                          filterTab === tab.id ? 'bg-slate-100 text-slate-700' : 'bg-slate-200/60 text-slate-500'
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <MessageSquare className="h-8 w-8 text-slate-300" />
                  <p className="text-sm font-medium text-slate-700">No conversations found</p>
                  <p className="text-xs text-slate-400 max-w-xs">
                    {search ? 'Try adjusting your search terms.' : 'No threads in this category.'}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = selectedId === conv.id;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => handleSelectConversation(conv.id)}
                      className={cn(
                        'w-full flex items-start gap-3 p-3.5 text-left transition-all relative',
                        isSelected
                          ? 'bg-gradient-to-r from-brand-orange-50/70 via-brand-deep-pitch-50/40 to-white border-l-4 border-brand-orange-500'
                          : 'hover:bg-slate-50/80'
                      )}
                    >
                      <div className="relative shrink-0 mt-0.5">
                        <Avatar
                          src={conv.participant_avatar_url ?? null}
                          alt={conv.participant_name}
                          fallback={conv.participant_name}
                          size="md"
                        />
                        {conv.is_online && (
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p
                            className={cn(
                              'truncate text-sm',
                              conv.unread_count > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
                            )}
                          >
                            {conv.participant_name}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                            {formatRelativeDate(conv.last_message_at)}
                          </span>
                        </div>

                        {conv.participant_company && (
                          <p className="truncate text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            {conv.participant_role === 'investor' ? (
                              <Briefcase className="h-3 w-3 text-slate-400" />
                            ) : (
                              <Building2 className="h-3 w-3 text-slate-400" />
                            )}
                            {conv.participant_company}
                          </p>
                        )}

                        <p
                          className={cn(
                            'truncate text-xs mt-1 leading-snug',
                            conv.unread_count > 0 ? 'font-medium text-slate-900' : 'text-slate-500'
                          )}
                        >
                          {conv.last_message_body}
                        </p>

                        {/* Offer badge tag */}
                        {conv.last_offer_preview && (
                          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand-orange-200 bg-brand-orange-50/80 px-2.5 py-0.5 shadow-xs">
                            <HandCoins className="h-3 w-3 text-brand-orange-600" />
                            <span className="text-[10px] font-bold text-brand-orange-800">
                              ${(conv.last_offer_preview.amount / 1000).toFixed(0)}K · {conv.last_offer_preview.equity_pct}% · {conv.last_offer_preview.status}
                            </span>
                          </div>
                        )}
                      </div>

                      {conv.unread_count > 0 && (
                        <span className="shrink-0 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-orange-500 px-1.5 text-[10px] font-bold text-white shadow-xs">
                          {conv.unread_count}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Chat Thread */}
          <div
            className={cn(
              'flex flex-col bg-slate-50/30',
              showMobileList && selected ? 'hidden lg:flex' : 'flex'
            )}
          >
            {selected ? (
              <>
                {/* Thread Header */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setShowMobileList(true)}
                      className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>

                    <div className="relative shrink-0">
                      <Avatar
                        src={selected.participant_avatar_url ?? null}
                        alt={selected.participant_name}
                        fallback={selected.participant_name}
                        size="md"
                      />
                      {selected.is_online && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {selected.participant_name}
                        </p>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] px-1.5 py-0 capitalize',
                            selected.participant_role === 'investor'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-orange-50 text-orange-700 border-orange-200'
                          )}
                        >
                          {selected.participant_role}
                        </Badge>
                      </div>

                      <p className="truncate text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span>{selected.participant_company}</span>
                        <span>·</span>
                        {selected.is_online ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active now
                          </span>
                        ) : (
                          <span className="text-slate-400">Offline</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 sm:gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCallType('video');
                        setShowCallModal(true);
                      }}
                      leftIcon={<Video className="h-3.5 w-3.5 text-indigo-600" />}
                      className="hidden sm:inline-flex text-xs h-8"
                    >
                      Diligence Call
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCallType('phone');
                        setShowCallModal(true);
                      }}
                      aria-label="Call"
                      className="h-8 w-8 text-slate-500 hover:text-slate-900"
                    >
                      <Phone className="h-4 w-4" />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="More options" className="h-8 w-8 text-slate-500">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => router.push('/dataroom')} className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-emerald-600" />
                          Grant Data Room Access
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push('/offers')} className="flex items-center gap-2">
                          <HandCoins className="h-4 w-4 text-brand-orange-500" />
                          View Offer Terms
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600 hover:bg-red-50">
                          Mute Conversation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Deal Context Ribbon (if active offer exists) */}
                {selected.last_offer_preview && (
                  <div className="bg-gradient-to-r from-brand-orange-500/10 via-amber-500/10 to-brand-deep-pitch-500/10 border-b border-brand-orange-200/60 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <HandCoins className="h-4 w-4 text-brand-orange-600 shrink-0" />
                      <span className="font-semibold text-slate-900 truncate">
                        Active Term Sheet: ${(selected.last_offer_preview.amount).toLocaleString()} for {selected.last_offer_preview.equity_pct}% equity
                      </span>
                      <Badge variant="outline" className="border-brand-orange-300 bg-white text-brand-orange-700 text-[10px]">
                        {selected.last_offer_preview.status}
                      </Badge>
                    </div>

                    <Link
                      href="/offers"
                      className="shrink-0 font-semibold text-brand-orange-700 hover:text-brand-orange-800 flex items-center gap-1 hover:underline text-[11px]"
                    >
                      Review Terms <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                {/* Diligence Call Scheduled Toast */}
                {callScheduledNotice && (
                  <div className="m-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-emerald-600" />
                      <span>Diligence call invitation generated and sent to {selected.participant_name}.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCallScheduledNotice(false)}
                      className="text-emerald-600 hover:text-emerald-900"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Messages Body */}
                <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 space-y-4">
                  {currentMessages.map((msg, idx) => {
                    const mine = msg.sender_id === 'me' || msg.sender_id === currentUserId;
                    const prev = currentMessages[idx - 1];
                    const sameSender = prev && prev.sender_id === msg.sender_id;
                    const showAvatar = !mine && !sameSender;

                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex items-end gap-2.5',
                          mine ? 'flex-row-reverse' : 'flex-row'
                        )}
                      >
                        <div className="w-8 shrink-0">
                          {showAvatar ? (
                            <Avatar
                              src={selected.participant_avatar_url ?? null}
                              alt={selected.participant_name}
                              fallback={selected.participant_name}
                              size="sm"
                            />
                          ) : null}
                        </div>

                        <div className={cn('group max-w-[85%] sm:max-w-[72%]', mine ? 'items-end' : 'items-start')}>
                          {!mine && !sameSender && (
                            <p className="mb-1 px-1 text-[11px] font-semibold text-slate-600">
                              {selected.participant_name}
                            </p>
                          )}

                          <div
                            className={cn(
                              'rounded-2xl px-4 py-2.5 text-sm shadow-xs leading-relaxed break-words',
                              mine
                                ? 'bg-gradient-to-br from-brand-orange-500 to-brand-deep-pitch-600 text-white rounded-br-xs'
                                : 'bg-white border border-slate-200/90 text-slate-800 rounded-bl-xs'
                            )}
                          >
                            <p className="whitespace-pre-wrap">{msg.body}</p>

                            {/* Attachments */}
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="mt-2.5 space-y-1.5">
                                {msg.attachments.map((att) => (
                                  <div
                                    key={att.name}
                                    className={cn(
                                      'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium',
                                      mine
                                        ? 'bg-white/15 border border-white/20 text-white'
                                        : 'bg-slate-50 border border-slate-200 text-slate-700'
                                    )}
                                  >
                                    <FileText className="h-4 w-4 shrink-0 text-brand-orange-400" />
                                    <span className="truncate flex-1">{att.name}</span>
                                    <span className={cn('text-[10px]', mine ? 'text-white/70' : 'text-slate-400')}>
                                      {att.size}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div
                            className={cn(
                              'mt-1 flex items-center gap-1 px-1 text-[10px] text-slate-400 tabular-nums',
                              mine ? 'justify-end' : 'justify-start'
                            )}
                          >
                            <span>{formatTime(msg.created_at)}</span>
                            {mine && (
                              msg.read ? (
                                <CheckCheck className="h-3 w-3 text-sky-500" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* AI Suggested Replies Bar */}
                <AnimatePresence>
                  {showSuggestions && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-slate-200 bg-gradient-to-r from-brand-orange-50/50 via-white to-brand-deep-pitch-50/50 px-4 py-2.5"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          <Sparkles className="h-3 w-3 text-brand-orange-500" />
                          Suggested Deal Responses
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowSuggestions(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestedReplies.map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendMessage(chip)}
                            className="text-left rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-brand-orange-300 hover:bg-brand-orange-50/50 transition-colors shadow-2xs"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Quick Deal Actions Bar */}
                <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-xs">
                  <span className="font-semibold text-slate-500 text-[11px] shrink-0 mr-1 flex items-center gap-1">
                    <Briefcase className="h-3 w-3 text-brand-orange-500" />
                    Deal Actions:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("I have granted you full DataRoom NDA access. You can review our financials, cap table, and tech architecture at /dataroom.");
                    }}
                    className="inline-flex items-center gap-1 shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-brand-orange-300 hover:text-brand-orange-700 hover:bg-brand-orange-50/50 transition-colors shadow-2xs"
                  >
                    <ShieldCheck className="h-3 w-3 text-emerald-600" />
                    Grant DataRoom NDA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("Following up on terms: We would like to propose a Post-Money SAFE at a $4,000,000 valuation cap with standard MFN protection.");
                    }}
                    className="inline-flex items-center gap-1 shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-brand-orange-300 hover:text-brand-orange-700 hover:bg-brand-orange-50/50 transition-colors shadow-2xs"
                  >
                    <HandCoins className="h-3 w-3 text-brand-orange-500" />
                    Propose SAFE Counter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("Here is our latest traction brief: $42K MRR (15% MoM growth), 18 enterprise contracts, and 78% gross margin.");
                    }}
                    className="inline-flex items-center gap-1 shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-brand-orange-300 hover:text-brand-orange-700 hover:bg-brand-orange-50/50 transition-colors shadow-2xs"
                  >
                    <FileText className="h-3 w-3 text-sky-600" />
                    Share Traction Brief
                  </button>
                </div>

                {/* Message Input Box */}
                <div className="border-t border-slate-200 bg-white p-3.5 sm:p-4">
                  <div className="flex items-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-slate-500 hover:text-slate-800"
                      aria-label="Attach pitch deck or term sheet"
                      onClick={() => {
                        setDraft((prev) => `${prev} [Attached Data Room Document: TermSheet_Summary.pdf] `);
                      }}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>

                    <div className="flex-1 relative">
                      <textarea
                        rows={1}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        placeholder={`Message ${selected.participant_name}...`}
                        className="min-h-[42px] max-h-36 w-full resize-none rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-brand-orange-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-orange-500/20 transition-all"
                      />
                    </div>

                    <Button
                      variant="default"
                      size="icon"
                      onClick={() => handleSendMessage()}
                      disabled={!draft.trim()}
                      className="h-10 w-10 shrink-0 shadow-md shadow-brand-orange-500/20 bg-brand-orange-500 hover:bg-brand-orange-600 text-white"
                      aria-label="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-1">
                    <span>
                      Press <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] text-slate-500">Enter</kbd> to send · <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] text-slate-500">Shift + Enter</kbd> for new line
                    </span>
                    <span className="hidden sm:inline text-slate-400">
                      End-to-end encrypted deal room
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
                  <MessageSquare className="h-10 w-10 text-brand-orange-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Select a conversation</h3>
                  <p className="mt-1 text-sm text-slate-500 max-w-sm">
                    Choose an active thread to review deal terms, coordinate due diligence, and chat with investors.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Diligence Call Scheduler Modal */}
      {showCallModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  {callType === 'video' ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Schedule Diligence Call</h3>
                  <p className="text-xs text-slate-500">with {selected.participant_name} ({selected.participant_company})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCallModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">Meeting Type:</span>
                  <span>{callType === 'video' ? 'Google Meet / Zoom (25 min)' : 'Direct Line Call (15 min)'}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">Agenda:</span>
                  <span>Cap Table & Unit Economics Review</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Proposed Time</label>
                <select className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium text-slate-800">
                  <option>Tomorrow at 2:00 PM ET</option>
                  <option>Tomorrow at 4:30 PM ET</option>
                  <option>Thursday at 11:00 AM ET</option>
                  <option>Friday at 1:00 PM ET</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCallModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => {
                  setShowCallModal(false);
                  setCallScheduledNotice(true);
                  handleSendMessage(`I've proposed a 25-min Diligence Video Call for tomorrow at 2:00 PM ET. Looking forward to connecting!`);
                }}
              >
                Send Invite
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

