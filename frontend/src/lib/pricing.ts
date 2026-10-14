export type BillingCycle = 'monthly' | 'yearly';

export type PricingPlan = {
  slug: string;
  name: string;
  priceLabel: string;
  /**
   * Monthly amount in USD cents (e.g. 900 = $9.00).
   * Paystack receives this in the smallest currency unit of the settlement
   * currency configured on your Paystack account.
   */
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  description: string;
  popular?: boolean;
  cta: string;
  features: string[];
};

// ---------------------------------------------------------------------------
// Discount configuration
// ---------------------------------------------------------------------------

/** Yearly discount as a fraction (0.05 = 5%). */
export const YEARLY_DISCOUNT = 0.05;

// ---------------------------------------------------------------------------
// Plan catalogue  (amounts in USD cents)
// ---------------------------------------------------------------------------

export const PAYSTACK_PLANS: Record<string, PricingPlan> = {
  free: {
    slug: 'free',
    name: 'Free',
    priceLabel: '$0',
    amount: 0,
    currency: 'USD',
    billingCycle: 'monthly',
    description: 'For founders who want to understand where they stand.',
    cta: 'Start for free',
    features: [
      'Startup profile',
      'Basic fundability assessment',
      'Evidence checklist',
      'Funding opportunity discovery',
    ],
  },
  'founder-pro': {
    slug: 'founder-pro',
    name: 'Founder Pro',
    priceLabel: '$9',
    amount: 900,        // $9.00 / month
    currency: 'USD',
    billingCycle: 'monthly',
    description: 'Built for founders preparing for real fundraising conversations.',
    popular: true,
    cta: 'Get Founder Pro',
    features: [
      'Full fundability assessment',
      'Evidence vault and tracking',
      'Deck-to-profile consistency checks',
      'Fundability roadmap',
      'Priority opportunity matching',
      'Fundraising pipeline tracker',
      'Application Intelligence engine',
    ],
  },
  'raise-pass': {
    slug: 'raise-pass',
    name: 'Raise Pass',
    priceLabel: '$25',
    amount: 2500,       // $25.00 / 30 days
    currency: 'USD',
    billingCycle: 'monthly',
    description: 'Access the full founder engine for a focused fundraising sprint.',
    cta: 'Get Raise Pass',
    features: [
      '30-day founder engine access',
      'Red-team review',
      'Application readiness checks',
      'Fast improvement roadmap',
      'Reassessment after updates',
      'Fundraising pipeline tracker',
      'Application Intelligence engine',
    ],
  },
};

// ---------------------------------------------------------------------------
// Core lookup
// ---------------------------------------------------------------------------

export function getPricingPlanBySlug(slug: string): PricingPlan | undefined {
  return PAYSTACK_PLANS[slug];
}

// ---------------------------------------------------------------------------
// Amount helpers  (all return USD cents)
// ---------------------------------------------------------------------------

/**
 * Returns the total charge in USD cents for the given billing cycle.
 *
 * monthly → base amount unchanged
 * yearly  → base × 12 × (1 − YEARLY_DISCOUNT) = 5% off the full annual price
 *
 * Examples (Founder Pro, $9/mo = 900 cents):
 *   monthly → 900               ($9.00)
 *   yearly  → 900×12×0.95=10260  ($102.60/year)
 *
 * Examples (Raise Pass, $25/mo = 2500 cents):
 *   monthly → 2500              ($25.00)
 *   yearly  → 2500×12×0.95=28500 ($285.00/year)
 */
export function getRecurringPlanAmount(slug: string, cycle: BillingCycle): number {
  const plan = getPricingPlanBySlug(slug);
  if (!plan || plan.amount === 0) return 0;

  if (cycle === 'yearly') {
    return Math.round(plan.amount * 12 * (1 - YEARLY_DISCOUNT));
  }

  return plan.amount;
}

/**
 * Full annual price with NO discount (12 × monthly).
 * Used to show the "was" / crossed-out price beside the discounted yearly total.
 */
export function getFullAnnualAmount(slug: string): number {
  const plan = getPricingPlanBySlug(slug);
  if (!plan) return 0;
  return plan.amount * 12;
}

/**
 * How much the user saves per year vs paying monthly for 12 months.
 * savingsAmount = fullAnnual − discountedAnnual
 */
export function getYearlySavingsAmount(slug: string): number {
  return getFullAnnualAmount(slug) - getRecurringPlanAmount(slug, 'yearly');
}

/**
 * Effective per-month cost when billed yearly (rounded to nearest cent).
 */
export function getEffectiveMonthlyAmount(slug: string): number {
  return Math.round(getRecurringPlanAmount(slug, 'yearly') / 12);
}

// ---------------------------------------------------------------------------
// Formatter  - converts cents → "$X.XX" USD string
// ---------------------------------------------------------------------------

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// ---------------------------------------------------------------------------
// Formatted price details (ready for the UI)
// ---------------------------------------------------------------------------

export interface PriceDetails {
  /** Total charge in USD cents. */
  amount: number;
  currency: string;
  /** Formatted total charge, e.g. "$102.60". */
  label: string;
  /**
   * Effective per-month cost on yearly billing, e.g. "$8.55/mo".
   * null for monthly billing.
   */
  perMonthLabel: string | null;
  /**
   * Annual savings vs paying monthly, e.g. "Save $5.40/year".
   * null for monthly billing or free plans.
   */
  savingsLabel: string | null;
}

export function getPriceDetails(slug: string, cycle: BillingCycle): PriceDetails {
  const plan = getPricingPlanBySlug(slug);
  if (!plan) {
    return { amount: 0, currency: 'USD', label: '$0.00', perMonthLabel: null, savingsLabel: null };
  }

  const amount = getRecurringPlanAmount(slug, cycle);
  const label = plan.amount === 0 ? '$0' : formatUSD(amount);

  if (cycle === 'yearly' && plan.amount > 0) {
    return {
      amount,
      currency: 'USD',
      label,
      perMonthLabel: `${formatUSD(getEffectiveMonthlyAmount(slug))}/mo`,
      savingsLabel: `Save ${formatUSD(getYearlySavingsAmount(slug))}/year`,
    };
  }

  return { amount, currency: 'USD', label, perMonthLabel: null, savingsLabel: null };
}
