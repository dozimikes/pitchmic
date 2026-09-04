import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type {
  DealHealthFactor,
  Instrument,
  IntentTier,
  InvestorTypeLabel,
  OfferPerspective,
  OfferStatus,
  ScoreColorScheme,
  StrategicFitLabel,
  TicketBucket,
} from '@/lib/types';
import { OfferStatus as OfferStatusEnum } from '@/lib/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

export function formatCompactCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`.replace('.00M', 'M');
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function formatDate(
  date: string | Date,
  locale: string = 'en-US',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return 'Invalid date';
  }
  return new Intl.DateTimeFormat(locale, options).format(d);
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${diffYear}y ago`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length - 1).trimEnd() + '…';
}

export type IntentDisplayTier =
  | 'LOW'
  | 'WARM'
  | 'HIGH CONVICTION'
  | 'VERY HIGH CONVICTION';

export function tierFromScore(score: number | null | undefined): IntentDisplayTier {
  if (score === null || score === undefined || Number.isNaN(score)) return 'LOW';
  const s = Math.max(0, Math.min(100, score));
  if (s >= 80) return 'VERY HIGH CONVICTION';
  if (s >= 55) return 'HIGH CONVICTION';
  if (s >= 30) return 'WARM';
  return 'LOW';
}

export function intentTierFromLabel(
  tier: IntentTier | string | null | undefined
): IntentDisplayTier {
  if (!tier) return 'LOW';
  const t = String(tier);
  switch (t) {
    case 'IMMINENT_TERM_SHEET':
      return 'VERY HIGH CONVICTION';
    case 'HIGH_CONVICTION':
      return 'HIGH CONVICTION';
    case 'WARM':
      return 'WARM';
    case 'COLD':
    default:
      return 'LOW';
  }
}

export function arrowLabelFromFactor(factor: DealHealthFactor): string {
  switch (factor) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'flat':
    default:
      return '→';
  }
}

export function instrumentFromTerms(
  terms: string | null | undefined,
  equityPct: string | number | null | undefined
): Instrument {
  const t = (terms ?? '').toLowerCase();
  if (!t && equityPct === undefined) return 'Unknown';
  if (t.includes('safe')) return 'SAFE';
  if (t.includes('convertible') || t.includes('note')) return 'Convertible Note';
  if (t.includes('debt') || t.includes('loan')) return 'Debt';
  if (t.includes('equity') || t.includes('priced') || t.includes('series')) return 'Equity';
  const eq = Number(equityPct ?? 0);
  if (t.length > 0) return 'Other';
  if (eq > 0 && eq <= 20) return 'SAFE';
  return 'Unknown';
}

const VC_INDICATORS = [
  'vc',
  'venture',
  'capital',
  'partners',
  'ventures',
  'fund',
  'capital partners',
  'sequoia',
  'a16z',
  'accel',
  'benchmark',
  'greylock',
];
const ANGEL_INDICATORS = ['angel', 'syndicate', 'angels'];
const FAMILY_INDICATORS = ['family office', 'familyoffice', 'holdings'];
const CORPORATE_INDICATORS = ['corporate', 'ventures llc', 'strategic', 'cvc'];
const ACCELERATOR_INDICATORS = [
  'accelerator',
  'incubator',
  'y combinator',
  'yc',
  'techstars',
  '500 startups',
  'antler',
];

export function investorTypeFromCompany(
  companyName: string | null | undefined
): InvestorTypeLabel {
  const name = (companyName ?? '').toLowerCase().trim();
  if (!name) return 'Unknown';
  if (ACCELERATOR_INDICATORS.some((i) => name.includes(i))) return 'Accelerator';
  if (FAMILY_INDICATORS.some((i) => name.includes(i))) return 'Family Office';
  if (CORPORATE_INDICATORS.some((i) => name.includes(i))) return 'Corporate';
  if (ANGEL_INDICATORS.some((i) => name.includes(i))) return 'Angel';
  if (VC_INDICATORS.some((i) => name.includes(i))) return 'VC';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return 'Angel';
  return 'VC';
}

export function ticketBucket(amount: string | number | null | undefined): TicketBucket {
  const n = Number(amount ?? 0);
  if (Number.isNaN(n) || n <= 0) return '<$100K';
  if (n < 100_000) return '<$100K';
  if (n < 500_000) return '$100K–$500K';
  if (n < 1_000_000) return '$500K–$1M';
  return '$1M+';
}

