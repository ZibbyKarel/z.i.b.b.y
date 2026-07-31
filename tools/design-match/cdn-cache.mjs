/**
 * Známá omezení (deliberately out of scope for this file):
 *
 * 1. Nested resources inside a cached stylesheet are not discovered. A cached
 *    Google Fonts CSS file still references fonts.gstatic.com for the actual
 *    font binaries — those are never fetched or cached, so an "offline" run
 *    still reaches the network for them. Recursive caching and CSS-content
 *    rewriting are a much larger change than this cache.
 * 2. No staleness or invalidation. The cache key is the url alone — no TTL,
 *    ETag, or content hash — so a changed remote resource is served stale
 *    forever once cached.
 * 3. No protection against concurrent runs racing the same cache path.
 */

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

const cacheHash = (url) => createHash("sha1").update(url).digest("hex").slice(0, 12);

/**
 * Chromium types a `file://` resource by extension, not by any header (there
 * is none once it's on disk) — so the cached filename's extension decides
 * whether the browser will actually apply it. A stylesheet cached under
 * `.txt` (the old url-path-derived fallback for an extension-less url like
 * Google Fonts' `css2?family=...`) is silently refused by strict MIME
 * checking on `<link rel="stylesheet">`. Deriving the extension from the
 * response's real content-type instead means the cached file is typed the
 * way the resource actually is.
 */
const MIME_EXTENSIONS = {
  "text/css": ".css",
  "font/woff2": ".woff2",
  "font/woff": ".woff",
  "font/ttf": ".ttf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

function extensionFor(url, contentType) {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime && MIME_EXTENSIONS[mime]) {
    return MIME_EXTENSIONS[mime];
  }
  return path.extname(new URL(url).pathname) || ".txt";
}

/**
 * A cache entry's actual extension is only known once the response's
 * content-type has been read, so the cache-hit check can't rely on a
 * precomputed filename — it looks for any file named `<hash>.<ext>` already
 * sitting in `cacheDir`. A missing `cacheDir` (nothing cached yet) takes the
 * download path; any other error (a permission problem, for instance) is a
 * real failure and must surface rather than being treated as a cache miss.
 */
async function findCachedFile(cacheDir, hash) {
  let entries;
  try {
    entries = await fs.readdir(cacheDir);
  } catch (err) {
    if (err.code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
  const pattern = new RegExp(`^${hash}\\.[^.]+$`);
  return entries.find((name) => pattern.test(name));
}

/**
 * Downloads to a sibling temp file and only `rename`s it onto the real cache
 * path once the write has fully landed. `rename` on the same filesystem is
 * atomic, so the final path can only ever exist in two states: absent, or
 * complete. If the write or rename itself throws, the temp file is removed
 * on the way out — cleanup failures are swallowed so they never hide the
 * original error — rather than leaving `.tmp-*` debris in the cache dir.
 */
async function writeAtomic(file, buffer) {
  const tmpFile = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tmpFile, buffer);
    await fs.rename(tmpFile, file);
  } catch (err) {
    try {
      await fs.rm(tmpFile, { force: true });
    } catch {
      // Best-effort cleanup; the original error is what matters.
    }
    throw err;
  }
}

/**
 * A zero-length body is a failed download, not content: writing it into the
 * cache would make every later run treat "we got nothing" as a permanent hit.
 */
async function downloadContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `design-match: nelze stáhnout ${url} (HTTP ${response.status}). Bez cache se mockup nevykreslí.`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(
      `design-match: stažení ${url} vrátilo prázdný obsah (0 bajtů). Bez obsahu se mockup nevykreslí.`,
    );
  }
  return { buffer, contentType: response.headers?.get?.("content-type") };
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
    const hash = cacheHash(url);
    const cachedName = await findCachedFile(cacheDir, hash);
    let file;
    if (cachedName) {
      file = path.join(cacheDir, cachedName);
    } else {
      const { buffer, contentType } = await downloadContent(url);
      file = path.join(cacheDir, `${hash}${extensionFor(url, contentType)}`);
      await writeAtomic(file, buffer);
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
