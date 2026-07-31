import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

export const STORYBOOK_BASE = "http://localhost:6006";
export const APP_BASE = "http://localhost:3000";

export function storybookUrl(storyId, base = STORYBOOK_BASE) {
  return `${base}/iframe.html?id=${storyId}&viewMode=story`;
}

/**
 * Scene selection follows the spec's C → A → B preference: an isolated story
 * where the unit can stand alone, a seeded route where page composition is the
 * thing under test, masking only where state cannot be made deterministic.
 */
export function resolveScene(options) {
  const masks = options.masks ?? [];
  if (options.story) {
    return { mode: "story", url: storybookUrl(options.story), selector: options.selector, masks };
  }
  if (options.route) {
    // A route typed without a leading slash (`--route roadmap`) must not fuse
    // straight onto appBase into a malformed, silently-never-resolving URL
    // (`http://localhost:3000roadmap`) — normalise to exactly one separator.
    const route = options.route.startsWith("/") ? options.route : `/${options.route}`;
    const url = `${options.appBase ?? APP_BASE}${route}`;
    return { mode: masks.length > 0 ? "mask" : "route", url, selector: options.selector, masks };
  }
  throw new Error("design-match: chybí scéna — zadej --story <id> nebo --route <cesta>");
}

/**
 * A mockup measured from `file://` is a different document from the one the
 * designer sees. Chromium blocks XHR on `file://`, so `<script type="text/babel"
 * src="…jsx">` never loads its source; `crossorigin` fetches cannot be
 * satisfied either. The page renders nothing, and "nothing" measures as a
 * confident one-node spec. Serving the same bytes over `http://127.0.0.1`
 * removes both causes at once, because they were never about the bytes.
 *
 * The root is a real directory tree, not a virtual mount, so every relative
 * reference in the rewritten html — a sibling `zibby/*.jsx`, the cdn cache
 * several levels up — resolves at exactly the position it occupies on disk.
 * That is why `runMeasure` roots the server at the common ancestor of the
 * mockup and the cache rather than at the mockup's own directory: anything
 * shallower would leave the cached React/Babel unreachable.
 */
export function commonAncestorDir(paths) {
  const parts = paths.map((candidate) => path.resolve(candidate).split(path.sep));
  const shared = [];
  for (let index = 0; index < parts[0].length; index += 1) {
    const segment = parts[0][index];
    if (!parts.every((each) => each[index] === segment)) break;
    shared.push(segment);
  }
  const ancestor = shared.join(path.sep) || path.sep;
  if (ancestor === path.parse(path.resolve(paths[0])).root) {
    throw new Error(
      `design-match: design soubor a cache nemají společný nadřazený adresář kromě kořene disku — spusť measure z adresáře, který obsahuje obojí (${paths.join(", ")})`,
    );
  }
  return ancestor;
}

/** The http url a file under `root` is served at — every segment percent-encoded, because mockup names carry spaces and diacritics. */
export function staticUrl(origin, root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return `${origin}/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
}

/**
 * Chromium types a `file://` resource by extension; over http it types it by
 * this header. A `.jsx` served as `application/octet-stream` would be refused
 * by the very `<script>` tag the http switch exists to unblock.
 */
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".jsx": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

function respondText(res, status, body) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

const isInside = (root, candidate) =>
  candidate === root || candidate.startsWith(`${root}${path.sep}`);

async function serveFromRoot(root, req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return respondText(res, 405, "method not allowed");
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  } catch {
    return respondText(res, 400, "bad request");
  }
  // `path.resolve` normalises any `..` the request smuggled in percent-encoded
  // (a literal `..` never survives `new URL`), and the containment check below
  // is what actually decides — it runs before anything touches the filesystem.
  const target = path.resolve(root, pathname.replace(/^\/+/, ""));
  if (!isInside(root, target)) return respondText(res, 403, "forbidden");
  let real;
  try {
    // Re-checked after resolving symlinks: a symlink inside the root pointing
    // out of it would otherwise be a hole in the check above.
    real = await fs.realpath(target);
  } catch {
    return respondText(res, 404, "not found");
  }
  if (!isInside(root, real)) return respondText(res, 403, "forbidden");
  const stats = await fs.stat(real);
  if (stats.isDirectory()) return respondText(res, 404, "not found");
  const body = await fs.readFile(real);
  res.writeHead(200, {
    "content-type": CONTENT_TYPES[path.extname(real).toLowerCase()] ?? "application/octet-stream",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

/**
 * Runs `fn` with a read-only static server on an ephemeral loopback port,
 * rooted at `root`, and shuts it down in a `finally` so neither a thrown error
 * nor a crashed run can leave a listening socket behind. `closeAllConnections`
 * first, because Chromium holds keep-alive sockets open and `close` alone
 * would wait for them forever.
 */
export async function withStaticServer(root, fn) {
  const resolvedRoot = await fs.realpath(path.resolve(root));
  const server = http.createServer((req, res) => {
    serveFromRoot(resolvedRoot, req, res).catch(() => {
      if (res.headersSent) res.end();
      else respondText(res, 500, "internal error");
    });
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
  try {
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : undefined;
    if (port === undefined) {
      throw new Error("design-match: lokální server se nepodařilo navázat na port");
    }
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

function boxesIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * A mask that resolves to nothing, or resolves entirely outside the shot, is
 * indistinguishable from no mask at all in the output — Playwright neither
 * draws anything nor complains. Both are the exact failure this tool exists to
 * eliminate: a pixel comparison that fails on non-deterministic content with no
 * visible cause. Fail loudly here instead of shipping a result that looks
 * authoritative and isn't.
 */
async function resolveMaskLocators(page, masks, targetBox) {
  const locators = [];
  for (const selector of masks) {
    const matches = await page.locator(selector).all();
    if (matches.length === 0) {
      throw new Error(`design-match: maska "${selector}" neodpovídá žádnému prvku`);
    }
    const boxes = await Promise.all(matches.map((match) => match.boundingBox()));
    const intersectsTarget = boxes.some((box) => box && boxesIntersect(box, targetBox));
    if (!intersectsTarget) {
      throw new Error(`design-match: maska "${selector}" leží mimo snímaný výřez`);
    }
    locators.push(page.locator(selector));
  }
  return locators;
}

export async function shootScene(page, scene, outPath) {
  // `networkidle` is a discouraged Playwright wait strategy in general — an SPA
  // that keeps polling in the background never goes idle — but it's low risk
  // against a local Storybook or Next dev server. Worth reconsidering if the
  // CLI ever points this at a route with ongoing background polling.
  await page.goto(scene.url, { waitUntil: "networkidle" });
  // `document.fonts.ready` resolves to a FontFaceSet, which Playwright then has
  // to serialize back across the protocol boundary. A FontFaceSet isn't a plain
  // object, so evaluate doesn't throw — it silently coerces the result to `{}`,
  // discarding the value while still paying the serialization cost. Awaiting the
  // promise inside the page and returning nothing gets the actual effect (wait
  // for fonts) without the pointless round trip.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const target = page.locator(scene.selector).first();
  await target.waitFor({ state: "visible" });
  const targetBox = await target.boundingBox();
  const mask = await resolveMaskLocators(page, scene.masks, targetBox);
  return target.screenshot({
    path: outPath,
    mask,
    // Without this, any CSS transition or animation (a hover/focus state, a
    // mount fade-in, a spinner) can be caught mid-frame, and the two sides of
    // a comparison land on different frames — a pixel delta naming no real
    // cause.
    animations: "disabled",
  });
}
