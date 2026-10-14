/**
 * useResolvedPlan
 * ---------------
 * Resolves the authenticated user's current subscription plan into one of
 * three canonical tiers used for feature-gating across the app.
 *
 * Reads from whichever plan field the backend populates on the user cookie:
 *   user.subscription_plan | user.plan | user.stripe_plan
 */

import { useAuth } from '@/hooks/useAuth';
import type { User } from '@/lib/types';
import { PLAN_NAMES } from '@/lib/fundabilityApi';

export type ResolvedPlan = 'free' | 'pro' | 'raise-pass';

export interface ResolvedPlanResult {
  plan: ResolvedPlan;
  isPaidPlan: boolean;
  /** null = unlimited re-assessments; number = quota cap */
  reassessmentQuota: number | null;
}

export function useResolvedPlan(): ResolvedPlanResult {
  const { user } = useAuth();
  const asAny = user as (User & { subscription_plan?: string; plan?: string; stripe_plan?: string }) | null;
  const raw = (
    asAny?.subscription_plan ?? asAny?.plan ?? asAny?.stripe_plan ?? 'free'
  ).toLowerCase();

  if (raw.includes('raise') || raw === PLAN_NAMES.RAISE_PASS) {
    return { plan: 'raise-pass', isPaidPlan: true, reassessmentQuota: null };
  }
  if (raw.includes('pro') || raw === PLAN_NAMES.PRO) {
    return { plan: 'pro', isPaidPlan: true, reassessmentQuota: null };
  }
  return { plan: 'free', isPaidPlan: false, reassessmentQuota: 1 };
}
