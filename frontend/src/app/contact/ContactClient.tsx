'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  ShieldCheck,
  Building2,
  Sparkles,
  Scale,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  Loader2,
  HelpCircle,
  ChevronDown,
  Copy,
  Check,
  ArrowRight,
  MapPin,
  Lock,
  Globe,
} from 'lucide-react';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

type TopicKey = 'legal' | 'founder' | 'investor' | 'accelerator' | 'support';

interface TopicOption {
  key: TopicKey;
  label: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultSubject: string;
}

const TOPICS: TopicOption[] = [
  {
    key: 'legal',
    label: 'Legal, Privacy & Compliance',
    badge: 'NDPR / GDPR / Terms',
    description: 'Data subject rights, regulatory inquiries, safe harbor, DPO requests, or term sheet queries.',
    icon: Scale,
    defaultSubject: 'Legal & Compliance Inquiry',
  },
  {
    key: 'founder',
    label: 'Founders & Startup Fundability',
    badge: 'Fundability & Diligence',
    description: 'Pitch video uploads, fundability assessment questions, digital data room setup, or cap table tools.',
    icon: Sparkles,
    defaultSubject: 'Founder Fundability & Data Room Assistance',
  },
  {
    key: 'investor',
    label: 'Investors & Syndicate Relations',
    badge: 'Institutional & Angels',
    description: 'Accreditation verification, deal flow access, committee workspaces, or API integration.',
    icon: Building2,
    defaultSubject: 'Investor Institutional Partnership',
  },
  {
    key: 'accelerator',
    label: 'Accelerators & Programs',
    badge: 'Cohort Management',
    description: 'Dynamic application forms, cohort evaluation pipelines, or ecosystem sponsorships.',
    icon: Globe,
    defaultSubject: 'Accelerator Program & Cohort Inquiry',
  },
  {
    key: 'support',
    label: 'Technical & Security Disclosure',
    badge: 'SLA Escalation',
    description: 'Platform bugs, authentication difficulties, or responsible vulnerability disclosures.',
    icon: ShieldCheck,
    defaultSubject: 'Technical Assistance & Security Inquiry',
  },
];

const FAQS = [
  {
    q: 'How fast will I receive a reply to my inquiry?',
    a: 'Our operations team reviews submissions within 12–24 business hours. Urgent compliance, data room access requests, and security vulnerability reports are automatically escalated to on-call duty engineers and our Data Protection Officer.',
  },
  {
    q: 'How do I exercise my data rights under NDPR or GDPR?',
    a: 'Select the "Legal, Privacy & Compliance" topic in the form above and detail your request (e.g. data export, cap table erasure, or profile correction). Our DPO will verify your account ownership and fulfill your request within the statutory timeline.',
  },
  {
    q: 'Are my message and attached documents kept confidential?',
    a: 'Yes. All submissions through this portal are encrypted in transit via TLS 1.3 and stored with AES-256 encryption. We never share founder data, cap tables, or pitch presentations with outside third parties without explicit authorization.',
  },
  {
    q: 'Can institutional investors request bespoke diligence API access?',
    a: 'Yes. Venture capital firms, angel syndicates, and family offices can request tailored access to our structured underwriting pipeline and digital diligence room APIs. Select "Investors & Syndicate Relations" above to begin.',
  },
];

