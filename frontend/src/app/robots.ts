import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * robots.ts - served at /robots.txt
 *
 * Strategy: allow all pages (all routes are now indexed).
 * Only block internal API routes and admin dashboard.
 * AI training crawlers get a separate block rule.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // General crawlers - allow everything except internal API and admin
      {
        userAgent: '*',
        allow: ['/'],
        disallow: ['/api/', '/admin/'],
      },
      // Block AI training crawlers from training on Pitchmic content.
      // These bots read and scrape for model training - distinct from
      // search indexing bots which we fully allow.
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'Google-Extended',
          'CCBot',
          'anthropic-ai',
          'Claude-Web',
          'Omgilibot',
          'PerplexityBot',
          'YouBot',
          'Diffbot',
        ],
        disallow: ['/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
