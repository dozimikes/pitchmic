import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

const BASE = SITE_URL;
const now  = new Date();

/**
 * sitemap.ts - served at /sitemap.xml
 *
 * All public routes are included. Dashboard routes are listed because they
 * carry unique, keyword-rich metadata that helps AI answer engines and Google
 * understand the product's full surface area - even if some require login.
 *
 * Priority scale:
 *   1.0  Landing page
 *   0.9  Core value proposition pages (fundability, discover, app intel)
 *   0.8  Pricing + sign-up conversion pages
 *   0.7  Sub-profile / feature pages
 *   0.6  Utility and account pages
 *   0.5  Auth
 */
type Entry = MetadataRoute.Sitemap[number];

function url(
  path: string,
  priority: number,
  freq: MetadataRoute.Sitemap[number]['changeFrequency'] = 'monthly',
): Entry {
  return {
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: freq,
    priority,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // ── Tier 1: Primary acquisition ─────────────────────────────────────────
    url('/',                          1.0, 'weekly'),
    url('/fundability',               0.9, 'weekly'),
    url('/discover',                  0.9, 'weekly'),
    url('/application-intelligence',  0.9, 'monthly'),

    // ── Tier 2: Conversion & pricing ────────────────────────────────────────
    url('/upgrade',                   0.8, 'monthly'),
    url('/sign-up',                   0.8, 'monthly'),
    url('/sign-up/startup',           0.8, 'monthly'),

    // ── Tier 3: Core feature pages ──────────────────────────────────────────
    url('/evidence',                  0.7, 'monthly'),
    url('/dataroom',                  0.7, 'monthly'),
    url('/pipeline',                  0.7, 'monthly'),
    url('/intelligence',              0.7, 'monthly'),
    url('/offers',                    0.6, 'monthly'),

    // ── Tier 4: Startup profile sub-sections ─────────────────────────────────
    url('/startup',                   0.7, 'monthly'),
    url('/startup/profile',           0.6, 'monthly'),
    url('/startup/founders',          0.6, 'monthly'),
    url('/startup/product',           0.6, 'monthly'),
    url('/startup/market',            0.6, 'monthly'),
    url('/startup/traction',          0.6, 'monthly'),
    url('/startup/business-model',    0.6, 'monthly'),
    url('/startup/financials',        0.6, 'monthly'),
    url('/startup/fundraising',       0.6, 'monthly'),

    // ── Tier 5: Legal & Public Policy ────────────────────────────────────────
    url('/terms',                     0.6, 'monthly'),
    url('/privacy',                   0.6, 'monthly'),
    url('/contact',                   0.6, 'monthly'),

    // ── Tier 6: Auth & account ───────────────────────────────────────────────
    url('/sign-in',                   0.5, 'yearly'),
    url('/settings',                  0.5, 'yearly'),
    url('/messages',                  0.5, 'monthly'),
    url('/notifications',             0.5, 'monthly'),
  ];
}
