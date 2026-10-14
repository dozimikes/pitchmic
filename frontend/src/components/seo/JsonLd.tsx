'use client';

/**
 * JsonLd.tsx
 * ----------
 * Injects a JSON-LD <script> block into the document head.
 *
 * Usage:
 *   import { JsonLd } from '@/components/seo/JsonLd';
 *   <JsonLd id="page-schema" data={mySchemaObject} />
 *
 * The `id` prop deduplicates the tag so Fast Refresh doesn't stack duplicates.
 * Google, Bing, and AI crawlers (Perplexity, Bing Copilot) all execute JS and
 * read dynamically injected JSON-LD.
 */

import * as React from 'react';

interface JsonLdProps {
  /** Unique id for the script tag - prevents duplicates on client nav */
  id: string;
  /** A JSON-LD object or @graph array */
  data: object;
}

export function JsonLd({ id, data }: JsonLdProps) {
  return (
    <script
      id={id}
      type="application/ld+json"
      // biome-ignore lint - dangerouslySetInnerHTML is the correct approach for JSON-LD
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
