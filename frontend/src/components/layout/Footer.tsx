'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mic, Twitter, Linkedin, Github, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/Separator';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';

interface FooterProps {
  variant?: 'dashboard' | 'marketing';
  className?: string;
}

const PRODUCT_LINKS = [
  { label: 'Newsfeed', href: '/newsfeed' },
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'For Startups', href: '/for-startups' },
  { label: 'For Investors', href: '/for-investors' },
];

const COMPANY_LINKS = [
  { label: 'About Us', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'Careers', href: '/careers' },
  { label: 'Press Kit', href: '/press' },
  { label: 'Contact', href: '/contact' },
];

const RESOURCE_LINKS = [
  { label: 'Help Center', href: '/help' },
  { label: 'Documentation', href: '/docs' },
  { label: 'Community', href: '/community' },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Partners', href: '/partners' },
];

const LEGAL_LINKS = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Cookie Policy', href: '/cookies' },
  { label: 'Security', href: '/security' },
];

export function Footer({ variant = 'marketing', className }: FooterProps) {
  const [email, setEmail] = React.useState('');

  if (variant === 'dashboard') {
    return (
      <footer className={cn('border-t border-slate-200 bg-white', className)}>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} PitchMic, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {LEGAL_LINKS.slice(0, 2).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-slate-700 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={cn('border-t border-slate-200 bg-slate-50', className)}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center">
              <Logo size="md" />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-600">
              Where founders and investors meet. Discover curated pitches,
              connect with vetted investors, and fund the next big thing.
            </p>
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                setEmail('');
              }}
            >
              <p className="mb-2 text-sm font-semibold text-slate-900">
                Stay in the loop
              </p>
              <div className="flex max-w-md gap-2">
                <Input
                  type="email"
                  placeholder="you@example.com"
                  aria-label="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 bg-white"
                />
                <Button
                  type="submit"
                  variant="default"
                  size="default"
                  className="shrink-0"
                >
                  Subscribe
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                No spam. Unsubscribe anytime.
              </p>
            </form>
            <div className="mt-6 flex items-center gap-3">
              {[
                { icon: Twitter, label: 'Twitter', href: '#' },
                { icon: Linkedin, label: 'LinkedIn', href: '#' },
                { icon: Github, label: 'GitHub', href: '#' },
              ].map(({ icon: Icon, label, href }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-3 lg:grid-cols-3">
            <FooterColumn title="Product" links={PRODUCT_LINKS} />
            <FooterColumn title="Company" links={COMPANY_LINKS} />
            <FooterColumn title="Resources" links={RESOURCE_LINKS} />
          </div>
        </div>

        <Separator className="my-10 bg-slate-200" />

        <div className="flex flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} PitchMic, Inc. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-slate-700 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

interface FooterColumnProps {
  title: string;
  links: Array<{ label: string; href: string }>;
}

function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900">
        {title}
      </h3>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-slate-600 hover:text-brand-orange-600 transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
