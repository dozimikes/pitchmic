'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Lock,
  Eye,
  Database,
  Server,
  Share2,
  FileCheck,
  UserCheck,
  Printer,
  Calendar,
  Search,
  ExternalLink,
  Cpu,
  Mail,
} from 'lucide-react';
import { MarketingShell } from '@/components/layout/MarketingShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface Section {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIVACY_SECTIONS: Section[] = [
  { id: 'scope', title: '1. Regulatory Scope & Principles', icon: ShieldCheck },
  { id: 'data-collected', title: '2. Information We Collect', icon: Database },
  { id: 'telemetry-data', title: '3. Diligence Telemetry & Heatmap Analytics', icon: Eye },
  { id: 'ai-governance', title: '4. AI Forensics & Model Privacy Safeguards', icon: Cpu },
  { id: 'usage-purposes', title: '5. How We Use Information', icon: Server },
  { id: 'data-sharing', title: '6. Controlled Sharing & Sub-Processors', icon: Share2 },
  { id: 'security-measures', title: '7. Cryptographic Security & Vault Encryption', icon: Lock },
  { id: 'retention-schedule', title: '8. Data Retention & Archival Policies', icon: Calendar },
  { id: 'user-rights', title: '9. Your Rights as a Data Subject', icon: UserCheck },
  { id: 'dpo-contact', title: '10. Data Protection Officer & Inquiries', icon: Mail },
];

