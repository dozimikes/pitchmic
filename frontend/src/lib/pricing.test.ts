import { describe, it, expect } from 'vitest';
import { getPricingPlanBySlug, getRecurringPlanAmount } from './pricing';

describe('pricing logic', () => {
  it('returns the founder pro recurring pricing details', () => {
    const plan = getPricingPlanBySlug('founder-pro');

    expect(plan).toBeTruthy();
    expect(plan?.name).toBe('Founder Pro');
    expect(plan?.billingCycle).toBe('monthly');
    expect(getRecurringPlanAmount('founder-pro', 'monthly')).toBe(900);
    expect(getRecurringPlanAmount('founder-pro', 'yearly')).toBe(9000);
  });
});
