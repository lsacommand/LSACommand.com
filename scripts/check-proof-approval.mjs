#!/usr/bin/env node
// Guard for the proof / case-study layer. Run before merging: `node scripts/check-proof-approval.mjs`
//
// Fails (exit 1) if:
//   1. any page listed in sitemap.xml contains a "PENDING CLIENT APPROVAL" placeholder;
//   2. any page with a placeholder is missing <meta name="robots" content="noindex...">;
//   3. any indexable page links to a page that still has placeholders;
//   4. any internal link on a /case-studies/ page points to a file that does not exist.
// Client results are published only after the client (and its agency) approve them.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const MARKER = 'PENDING CLIENT APPROVAL';
const SKIP = new Set(['.git', 'node_modules', 'scripts']);
const errors = [];

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return name.endsWith('.html') ? [p] : [];
  });
}

function fileForPath(urlPath) {
  const clean = urlPath.split(/[?#]/)[0];
  if (clean.endsWith('/')) return join(root, clean, 'index.html');
  if (clean.endsWith('.html')) return join(root, clean);
  const asDir = join(root, clean, 'index.html');
  return existsSync(asDir) ? asDir : join(root, clean);
}

const pages = htmlFiles(root);
const pending = new Set(pages.filter((f) => readFileSync(f, 'utf8').includes(MARKER)));

for (const f of pending) {
  const html = readFileSync(f, 'utf8');
  if (!/<meta\s+name="robots"\s+content="noindex/i.test(html)) {
    errors.push(`${relative(root, f)} has pending placeholders but is not noindex`);
  }
}

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
for (const [, loc] of sitemap.matchAll(/<loc>https:\/\/lsacommand\.com(\/[^<]*)<\/loc>/g)) {
  const f = fileForPath(loc);
  if (!existsSync(f)) errors.push(`sitemap lists ${loc} but ${relative(root, f)} does not exist`);
  else if (pending.has(f)) errors.push(`sitemap lists ${loc}, which still has ${MARKER} placeholders`);
}

for (const f of pages) {
  if (pending.has(f)) continue;
  const html = readFileSync(f, 'utf8');
  const isCaseStudy = relative(root, f).startsWith('case-studies');
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
    const target = fileForPath(href);
    if (pending.has(target)) errors.push(`${relative(root, f)} links to pending page ${href}`);
    if (isCaseStudy && !existsSync(target)) errors.push(`${relative(root, f)} has broken internal link ${href}`);
  }
  for (const [, src] of html.matchAll(/src="(\/[^"]+)"/g)) {
    if (isCaseStudy && !existsSync(join(root, src))) errors.push(`${relative(root, f)} references missing asset ${src}`);
  }
}

if (errors.length) {
  console.error(`Proof approval check FAILED (${errors.length}):\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`Proof approval check passed: ${pages.length} pages scanned, ${pending.size} pending-approval page(s), all noindex, unlisted and unlinked.`);