export default function PrivacyClient() {
  const [activeSection, setActiveSection] = React.useState('scope');
  const [searchQuery, setSearchQuery] = React.useState('');

  React.useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 180;
      for (const section of PRIVACY_SECTIONS) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  const filteredSections = PRIVACY_SECTIONS.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MarketingShell showNavbar={true} showFooter={true}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header Hero Banner */}
        <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 text-white shadow-xl sm:p-12 mb-12 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-brand-orange-500/15 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-3 py-1">
                NDPR & GDPR Compliant
              </Badge>
              <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Last Revised: September 2026 (Version 2.4)
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Pitchmic Privacy Policy
            </h1>
            <p className="mt-4 text-base text-slate-300 leading-relaxed">
              We treat confidential founder decks, cap table records, and investment diligence data with
              bank-grade security. Learn how we collect, protect, and process information under global standards.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-2 border-slate-700 bg-slate-800/80 text-white hover:bg-slate-700"
              >
                <Printer className="h-4 w-4" />
                Print Policy
              </Button>
              <Link href="/terms">
                <Button variant="ghost" size="sm" className="gap-2 text-slate-300 hover:text-white">
                  Terms of Service <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Main Content Layout with Sticky Sidebar */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
          {/* Left Navigation Sidebar */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Filter privacy topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {filteredSections.map((sec) => {
                  const Icon = sec.icon;
                  const isActive = activeSection === sec.id;
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all',
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 font-semibold shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-emerald-600' : 'text-slate-400')} />
                      <span className="truncate">{sec.title}</span>
                    </a>
                  );
                })}
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-950">
                <p className="font-semibold flex items-center gap-1.5 mb-1 text-emerald-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  Our Core Guarantee
                </p>
                <p className="text-[11px] leading-relaxed text-emerald-800">
                  We never sell founder deal data or feed proprietary pitch decks into public artificial intelligence models.
                </p>
              </div>
            </div>
          </div>

          {/* Right Articles Content */}
          <div className="lg:col-span-8 space-y-10">
            {/* Section 1 */}
            <motion.section
              id="scope"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-wider mb-2">
                <ShieldCheck className="h-4 w-4" /> Section 1
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Regulatory Scope & Privacy Principles</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  <strong>Pitchmic Technologies Ltd.</strong> (&ldquo;Pitchmic&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;)
                  operates under strict data protection principles designed to comply with:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                  <li><strong>Nigeria Data Protection Act (NDPA 2023 / NDPR)</strong></li>
                  <li><strong>General Data Protection Regulation (EU GDPR 2016/679)</strong></li>
                  <li><strong>Protection of Personal Information Act (South Africa POPIA)</strong></li>
                  <li><strong>California Consumer Privacy Act (CCPA / CPRA)</strong></li>
                </ul>
                <p>
                  This Privacy Policy applies to all personal, financial, and organizational data collected across the Pitchmic platform,
                  deal rooms, API endpoints, and mobile-accessible interfaces.
                </p>
              </div>
            </motion.section>

            {/* Section 2 */}
            <motion.section
              id="data-collected"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-orange-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Database className="h-4 w-4" /> Section 2
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Categories of Information We Collect</h2>
              <div className="space-y-4 text-sm text-slate-600">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="font-bold text-slate-900 text-sm">A. Account & Contact Credentials</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Full name, work email, phone number, corporate physical address, encrypted passwords, and OAuth identifiers (Google, LinkedIn).
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="font-bold text-slate-900 text-sm">B. Startup Intelligence & Financial Data</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Company legal name, registration number, incorporation jurisdiction, monthly recurring revenue (MRR), burn rate, runway, valuation targets, cap table breakdown, co-founder details, and pitch decks.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="font-bold text-slate-900 text-sm">C. Investor & Firm Mandates</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Firm name, investment stage focus, check size thresholds, geographic mandate, accredited investor verification assertions, and issued term sheets.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <p className="font-bold text-slate-900 text-sm">D. Video Pitch Recordings & Audio Transcripts</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Founder video pitch recordings uploaded or recorded via the browser, accompanying audio tracks, and automated transcripts.
                  </p>
                </div>
              </div>
            </motion.section>

            {/* Section 3 */}
            <motion.section
              id="telemetry-data"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-deep-pitch-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Eye className="h-4 w-4" /> Section 3
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Diligence Telemetry & Heatmap Analytics</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  When an investor or evaluator accesses a startup&apos;s diligence data room or pitch deck, Pitchmic records
                  granular session telemetry to power founder deal intelligence:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Slide-by-Slide Dwell Time:</strong> Seconds spent analyzing each financial or product slide.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Drop-Off Rates:</strong> Points at which viewers exit deck presentations.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Viewer Identity Audit:</strong> Authenticated investor name, firm, and timestamp.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Forensic Audit Trail:</strong> Document download attempts, watermark identifiers, and IP geolocation.
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  This telemetry is visible strictly to the authorized startup founder and their designated team members.
                </p>
              </div>
            </motion.section>

            {/* Section 4 */}
            <motion.section
              id="ai-governance"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-emerald-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Cpu className="h-4 w-4" /> Section 4
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">4. AI Forensics & Model Privacy Safeguards</h2>
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-950 mb-3 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <FileCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  Zero Public Training Model Commitment
                </p>
                <p className="leading-relaxed">
                  Confidential founder pitch decks, private cap tables, customer contracts, and patent disclosures uploaded to Pitchmic
                  are NEVER used to train, fine-tune, or calibrate public commercial artificial intelligence models (such as public OpenAI, Anthropic, or Gemini foundation models).
                </p>
              </div>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-2">
                <p>
                  Pitchmic utilizes isolated, private Bayesian networks and XGBoost algorithms hosted in dedicated containerized clusters.
                  Text extraction is executed ephemerally in volatile memory without retaining raw training vectors in public repositories.
                </p>
              </div>
            </motion.section>

            {/* Section 5 */}
            <motion.section
              id="usage-purposes"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-orange-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Server className="h-4 w-4" /> Section 5
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">5. How We Use Collected Information</h2>
              <ul className="list-disc pl-5 space-y-2 text-xs text-slate-700">
                <li><strong>Identity & Accredited Status Verification:</strong> Mitigating impersonation, fraudulent entities, and unauthorized access to private corporate data.</li>
                <li><strong>Diagnostic Scoring:</strong> Computing objective 8-pillar fundability metrics, stage inference, and actionable improvement recommendations.</li>
                <li><strong>Smart Matchmaking:</strong> Matching founders with investors whose thesis (sector, check size, geography) strictly aligns with the startup profile.</li>
                <li><strong>Dynamic Watermarking:</strong> Burning recipient identifiers onto confidential files to deter unauthorized leakage.</li>
              </ul>
            </motion.section>

            {/* Section 6 */}
            <motion.section
              id="data-sharing"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-deep-pitch-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Share2 className="h-4 w-4" /> Section 6
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Controlled Sharing & Sub-Processors</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  <strong>We do not sell, rent, or monetize your personal or deal data.</strong> Information is shared only under specific circumstances:
                </p>
                <div className="space-y-2 text-xs text-slate-700">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Founder-Directed Sharing:</strong> When a founder grants data room access or applies to an accelerator cohort.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Payment Gateways:</strong> Paystack and Stripe for payment card processing under PCI-DSS Level 1 compliance.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Hosting & Cloud Infrastructure:</strong> AWS (S3 encrypted object storage), managed PostgreSQL instances, and Redis caching.
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Section 7 */}
            <motion.section
              id="security-measures"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Lock className="h-4 w-4" /> Section 7
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Cryptographic Security & Vault Encryption</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-700">
                  <li><strong>Encryption in Transit:</strong> TLS 1.3 enforced across all web, API, and WebSocket channels.</li>
                  <li><strong>Encryption at Rest:</strong> AES-256 bit encryption on database volumes and S3 storage.</li>
                  <li><strong>Access Tokens:</strong> Time-limited, signed URLs expiring after 60 minutes for private document viewing.</li>
                  <li><strong>Role-Based Access Control:</strong> Strict tenant isolation preventing cross-tenant data leaks.</li>
                </ul>
              </div>
            </motion.section>

            {/* Section 8 */}
            <motion.section
              id="retention-schedule"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-orange-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Calendar className="h-4 w-4" /> Section 8
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Data Retention & Archival Policies</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  Account data is retained for the duration of an active user account. Upon account deletion,
                  confidential pitch decks, cap tables, and video recordings are permanently expunged within 30 calendar days.
                </p>
                <p className="text-xs text-slate-500">
                  Audit logs (e.g. NDA electronic signature timestamps) may be retained up to 7 years to comply with statutory legal and corporate audit mandates.
                </p>
              </div>
            </motion.section>

            {/* Section 9 */}
            <motion.section
              id="user-rights"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-violet-600 font-bold text-sm uppercase tracking-wider mb-2">
                <UserCheck className="h-4 w-4" /> Section 9
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">9. Your Rights as a Data Subject</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>Under NDPA, GDPR, and POPIA, you have the right to:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Right of Access:</strong> Request a complete machine-readable copy of your personal data.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Right to Rectification:</strong> Correct inaccurate corporate or founder records.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Right to Erasure:</strong> Request permanent deletion of uploaded pitch assets.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong>Right to Revoke:</strong> Instantly cancel data room access granted to any investor.
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Section 10 */}
            <motion.section
              id="dpo-contact"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Mail className="h-4 w-4" /> Section 10
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">10. Data Protection Officer & Inquiries</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  To exercise any statutory data privacy right or report potential security disclosures, contact our Data Protection Officer:
                </p>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
                  <p className="font-semibold text-slate-900">Pitchmic Data Protection Office</p>
                  <p className="text-slate-600">
                    To submit data subject requests, compliance inquiries, or security disclosures, reach our team via our{' '}
                    <Link href="/contact" className="text-emerald-600 font-medium hover:underline">
                      Privacy & Compliance Desk (/contact)
                    </Link>.
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    All inquiries are routed directly to our designated Data Protection Officer and Security Operations group.
                  </p>
                </div>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
