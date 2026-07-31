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
import { DesignMatchError } from "./errors.mjs";
import path from "node:path";

/**
 * The url path the cdn cache is mounted at by the static server (`shoot.mjs`),
 * and therefore the prefix `rewriteToCache` writes into the html.
 *
 * It is deliberately ROOT-ABSOLUTE rather than relative to the mockup. A
 * relative path (`../../.design-match/.cdn-cache/…`) climbs out of the mockup's
 * own directory, which forced the server to be rooted at an ancestor of both —
 * in practice the repository root, and in a cross-tree invocation the operator's
 * home directory, all of it same-origin to the mockup's own JavaScript. Naming
 * the cache with a mount prefix instead lets the server expose exactly two
 * directories and nothing above either of them.
 *
 * Cost, stated plainly: the rewritten `.design-match-cached-*.html` can no
 * longer be opened directly off disk in a browser — it only resolves when
 * served by this tool. It was never an operator-facing artifact.
 */
export const CDN_CACHE_URL_PREFIX = "/__design-match-cdn";

/**
 * The `<link rel>` values that name a resource the browser downloads. This is
 * a positive ALLOW-list, not an ignore-list of `preconnect`/`dns-prefetch`,
 * and the asymmetry of the two failure modes is why:
 *
 * - a relation wrongly on this list is fetched, and a bare origin 404s, which
 *   aborts the entire run at exit 3 before the browser even launches;
 * - a relation wrongly *off* it is simply not cached, so the page fetches it
 *   live — and if that fetch fails offline, the page renders short and the
 *   emptiness guard in `cli.mjs` refuses to write a spec for it.
 *
 * The set of relations that name a resource is small and closed; the set that
 * does not (`preconnect`, `dns-prefetch`, `canonical`, `alternate`, `author`,
 * `license`, `me`, `next`, `prev`, …) is open-ended and still growing. An
 * ignore-list would therefore have to be updated every time the HTML spec
 * gains a hint, and would fail towards the blocking mode until it was.
 */
const RESOURCE_LINK_RELS = new Set([
  "stylesheet",
  "preload",
  "modulepreload",
  "prefetch",
  "icon",
  "apple-touch-icon",
  "apple-touch-startup-image",
  "mask-icon",
  "manifest",
]);

/**
 * `href` on these tags never names a subresource: it is a navigation target
 * (`a`, `area`), a document-relative base (`base`), or — on `link` — only a
 * resource for the relations named above, which is handled separately.
 */
const NAVIGATION_TAGS = new Set(["a", "area", "base"]);

const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function attributesOf(rawAttrs) {
  const attrs = {};
  for (const [, name, doubleQuoted, singleQuoted, bare] of rawAttrs.matchAll(ATTR_RE)) {
    attrs[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? bare ?? "";
  }
  return attrs;
}

const isRemote = (value) => typeof value === "string" && /^https?:\/\//.test(value);

/** The remote urls one already-parsed tag actually asks the browser to fetch. */
function resourceUrlsInTag(tag, attrs) {
  if (tag === "link") {
    const rels = (attrs.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const names = rels.some((rel) => RESOURCE_LINK_RELS.has(rel));
    return names && isRemote(attrs.href) ? [attrs.href] : [];
  }
  const urls = [];
  if (isRemote(attrs.src)) urls.push(attrs.src);
  if (!NAVIGATION_TAGS.has(tag) && isRemote(attrs.href)) urls.push(attrs.href);
  return urls;
}

/**
 * Tag-aware on purpose. The old attribute-only scan matched any
 * `src="http…"`/`href="http…"` anywhere in the file, including inside an
 * inline `<script>`'s own string literals and inside `<a>` tags — neither of
 * which the browser ever fetches as a subresource.
 */
export function collectRemoteUrls(html) {
  const urls = [];
  for (const [, tagName, rawAttrs] of html.matchAll(TAG_RE)) {
    urls.push(...resourceUrlsInTag(tagName.toLowerCase(), attributesOf(rawAttrs)));
  }
  return urls;
}

/**
 * Driven by the same tag walk as `collectRemoteUrls`, and that symmetry is
 * load-bearing. While collection was tag-aware and rewriting was a blunt
 * `src|href="http…"` regex, the two disagreed in both directions: a url written
 * with an unquoted attribute value was cached but never rewritten (so the run
 * silently still needed the network), and a url appearing on both a
 * `<script src>` and an `<a href>` was rewritten inside the anchor — the exact
 * thing the tag-aware collector exists to avoid. One walk, one answer.
 */
export function rewriteToCache(html, manifest) {
  return html.replace(TAG_RE, (whole, tagName, rawAttrs) => {
    let rewritten = whole;
    for (const url of resourceUrlsInTag(tagName.toLowerCase(), attributesOf(rawAttrs))) {
      const local = manifest[url];
      // Substituted only within this tag's own text, and only for a url this
      // tag genuinely fetches — so quoting style is irrelevant and no other
      // occurrence in the document can be caught by accident.
      if (local) rewritten = rewritten.split(url).join(local);
    }
    return rewritten;
  });
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
    throw new DesignMatchError(
      `design-match: nelze stáhnout ${url} (HTTP ${response.status}). Bez cache se mockup nevykreslí.`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new DesignMatchError(
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
    // Root-absolute against the cache's mount, not relative to the mockup —
    // see CDN_CACHE_URL_PREFIX for why the server can then serve two narrow
    // directories instead of their common ancestor.
    manifest[url] = `${CDN_CACHE_URL_PREFIX}/${path.basename(file)}`;
  }

  const localHtmlPath = path.join(
    path.dirname(htmlPath),
    `.design-match-cached-${path.basename(htmlPath)}`,
  );
  await fs.writeFile(localHtmlPath, rewriteToCache(html, manifest), "utf8");
  return { localHtmlPath, downloaded };
}
