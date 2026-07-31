import http from "node:http";
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
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
 * "`candidate` is `dir` or lives under it", written once because both the
 * server's containment check and the servable-root floor need it and because
 * the filesystem root is the case a naive `${dir}${sep}` prefix gets wrong
 * (`"/" + "/"` is `"//"`, which nothing starts with).
 */
const contains = (dir, candidate) =>
  candidate === dir || candidate.startsWith(dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`);

/**
 * A mockup measured from `file://` is a different document from the one the
 * designer sees. Chromium blocks XHR on `file://`, so `<script type="text/babel"
 * src="…jsx">` never loads its source; `crossorigin` fetches cannot be
 * satisfied either. The page renders nothing, and "nothing" measures as a
 * confident one-node spec. Serving the same bytes over `http://127.0.0.1`
 * removes both causes at once, because they were never about the bytes.
 *
 * But `file://` was also an isolation boundary, and dropping it drops that too:
 * the page is same-origin with everything the server exposes, and a mockup is
 * inbound content with unrestricted outbound network. So the server exposes
 * exactly the directories a run needs — the mockup's own directory and the cdn
 * cache, mounted separately — and this function is the floor under that:
 * whatever root is computed must sit inside the current working directory, and
 * must never be the operator's home directory or an ancestor of it.
 *
 * The second test is not implied by the first. A run whose cwd is `$HOME` (or
 * `/`) would satisfy containment while serving everything the operator owns.
 *
 * Every comparison happens on realpaths, because `withStaticServer` mounts the
 * realpath — deciding on the lexical path would be checking a different
 * directory than the one served. A symlink inside cwd pointing at `$HOME`
 * passes a lexical "inside cwd" and then serves `~/.ssh`. That is not a
 * hypothetical: `ln -s ~/Downloads/mockups design/incoming` is the natural
 * response to the very rule this function imposes, so the floor is likeliest to
 * be bypassed by someone following its own advice.
 *
 * Both sides get resolved, not just the root — comparing a resolved path
 * against an unresolved one is its own false-refusal bug, and `/tmp` really is
 * a symlink to `/private/tmp` on macOS. A path that cannot be resolved keeps
 * its lexical form: a directory that does not exist cannot be a symlink to
 * anywhere, and `withStaticServer` already turns that into a clear message.
 */
const realpathOr = (candidate) => {
  try {
    return realpathSync(candidate);
  } catch {
    return candidate;
  }
};

export function assertServableRoot(root, label, cwd = process.cwd()) {
  const resolved = realpathOr(path.resolve(root));
  const workingDir = realpathOr(path.resolve(cwd));
  if (!contains(workingDir, resolved)) {
    throw new Error(
      `design-match: ${label} (${resolved}) leží mimo aktuální pracovní adresář (${workingDir}) — design-match servíruje jen adresáře uvnitř něj. Spusť measure z adresáře, který mockup obsahuje, nebo mockup do něj zkopíruj.`,
    );
  }
  const home = realpathOr(path.resolve(os.homedir()));
  if (contains(resolved, home)) {
    throw new Error(
      `design-match: ${label} (${resolved}) by zpřístupnil celý domovský adresář (${home}) — to design-match nikdy neudělá. Spusť measure z konkrétního projektu, ne z ${home} ani z kořene disku.`,
    );
  }
  return resolved;
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

/**
 * Normalised, longest-prefix-first, so `/__design-match-cdn/x.css` cannot be
 * swallowed by the `/` mount. The `/` mount becomes the empty prefix, which
 * sorts last and therefore only matches once every named mount has missed.
 */
export function normalizeMounts(mounts) {
  return Object.entries(mounts)
    .map(([prefix, root]) => ({
      prefix: `/${prefix}`.replace(/\/+/g, "/").replace(/\/$/, ""),
      root,
    }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

/** Which mount serves `pathname`, and the path within it. */
export function matchMount(mountList, pathname) {
  for (const { prefix, root } of mountList) {
    if (prefix === "") return { root, relative: pathname.replace(/^\/+/, "") };
    if (pathname === prefix) return { root, relative: "" };
    if (pathname.startsWith(`${prefix}/`)) {
      return { root, relative: pathname.slice(prefix.length + 1) };
    }
  }
  return undefined;
}

/**
 * A `Host` this server did not advertise means the request did not come from
 * the url we handed the browser — the shape a DNS-rebinding page takes, where
 * a document on some other origin resolves its own hostname to 127.0.0.1 and
 * guesses the port. The window is seconds and the port space is wide, but the
 * check is one comparison and the thing behind it is the operator's project.
 */
function hostAllowed(req, port) {
  const host = req.headers.host;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

async function serveMounted(mountList, port, req, res) {
  if (!hostAllowed(req, port)) return respondText(res, 403, "forbidden");
  if (req.method !== "GET" && req.method !== "HEAD") {
    return respondText(res, 405, "method not allowed");
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  } catch {
    return respondText(res, 400, "bad request");
  }
  const mount = matchMount(mountList, pathname);
  if (!mount) return respondText(res, 404, "not found");
  // `path.resolve` normalises any `..` the request smuggled in percent-encoded
  // (a literal `..` never survives `new URL`), and the containment check below
  // is what actually decides — it runs before anything touches the filesystem.
  const target = path.resolve(mount.root, mount.relative);
  if (!contains(mount.root, target)) return respondText(res, 403, "forbidden");
  let real;
  let stats;
  try {
    // Re-checked after resolving symlinks: a symlink inside the root pointing
    // out of it would otherwise be a hole in the check above. `stat` shares the
    // try so a file unlinked between the two calls is a 404, not a 500.
    real = await fs.realpath(target);
    if (!contains(mount.root, real)) return respondText(res, 403, "forbidden");
    stats = await fs.stat(real);
  } catch {
    return respondText(res, 404, "not found");
  }
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
 * serving `mounts` — a `{ urlPrefix: directory }` map — and nothing else. It
 * shuts down in a `finally` so neither a thrown error nor a crashed run can
 * leave a listening socket behind. `closeAllConnections` first, because
 * Chromium holds keep-alive sockets open and `close` alone would wait for them
 * forever.
 *
 * Mounts rather than one root is the whole point: the two directories a run
 * needs are in different parts of the tree, and serving their common ancestor
 * to satisfy that reached the repository root — the operator's home directory
 * on a cross-tree invocation — all of it same-origin to the mockup's own
 * JavaScript. Callers are still expected to have run each directory through
 * `assertServableRoot`.
 */
export async function withStaticServer(mounts, fn) {
  const mountList = [];
  for (const { prefix, root } of normalizeMounts(mounts)) {
    let resolved;
    try {
      resolved = await fs.realpath(path.resolve(root));
    } catch (error) {
      throw new Error(
        `design-match: adresář k servírování "${root}" nelze otevřít (${error.code ?? error.message})`,
      );
    }
    mountList.push({ prefix, root: resolved });
  }
  let port;
  const server = http.createServer((req, res) => {
    serveMounted(mountList, port, req, res).catch(() => {
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
    port = typeof address === "object" && address !== null ? address.port : undefined;
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