function ContactContent() {
  const searchParams = useSearchParams();
  const initialTopicParam = searchParams.get('topic');

  const resolvedInitialTopic: TopicKey = React.useMemo(() => {
    if (initialTopicParam === 'legal' || initialTopicParam === 'privacy' || initialTopicParam === 'terms') {
      return 'legal';
    }
    if (initialTopicParam === 'founder' || initialTopicParam === 'startup') {
      return 'founder';
    }
    if (initialTopicParam === 'investor') {
      return 'investor';
    }
    if (initialTopicParam === 'accelerator') {
      return 'accelerator';
    }
    if (initialTopicParam === 'support' || initialTopicParam === 'security') {
      return 'support';
    }
    return 'founder';
  }, [initialTopicParam]);

  const [selectedTopic, setSelectedTopic] = React.useState<TopicKey>(resolvedInitialTopic);
  const [role, setRole] = React.useState<string>('Founder');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [organization, setOrganization] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [isConfidential, setIsConfidential] = React.useState(false);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [ticketResult, setTicketResult] = React.useState<{
    ticketId: string;
    receivedAt: string;
    message: string;
  } | null>(null);
  const [copiedTicket, setCopiedTicket] = React.useState(false);

  // Sync default subject when user changes topic if subject is empty or default
  React.useEffect(() => {
    const topicObj = TOPICS.find((t) => t.key === selectedTopic);
    if (topicObj && (!subject || TOPICS.some((t) => t.defaultSubject === subject))) {
      setSubject(topicObj.defaultSubject);
    }
  }, [selectedTopic]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setSubmitError('Please enter a valid work or personal email address.');
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      setSubmitError('Please enter a message of at least 10 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          organization: organization.trim(),
          role,
          topic: selectedTopic,
          subject: subject.trim(),
          message: message.trim(),
          isConfidential,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send inquiry. Please try again.');
      }

      setTicketResult({
        ticketId: data.ticketId,
        receivedAt: data.receivedAt,
        message: data.message,
      });
    } catch (err: any) {
      setSubmitError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTicket = () => {
    if (ticketResult?.ticketId) {
      navigator.clipboard.writeText(ticketResult.ticketId);
      setCopiedTicket(true);
      setTimeout(() => setCopiedTicket(false), 2000);
    }
  };

  const resetForm = () => {
    setTicketResult(null);
    setMessage('');
    setSubmitError(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="mb-10 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-brand-orange-700 shadow-xs mb-4">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Support & Communications Desk • Response Time: &lt; 24h
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          How can our team support you?
        </h1>
        <p className="mt-3 text-base sm:text-lg text-slate-600">
          Whether you are an African founder seeking fundability feedback, an investor setting up syndicate diligence, or need compliance verification under our terms and NDPR policies, we are here to assist.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Topics & Channels */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              Select an Inquiry Track
            </h2>
            <div className="space-y-3">
              {TOPICS.map((topic) => {
                const isSelected = selectedTopic === topic.key;
                const Icon = topic.icon;
                return (
                  <button
                    key={topic.key}
                    type="button"
                    onClick={() => setSelectedTopic(topic.key)}
                    className={cn(
                      'w-full text-left rounded-xl p-4 transition-all border text-sm flex items-start gap-3.5',
                      isSelected
                        ? 'border-brand-orange-500 bg-orange-50/50 shadow-xs ring-1 ring-brand-orange-500/30'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                    )}
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        isSelected
                          ? 'bg-brand-orange-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 truncate">{topic.label}</span>
                        <span
                          className={cn(
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap',
                            isSelected
                              ? 'bg-orange-200/80 text-orange-900'
                              : 'bg-slate-100 text-slate-600'
                          )}
                        >
                          {topic.badge}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">
                        {topic.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Regional Operations & Direct Notice Info */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-6 text-sm text-slate-600 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <MapPin className="h-4 w-4 text-brand-orange-500" /> Regional Operations & Inquiries
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pitchmic operates across Lagos, Nairobi, and distributed global hubs. Official notices, subpoena requests, and regulatory correspondence should be submitted through this desk for immediate tracking.
            </p>
            <div className="border-t border-slate-200/80 pt-3 flex flex-col gap-2 text-xs">
              <div className="flex justify-between text-slate-700">
                <span className="text-slate-500">Business Hours:</span>
                <span className="font-medium">08:00 – 18:00 (WAT / GMT+1)</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span className="text-slate-500">Urgent SLA:</span>
                <span className="font-medium text-emerald-600">&lt; 4 Hours (Security & Data Room)</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span className="text-slate-500">Standard Response:</span>
                <span className="font-medium">12–24 Business Hours</span>
              </div>
            </div>
          </div>

          {/* Direct Legal & Privacy Links */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600 flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">Looking for platform policies?</p>
              <p className="text-slate-500">Read our formal terms and NDPR / GDPR disclosures.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/terms"
                className="font-medium text-brand-orange-600 hover:text-brand-orange-700 hover:underline"
              >
                Terms
              </Link>
              <span className="text-slate-300">•</span>
              <Link
                href="/privacy"
                className="font-medium text-brand-orange-600 hover:text-brand-orange-700 hover:underline"
              >
                Privacy
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Contact Form or Success State */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
            <AnimatePresence mode="wait">
              {ticketResult ? (
                <motion.div
                  key="success-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6 text-center py-6"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Message Received</h2>
                    <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
                      {ticketResult.message}
                    </p>
                  </div>

                  <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Ticket Reference Number:</span>
                      <span>{new Date(ticketResult.receivedAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-base font-mono font-bold text-slate-900">
                        {ticketResult.ticketId}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyTicket}
                        className="h-8 gap-1.5 text-xs border-slate-300"
                      >
                        {copiedTicket ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy ID
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                      Save this reference ID. If follow-up correspondence is needed, our support engineers will quote this ticket code.
                    </p>
                  </div>

                  <div className="pt-2">
                    <Button type="button" onClick={resetForm} variant="outline" className="text-sm">
                      Send another message
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.form
                  key="form-card"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onSubmit={handleSubmit}
                  className="space-y-5"
                >
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Submit an Inquiry or Request
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Currently inquiring under:{' '}
                      <span className="font-semibold text-brand-orange-600">
                        {TOPICS.find((t) => t.key === selectedTopic)?.label}
                      </span>
                    </p>
                  </div>

                  {submitError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* Role Selector Pills */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      I am reaching out as a:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        'Founder',
                        'Investor / VC',
                        'Accelerator Lead',
                        'Legal / Counsel',
                        'Ecosystem Partner',
                        'Other',
                      ].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRole(r)}
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                            role === r
                              ? 'border-brand-orange-500 bg-brand-orange-50 text-brand-orange-700 font-semibold'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Name & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Your Full Name <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        type="text"
                        required
                        placeholder="Adaobi Okafor"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Work / Contact Email <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        type="email"
                        required
                        placeholder="adaobi@startup.africa"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                  </div>

                  {/* Organization & Subject */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Startup / Organization Name (Optional)
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. PayRoute Africa Ltd"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Subject Line
                      </label>
                      <Input
                        type="text"
                        required
                        placeholder="Summary of inquiry"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="bg-white"
                      />
                    </div>
                  </div>

                  {/* Message Body */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Detailed Message / Request <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={5}
                      required
                      placeholder="Please specify how we can help. For data room or compliance inquiries, include relevant profile details or specific statutory clauses."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  {/* Confidentiality Checkbox */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="confidential-check"
                      checked={isConfidential}
                      onChange={(e) => setIsConfidential(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-orange-600 focus:ring-brand-orange-500"
                    />
                    <label htmlFor="confidential-check" className="text-xs text-slate-600 cursor-pointer select-none">
                      <span className="font-semibold text-slate-900 block">
                        Mark as Proprietary / Strict NDA
                      </span>
                      Flag this communication for restricted access only accessible by authorized compliance officers and legal counsel.
                    </label>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-11 bg-brand-orange-600 hover:bg-brand-orange-700 text-white font-semibold text-sm shadow-sm gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Submitting Inquiry...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" /> Send Message to Pitchmic
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-[11px] text-center text-slate-400">
                    Protected by Pitchmic zero-training data guarantee. We never share submission contents with automated public LLMs.
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="mt-16 border-t border-slate-200 pt-12">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Frequently Asked Questions</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Quick answers regarding communications, data room security, and legal SLAs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto">
          {FAQS.map((faq, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-slate-300 transition-colors"
            >
              <h3 className="text-sm font-semibold text-slate-900 flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-brand-orange-500 shrink-0 mt-0.5" />
                {faq.q}
              </h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed pl-6">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ContactClient() {
  return (
    <MarketingShell showHeroBackground={true} showNavbar={true} showFooter={true}>
      <React.Suspense
        fallback={
          <div className="min-h-[400px] flex items-center justify-center text-slate-500 text-sm">
            <Loader2 className="h-6 w-6 animate-spin text-brand-orange-500 mr-2" />
            Loading Contact Desk...
          </div>
        }
      >
        <ContactContent />
      </React.Suspense>
    </MarketingShell>
  );
}
