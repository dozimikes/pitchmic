'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  FileText,
  ShieldCheck,
  Scale,
  Lock,
  Building2,
  Briefcase,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Printer,
  Calendar,
  Search,
  ExternalLink,
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

const SECTIONS: Section[] = [
  { id: 'introduction', title: '1. Acceptance & User Personas', icon: Scale },
  { id: 'safe-harbor', title: '2. Regulatory & Safe Harbor Disclaimers', icon: AlertTriangle },
  { id: 'founder-ip', title: '3. Founder IP & Content Ownership', icon: Building2 },
  { id: 'diligence-rooms', title: '4. Diligence Data Rooms & Dynamic NDAs', icon: Lock },
  { id: 'ai-forensics', title: '5. AI Pitch Forensics & Scoring Limits', icon: ShieldCheck },
  { id: 'investor-standards', title: '6. Investor Standards & Direct Negotiations', icon: Briefcase },
  { id: 'accelerator-cohorts', title: '7. Accelerator Programs & Committee Decisions', icon: Layers },
  { id: 'subscriptions', title: '8. Subscriptions, Invoicing & Refunds', icon: FileText },
  { id: 'prohibited-conduct', title: '9. Prohibited Conduct & Integrity Violations', icon: AlertTriangle },
  { id: 'liability-limits', title: '10. Warranties & Limitation of Liability', icon: Scale },
  { id: 'governing-law', title: '11. Governing Law & Dispute Resolution', icon: Scale },
];

