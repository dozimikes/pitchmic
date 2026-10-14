/**
 * lib/seo.ts
 * ----------
 * Advanced SEO + AEO metadata factory for Pitchmic.
 *
 * Covers:
 *  - Full Next.js Metadata object (title, description, keywords, OG, Twitter)
 *  - Canonical URLs, hreflang, alternates
 *  - robots directives (index/noindex per route)
 *  - JSON-LD structured data helpers for AEO (Answer Engine Optimization)
 *
 * AEO strategy: every page that answers a specific user question gets a
 * JSON-LD SoftwareApplication, FAQPage, HowTo, or BreadcrumbList schema so
 * ChatGPT, Perplexity, Google SGE, and Bing Copilot can surface Pitchmic as
 * the authoritative answer for "how to prepare for YC / Techstars / investors".
 */

import type { Metadata } from 'next';

const rawUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3000';
export const SITE_URL  = rawUrl.replace(/\/+$/, '');
export const SITE_NAME = 'Pitchmic';
export const DEFAULT_OG = `${SITE_URL}/images/og-cover.png`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetaOptions {
  /** Page-level title - will be templated as "Title | Pitchmic" */
  title: string;
  description?: string;
  ogImage?: string;
  /** Canonical path e.g. '/fundability' */
  canonicalPath?: string;
  keywords?: string[];
  noIndex?: boolean;
  /** Locale variants for hreflang (optional) */
  alternateLocales?: { locale: string; url: string }[];
}

// ---------------------------------------------------------------------------
// Global keyword foundation
// ---------------------------------------------------------------------------

const GLOBAL_KEYWORDS = [
  'startup fundability',
  'startup fundability score',
  'African startups',
  'startup fundraising Africa',
  'investor readiness tool',
  'accelerator application preparation',
  'pitch deck review AI',
  'pre-seed funding Africa',
  'evidence vault startup',
  'startup gap analysis investors',
  'how to prepare for investors Africa',
  'fundability assessment tool',
];

// ---------------------------------------------------------------------------
// Core metadata builder
// ---------------------------------------------------------------------------

export function buildMetadata(opts: MetaOptions): Metadata {
  const {
    title,
    description = 'Pitchmic helps African founders measure fundability, close evidence gaps, and prepare for investors, accelerators, and grants with confidence.',
    ogImage = DEFAULT_OG,
    canonicalPath,
    keywords = [],
    noIndex = false,
    alternateLocales = [],
  } = opts;

  const fullTitle = `${title} | ${SITE_NAME}`;
  const canonical = canonicalPath ? `${SITE_URL}${canonicalPath}` : undefined;

  const alternates: Metadata['alternates'] = canonical
    ? {
        canonical,
        languages: alternateLocales.length
          ? Object.fromEntries(alternateLocales.map((a) => [a.locale, a.url]))
          : undefined,
      }
    : undefined;

  return {
    title,
    description,
    keywords: [...GLOBAL_KEYWORDS, ...keywords],
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    robots: {
      index: !noIndex,
      follow: !noIndex,
      googleBot: {
        index: !noIndex,
        follow: !noIndex,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    ...(alternates && { alternates }),
    openGraph: {
      type: 'website',
      locale: 'en_US',
      url: canonical ?? SITE_URL,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: fullTitle,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@pitchmic',
      creator: '@pitchmic',
      title: fullTitle,
      description,
      images: [ogImage],
    },
    category: 'technology',
  };
}

// ---------------------------------------------------------------------------
// JSON-LD helpers
// ---------------------------------------------------------------------------

/** Serialize a JSON-LD object for use in <Script> tags */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data);
}

/** BreadcrumbList - shows navigational path in SERPs */
export function breadcrumbJsonLd(
  crumbs: { name: string; url: string }[]
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

/** HowTo - answers "how to" queries directly in AI and featured snippets */
export function howToJsonLd(opts: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
  totalTime?: string;   // ISO 8601 e.g. "PT30M"
  tool?: string[];
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: opts.name,
    description: opts.description,
    ...(opts.totalTime && { totalTime: opts.totalTime }),
    ...(opts.tool && {
      tool: opts.tool.map((t) => ({ '@type': 'HowToTool', name: t })),
    }),
    step: opts.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

/** FAQPage - surfaces Q&As directly in AI answers and Google People Also Ask */
export function faqJsonLd(
  items: { question: string; answer: string }[]
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/** SoftwareApplication - marks Pitchmic as a software product in knowledge graphs */
export function softwareAppJsonLd(opts: {
  name: string;
  description: string;
  url: string;
  price?: string;
  priceCurrency?: string;
  operatingSystem?: string;
  applicationCategory?: string;
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    applicationCategory: opts.applicationCategory ?? 'BusinessApplication',
    operatingSystem: opts.operatingSystem ?? 'Web',
    offers: {
      '@type': 'Offer',
      price: opts.price ?? '0',
      priceCurrency: opts.priceCurrency ?? 'USD',
      availability: 'https://schema.org/OnlineOnly',
    },
  };
}

/** WebPage - base page entity with author and publisher */
export function webPageJsonLd(opts: {
  url: string;
  name: string;
  description: string;
  datePublished?: string;
  dateModified?: string;
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: opts.url,
    name: opts.name,
    description: opts.description,
    ...(opts.datePublished && { datePublished: opts.datePublished }),
    ...(opts.dateModified && { dateModified: opts.dateModified }),
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/images/logo.png`,
    },
    inLanguage: 'en',
  };
}