export function strategicFitFromMatch(
  matchScoreOrDims:
    | number
    | null
    | undefined
    | { industry?: number; stage?: number; ticket_size?: number; location?: number; semantic?: number }
    | null
): StrategicFitLabel {
  let score: number;
  if (matchScoreOrDims === null || matchScoreOrDims === undefined) {
    return 'Medium';
  }
  if (typeof matchScoreOrDims === 'number') {
    score = matchScoreOrDims;
  } else {
    const d = matchScoreOrDims;
    const vals = [d.industry, d.stage, d.ticket_size, d.location, d.semantic]
      .filter((v): v is number => typeof v === 'number');
    score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 70;
  }
  if (score >= 80) return 'High';
  if (score >= 55) return 'Medium';
  return 'Low';
}

export function followOnCapacityFromAmount(
  offerAmount: string | number | null | undefined,
  investorMaxStr: string | number | null | undefined
): 'High' | 'Medium' | 'Low' {
  const amt = Number(offerAmount ?? 0);
  const max = Number(investorMaxStr ?? 0);
  if (amt <= 0) return 'Medium';
  if (max <= 0) return 'Medium';
  const ratio = max / amt;
  if (ratio >= 4) return 'High';
  if (ratio >= 2) return 'Medium';
  return 'Low';
}

export function statusDisplayLabel(
  status: OfferStatus | string,
  perspective: OfferPerspective
): string {
  switch (status as OfferStatusEnum) {
    case OfferStatusEnum.DRAFT:
      return perspective === 'startup' ? 'Pending Response' : 'Draft';
    case OfferStatusEnum.SENT:
      return perspective === 'startup'
        ? 'Under Review'
        : 'Sent · Awaiting reply';
    case OfferStatusEnum.NEGOTIATING:
      return 'Negotiating';
    case OfferStatusEnum.ACCEPTED:
      return 'Accepted';
    case OfferStatusEnum.REJECTED:
      return 'Rejected';
    case OfferStatusEnum.WITHDRAWN:
      return perspective === 'startup' ? 'Investor withdrew' : 'Withdrawn';
    case OfferStatusEnum.EXPIRED:
      return 'Expired';
    default:
      return String(status);
  }
}

export function scoreBarColorClasses(
  scheme: ScoreColorScheme,
  value: number | null | undefined
): string {
  const v = value === null || value === undefined || Number.isNaN(value) ? -1 : Math.max(0, Math.min(100, value));
  const byValue = (): string => {
    if (v < 0) return 'bg-slate-200';
    if (v >= 80) return 'bg-emerald-500';
    if (v >= 60) return 'bg-emerald-400';
    if (v >= 40) return 'bg-amber-400';
    if (v >= 20) return 'bg-orange-500';
    return 'bg-red-500';
  };
  switch (scheme) {
    case 'match':
      return v >= 0
        ? v >= 85
          ? 'bg-gradient-to-r from-brand-deep-pitch-500 to-indigo-500'
          : v >= 65
          ? 'bg-gradient-to-r from-brand-deep-pitch-400 to-indigo-400'
          : v >= 40
          ? 'bg-sky-400'
          : 'bg-slate-400'
        : 'bg-slate-200';
    case 'intent':
      return v >= 0
        ? v >= 80
          ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
          : v >= 55
          ? 'bg-emerald-400'
          : v >= 30
          ? 'bg-amber-400'
          : 'bg-orange-400'
        : 'bg-slate-200';
    case 'close':
      return v >= 0
        ? v >= 80
          ? 'bg-gradient-to-r from-brand-orange-500 to-amber-500'
          : v >= 55
          ? 'bg-brand-orange-400'
          : v >= 30
          ? 'bg-amber-400'
          : 'bg-rose-400'
        : 'bg-slate-200';
    case 'generic':
    default:
      return byValue();
  }
}

export function dealHealthTierColor(tier: string): string {
  const t = tier.toLowerCase();
  if (t === 'exceptional') return 'text-emerald-600';
  if (t === 'strong') return 'text-brand-deep-pitch-600';
  if (t === 'moderate') return 'text-amber-600';
  return 'text-slate-600';
}

export function impliedValuationFromOffer(
  amount: string | number | null | undefined,
  equityPct: string | number | null | undefined,
  explicitValuation: string | number | null | undefined
): number | null {
  if (explicitValuation !== null && explicitValuation !== undefined && Number(explicitValuation) > 0) {
    return Number(explicitValuation);
  }
  const amt = Number(amount ?? 0);
  const eq = Number(equityPct ?? 0);
  if (amt > 0 && eq > 0) {
    return Math.round(amt / (eq / 100));
  }
  return null;
}

export function numOr(v: number | null | undefined, fallback: number): number {
  return v === null || v === undefined || Number.isNaN(v) ? fallback : v;
}

export function strOrEmpty(v: string | null | undefined): string {
  return v ?? '';
}