export default function TermsClient() {
  const [activeSection, setActiveSection] = React.useState('introduction');
  const [searchQuery, setSearchQuery] = React.useState('');

  React.useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 180;
      for (const section of SECTIONS) {
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

  const filteredSections = SECTIONS.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MarketingShell showNavbar={true} showFooter={true}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header Hero Banner */}
        <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8 text-white shadow-xl sm:p-12 mb-12 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-brand-orange-500/15 blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 h-80 w-80 rounded-full bg-brand-deep-pitch-500/15 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="bg-brand-orange-500/20 text-brand-orange-300 border-brand-orange-500/30 px-3 py-1">
                Legal Contract
              </Badge>
              <span className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Last Updated: September 2026 (Version 2.4)
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
              Pitchmic Terms of Service
            </h1>
            <p className="mt-4 text-base text-slate-300 leading-relaxed">
              These terms govern your access to and use of Pitchmic’s startup fundability intelligence platform,
              video pitch exchange, dynamic diligence data rooms, and term sheet execution workspaces.
              Please read carefully before engaging on the platform.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-2 border-slate-700 bg-slate-800/80 text-white hover:bg-slate-700"
              >
                <Printer className="h-4 w-4" />
                Print Terms
              </Button>
              <Link href="/privacy">
                <Button variant="ghost" size="sm" className="gap-2 text-slate-300 hover:text-white">
                  Privacy Policy <ExternalLink className="h-3.5 w-3.5" />
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
                  placeholder="Filter legal clauses..."
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
                          ? 'bg-brand-orange-50 text-brand-orange-700 font-semibold shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-orange-600' : 'text-slate-400')} />
                      <span className="truncate">{sec.title}</span>
                    </a>
                  );
                })}
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  Important Regulatory Note
                </p>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Pitchmic is an intelligence and due-diligence facilitation technology. We are not a registered broker-dealer or investment adviser.
                </p>
              </div>
            </div>
          </div>

          {/* Right Articles Content */}
          <div className="lg:col-span-8 space-y-10">
            {/* Section 1 */}
            <motion.section
              id="introduction"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-orange-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Scale className="h-4 w-4" /> Section 1
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Acceptance of Terms & User Personas</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you
                  (&ldquo;User&rdquo;, &ldquo;you&rdquo;) and <strong>Pitchmic Technologies Ltd.</strong> (&ldquo;Pitchmic&rdquo;,
                  &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;), governing access to the Pitchmic web application,
                  APIs, and intelligence infrastructure.
                </p>
                <p>Pitchmic provisions specific permissions tailored to three distinct user categories:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                    <p className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-brand-orange-500" /> Founder
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Publishes video pitches, manages diligence rooms, and negotiates term sheets.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                    <p className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4 text-brand-deep-pitch-500" /> Investor
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Evaluates startup forensics, accesses locked data rooms, and issues term sheets.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
                    <p className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-violet-600" /> Accelerator
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Manages cohort application intake, rubrics, and committee voting workflows.
                    </p>
                  </div>
                </div>
                <p>
                  By creating an account, authenticating via SSO, or browsing public intelligence portals, you
                  explicitly confirm you are of legal age and possess the authority to bind yourself or your represented organization.
                </p>
              </div>
            </motion.section>

            {/* Section 2 */}
            <motion.section
              id="safe-harbor"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-amber-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-amber-600 font-bold text-sm uppercase tracking-wider mb-2">
                <AlertTriangle className="h-4 w-4" /> Section 2
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Regulatory Safe Harbor & Disclaimers</h2>
              <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-4 text-xs text-amber-950 mb-4 leading-relaxed font-medium">
                <strong>CRITICAL REGULATORY NOTICE:</strong> Pitchmic is NOT a registered broker-dealer, financial adviser,
                investment bank, funding portal, or crowdfunding intermediary with the United States Securities and Exchange Commission (SEC),
                Financial Industry Regulatory Authority (FINRA), Nigerian Securities and Exchange Commission (SEC Nigeria), or the UK Financial Conduct Authority (FCA).
              </div>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  Pitchmic provides software infrastructure for data organization, due-diligence telemetry, and mutual discovery.
                  Under no circumstances shall Pitchmic:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-700">
                  <li>Hold, intermediate, escrow, or custody investment funds or cryptocurrency.</li>
                  <li>Endorse, recommend, or guarantee the performance of any startup, investment, or security.</li>
                  <li>Charge success fees or commissions contingent on the execution of capital investment.</li>
                  <li>Provide legal, accounting, tax, or fiduciary advice.</li>
                </ul>
                <p>
                  All investment offers, SAFEs (Simple Agreements for Future Equity), and convertible debt issued via the platform
                  are direct, bilateral agreements negotiated exclusively between accredited investors and private startup entities.
                </p>
              </div>
            </motion.section>

            {/* Section 3 */}
            <motion.section
              id="founder-ip"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-orange-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Building2 className="h-4 w-4" /> Section 3
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Founder IP & Content Ownership</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  <strong>You retain 100% intellectual property ownership</strong> of all materials uploaded to Pitchmic,
                  including pitch decks, video pitches, financial models, cap tables, customer contracts, and patents.
                </p>
                <p>
                  By uploading materials, you grant Pitchmic a limited, worldwide, non-exclusive, royalty-free license solely to:
                </p>
                <div className="space-y-2 text-xs text-slate-700 bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Host, transcode, stream, and render your video pitch according to your privacy settings.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Process slide deck pages through optical text extraction for your private fundability diagnostic report.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Generate viewer engagement telemetry (slide dwell time, heatmaps) accessible on your founder dashboard.</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Pitchmic will never claim equity ownership, licensing rights, or commercialization rights in your underlying inventions.
                </p>
              </div>
            </motion.section>

            {/* Section 4 */}
            <motion.section
              id="diligence-rooms"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-deep-pitch-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Lock className="h-4 w-4" /> Section 4
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Diligence Data Rooms & Dynamic NDAs</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  Pitchmic provides a 5-tier document classification architecture: <em>Public, Teaser, Diligence, Restricted, Vault</em>.
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-700">
                  <li><strong>Electronic NDA Execution:</strong> Requesting access to Restricted or Vault tiers prompts an electronic Non-Disclosure Agreement. Users agree that typing their credentials or clicking &ldquo;Sign & Request Access&rdquo; constitutes an enforceable electronic signature.</li>
                  <li><strong>Cryptographic Watermarking:</strong> Pitchmic embeds dynamic forensic watermarks (identifying viewer name, email, IP address, and timestamp) on all documents rendered in the diligence viewer.</li>
                  <li><strong>Right to Revoke:</strong> Founders may revoke investor access tokens at any time with immediate effect.</li>
                </ul>
              </div>
            </motion.section>

            {/* Section 5 */}
            <motion.section
              id="ai-forensics"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-violet-600 font-bold text-sm uppercase tracking-wider mb-2">
                <ShieldCheck className="h-4 w-4" /> Section 5
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">5. AI Pitch Forensics & Scoring Limits</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  Pitchmic’s 8-pillar fundability score, survival likelihoods, and rejection-risk forecasts are generated via
                  probabilistic machine learning models (Bayesian inference, XGBoost, and benchmark taxonomies).
                </p>
                <p className="font-semibold text-slate-900">
                  Users agree that diagnostic scores are algorithmic estimates and do NOT constitute:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    ✕ A guarantee of securing venture capital or grants.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    ✕ A certified valuation appraisal of enterprise worth.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    ✕ An endorsement by Pitchmic or institutional partners.
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    ✕ A replacement for independent legal or financial audits.
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Section 6 */}
            <motion.section
              id="investor-standards"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-deep-pitch-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Briefcase className="h-4 w-4" /> Section 6
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Investor Standards & Direct Negotiations</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  Users registered under the Investor category represent and warrant that they are accredited investors,
                  licensed venture capital managers, family offices, or institutional syndicates capable of bearing the risks of private illiquid assets.
                </p>
                <p>
                  Investors agree to conduct their own independent due diligence before signing SAFEs or transferring funds.
                </p>
              </div>
            </motion.section>

            {/* Section 7 */}
            <motion.section
              id="accelerator-cohorts"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-violet-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Layers className="h-4 w-4" /> Section 7
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Accelerator Programs & Committee Decisions</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  Accelerator program operators utilize Pitchmic for applicant triage, scoring rubrics, and committee consensus.
                  Pitchmic is an administrative software provider and bears no liability for cohort admission or grant award decisions made by accelerators.
                </p>
              </div>
            </motion.section>

            {/* Section 8 */}
            <motion.section
              id="subscriptions"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-brand-orange-600 font-bold text-sm uppercase tracking-wider mb-2">
                <FileText className="h-4 w-4" /> Section 8
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Subscriptions, Invoicing & Refunds</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  Paid plans (Founder Pro, Raise Pass, Enterprise Syndicates) are billed in advance on a recurring monthly or annual basis.
                  Payments are processed via secure authorized payment gateways (Paystack, Stripe).
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                  <li><strong>Cancellations:</strong> You may cancel your subscription anytime via Account Settings. Access remains active through the end of the current paid billing cycle.</li>
                  <li><strong>Refund Policy:</strong> Subscription fees are non-refundable except where required by mandatory consumer protection statutes or in cases of proven billing errors reported within 14 calendar days.</li>
                </ul>
              </div>
            </motion.section>

            {/* Section 9 */}
            <motion.section
              id="prohibited-conduct"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-red-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-red-600 font-bold text-sm uppercase tracking-wider mb-2">
                <AlertTriangle className="h-4 w-4" /> Section 9
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">9. Prohibited Conduct & Integrity Violations</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>Users must not:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-red-900 bg-red-50/60 p-4 rounded-xl border border-red-200">
                  <li>Fabricate financial metrics, cap table allocations, or customer traction figures.</li>
                  <li>Circumvent data room watermarks or distribute confidential pitch documents to third parties.</li>
                  <li>Scrape, reverse-engineer, or systematically harvest deal data using automated scrapers or bots.</li>
                  <li>Engage in harassment, unsolicited promotional spam, or money laundering schemes.</li>
                </ul>
              </div>
            </motion.section>

            {/* Section 10 */}
            <motion.section
              id="liability-limits"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-slate-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Scale className="h-4 w-4" /> Section 10
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">10. Warranties & Limitation of Liability</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  Pitchmic is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis.
                  To the maximum extent permitted by applicable law, Pitchmic disclaims all warranties of merchantability, fitness for a particular purpose, and non-infringement.
                </p>
                <p>
                  In no event shall Pitchmic&apos;s aggregate liability exceed the greater of the fees paid by you to Pitchmic in the preceding 12 months or USD $100.
                </p>
              </div>
            </motion.section>

            {/* Section 11 */}
            <motion.section
              id="governing-law"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs"
            >
              <div className="flex items-center gap-2 text-slate-600 font-bold text-sm uppercase tracking-wider mb-2">
                <Scale className="h-4 w-4" /> Section 11
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4">11. Governing Law & Contact</h2>
              <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-600 space-y-3">
                <p>
                  These Terms are governed by and construed in accordance with the laws of the jurisdiction in which Pitchmic is organized, without giving effect to conflict of laws principles.
                </p>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
                  <p className="font-semibold text-slate-900">Pitchmic Legal & Compliance Department</p>
                  <p className="text-slate-600">
                    For legal notices, contract inquiries, or regulatory submissions, reach our team via our official{' '}
                    <Link href="/contact" className="text-brand-orange-600 font-medium hover:underline">
                      Contact & Support Channel (/contact)
                    </Link>.
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    Direct corporate communications are managed through our authorized platform desk.
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
