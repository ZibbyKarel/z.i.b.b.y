import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const REMOTE_ATTR = /\b(src|href)="(https?:\/\/[^"]+)"/g;

export function collectRemoteUrls(html) {
  return [...html.matchAll(REMOTE_ATTR)].map((m) => m[2]);
}

export function rewriteToCache(html, manifest) {
  return html.replace(REMOTE_ATTR, (whole, attr, url) =>
    manifest[url] ? `${attr}="${manifest[url]}"` : whole,
  );
}

const cacheName = (url) =>
  `${createHash("sha1").update(url).digest("hex").slice(0, 12)}${path.extname(new URL(url).pathname) || ".txt"}`;

/**
 * Downloads to a sibling temp file and only `rename`s it onto the real cache
 * path once the write has fully landed. `rename` on the same filesystem is
 * atomic, so `file` can only ever exist in two states: absent, or complete. A
 * crash mid-download leaves an orphaned `.tmp-*` file, not a truncated cache
 * entry that a later run would mistake for a valid hit and serve forever.
 */
async function downloadTo(url, file) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `design-match: nelze stáhnout ${url} (HTTP ${response.status}). Bez cache se mockup nevykreslí.`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const tmpFile = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpFile, buffer);
  await fs.rename(tmpFile, file);
}

/**
 * Mockups pull React, Babel and three.js from CDNs. Without network they render
 * nothing — and an empty screenshot looks like valid input, which is the worst
 * possible failure mode. Cache once, rewrite, then never touch the network again.
 */
export async function ensureCdnCache(htmlPath, cacheDir) {
  const html = await fs.readFile(htmlPath, "utf8");
  const urls = [...new Set(collectRemoteUrls(html))];
  await fs.mkdir(cacheDir, { recursive: true });

  const manifest = {};
  const downloaded = [];
  for (const url of urls) {
    const file = path.join(cacheDir, cacheName(url));
    try {
      await fs.access(file);
    } catch {
      await downloadTo(url, file);
      downloaded.push(url);
    }
    manifest[url] = path.relative(path.dirname(htmlPath), file);
  }

  const localHtmlPath = path.join(
    path.dirname(htmlPath),
    `.design-match-cached-${path.basename(htmlPath)}`,
  );
  await fs.writeFile(localHtmlPath, rewriteToCache(html, manifest), "utf8");
  return { localHtmlPath, downloaded };
}
