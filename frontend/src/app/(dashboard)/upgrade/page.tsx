'use client';

import * as React from 'react';
import { Sparkles, Check, Zap, BarChart3, MessageSquare, Star } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Everything you need to get started.',
    current: true,
    popular: false,
    features: [
      '1 active pitch',
      'Basic analytics',
      'Standard placement',
      'Community support',
    ],
    cta: 'Current plan',
    variant: 'outline' as const,
    disabled: true,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'Serious founders and active investors.',
    current: false,
    popular: true,
    features: [
      'Unlimited pitches',
      'Advanced analytics & funnel',
      'Priority placement in discover',
      'Direct investor messaging',
      'PDF pitch export',
      'Custom pitch deck domain',
    ],
    cta: 'Upgrade to Pro',
    variant: 'default' as const,
    disabled: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For funds and accelerators.',
    current: false,
    popular: false,
    features: [
      'Everything in Pro',
      'White-label branding',
      'Bulk investor outreach',
      'Dedicated account manager',
      'SLA & priority support',
      'API access',
    ],
    cta: 'Contact sales',
    variant: 'secondary' as const,
    disabled: false,
  },
] as const;

export default function UpgradePage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="inline-flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Upgrade PitchMic
          </h1>
          <Badge variant="default" className="bg-brand-deep-pitch-500">
            <Sparkles className="mr-1 h-3 w-3" />
            Pro
          </Badge>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Unlock analytics, priority placement, and direct investor messaging.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: BarChart3, title: 'Deep analytics', desc: 'Funnel views, engagement rates, time-series charts.' },
          { icon: Zap, title: 'Priority placement', desc: 'Your pitch surfaces first in Discover and Newsfeed.' },
          { icon: MessageSquare, title: 'Direct messaging', desc: 'Message investors directly without waiting for an offer.' },
        ].map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="border-slate-200 bg-gradient-to-br from-white to-slate-50/60">
            <CardContent className="flex items-start gap-3 p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-orange-500/10 to-brand-deep-pitch-500/10">
                <Icon className="h-4.5 w-4.5 text-brand-orange-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pricing cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <Card
            key={plan.name}
            className={cn(
              'relative border-slate-200',
              plan.popular && 'border-brand-orange-400 shadow-lg shadow-brand-orange-500/10',
            )}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="default" className="bg-brand-orange-500 text-white shadow-sm">
                  <Star className="mr-1 h-3 w-3 fill-current" />
                  Most popular
                </Badge>
              </div>
            )}
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold text-slate-900">{plan.name}</CardTitle>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                {plan.period && <span className="mb-1 text-sm text-slate-500">{plan.period}</span>}
              </div>
              <p className="text-xs text-slate-500">{plan.description}</p>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.name === 'Enterprise' ? (
                <Link href="mailto:sales@pitchmic.com" className="block">
                  <Button variant={plan.variant} size="default" className="w-full">
                    {plan.cta}
                  </Button>
                </Link>
              ) : (
                <Button
                  variant={plan.variant}
                  size="default"
                  className={cn(
                    'w-full',
                    plan.popular && 'shadow-md shadow-brand-orange-500/20',
                  )}
                  disabled={plan.disabled}
                >
                  {plan.cta}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-slate-400">
        Payments powered by Stripe. Cancel any time. All prices USD.
      </p>
    </div>
  );
}
