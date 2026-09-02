#!/usr/bin/env node
/**
 * openapi-sync.mjs
 * ================
 * Pulls the DRF Spectacular OpenAPI schema from the Django backend and
 * regenerates src/lib/schema.generated.ts via openapi-typescript.
 *
 * Prerequisites:
 *   - Django dev server running at $NEXT_PUBLIC_API_BASE_URL (default http://localhost:8000)
 *   - openapi-typescript installed (npx fallback used below)
 *
 * Usage:
 *   npm run openapi:sync
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const SCHEMA_URL = `${API_BASE}/api/schema/`;
const OUTPUT = resolve(PROJECT_ROOT, 'src/lib/schema.generated.ts');

console.log(`\n📡 Fetching OpenAPI schema from ${SCHEMA_URL} …`);

try {
  const response = await fetch(SCHEMA_URL, {
    headers: { Accept: 'application/vnd.oai.openapi+json;version=3.1, application/json' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ensure Django is running and accessible at ${API_BASE}`);
  }
  const schema = await response.json();

  const outDir = dirname(OUTPUT);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Write raw schema for posterity
  const rawPath = resolve(PROJECT_ROOT, 'src/lib/schema.openapi.json');
  writeFileSync(rawPath, JSON.stringify(schema, null, 2));
  console.log(`✅ Raw schema saved  → ${rawPath}`);

  // Invoke openapi-typescript via npx (no need to add it to package.json deps)
  console.log(`\n🧬 Generating TypeScript types → ${OUTPUT}`);
  try {
    execSync(
      `npx --yes openapi-typescript@latest "${rawPath}" -o "${OUTPUT}" --alphabetize --export-type`,
      { stdio: 'inherit', cwd: PROJECT_ROOT, env: { ...process.env } }
    );
  } catch (err) {
    console.warn('⚠️  openapi-typescript failed via npx — falling back to minimal header stub.');
    writeFileSync(
      OUTPUT,
      `// Auto-generated fallback — run \`npm run openapi:gen\` with Django running for full types.\nexport interface components {}\nexport interface paths {}\nexport interface operations {}\nexport interface external {}\n`
    );
  }

  console.log('\n🎉 OpenAPI sync complete.');
} catch (err) {
  console.error(`\n❌ OpenAPI sync failed: ${(err as Error).message}`);
  process.exit(1);
}
