#!/usr/bin/env node
/**
 * Opens every indexed page of a build the way a first-time visitor (or a
 * search engine) does, and fails unless the app shows what the page's static
 * HTML promises: the same title and heading, in the URL's language, at the
 * URL that was asked for. Run after `npm run build`:
 *
 *   node scripts/seo-check.mjs
 *
 * dist is served as GitHub Pages serves it: real files and folders only, a
 * folder without its slash redirected, anything else 404.html with a 404. Port
 * 5173 because the data buckets allow that origin.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const PORT = 5173;
const ORIGIN = `http://localhost:${PORT}`;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
  let file = path.join(DIST, pathname);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${pathname}/` });
      return res.end();
    }
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(fs.readFileSync(path.join(DIST, '404.html')));
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
  });
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(PORT, resolve));

// The indexed pages are the sitemap entries with language versions.
const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const paths = [
  ...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<xhtml:link/g),
].map(m => new URL(m[1]).pathname);

const decode = text =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const staticOf = pathname => {
  const html = fs.readFileSync(path.join(DIST, pathname, 'index.html'), 'utf8');
  return {
    title: decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''),
    h1: decode(html.match(/<h1>([^<]*)<\/h1>/)?.[1] ?? ''),
  };
};

const browser = await chromium.launch();
const failures = [];
async function check(pathname) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    const expected = staticOf(pathname);
    const response = await page.goto(ORIGIN + pathname, {
      waitUntil: 'domcontentloaded',
    });
    if (response?.status() !== 200)
      throw new Error(`status ${response?.status()}`);
    // The static text is the page until the app replaces it: wait for that.
    await page
      .waitForFunction(
        t =>
          !document.querySelector('#root > main[data-static]') &&
          document.querySelector('#root h1') &&
          document.title === t,
        expected.title,
        { timeout: 20000 }
      )
      .catch(() => {});
    const seen = await page.evaluate(() => ({
      title: document.title,
      lang: document.documentElement.lang,
      path: location.pathname,
      h1: document.querySelector('#root h1')?.textContent?.trim() ?? '',
    }));
    const lang = pathname.startsWith('/de/') ? 'de' : 'en';
    const problems = [];
    if (seen.title !== expected.title)
      problems.push(`title "${seen.title}" != "${expected.title}"`);
    if (!seen.lang.startsWith(lang)) problems.push(`lang ${seen.lang}`);
    if (seen.path !== pathname) problems.push(`moved to ${seen.path}`);
    if (expected.h1 && seen.h1 !== expected.h1)
      problems.push(`h1 "${seen.h1}" != "${expected.h1}"`);
    if (problems.length) throw new Error(problems.join('; '));
  } catch (error) {
    failures.push(`${pathname}: ${error.message}`);
  } finally {
    await context.close();
  }
}

const queue = [...paths];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) await check(queue.shift());
  })
);
await browser.close();
server.close();

console.log(`${paths.length - failures.length} of ${paths.length} pages ok`);
for (const failure of failures) console.log(`  ${failure}`);
process.exit(failures.length ? 1 : 0);
