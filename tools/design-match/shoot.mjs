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
 * Storybook renders every story into this node — it is builder-vite's own
 * `iframe.html` template, not a guess about the implementation's markup, which
 * is why it can be a default at all. See `resolveScene`.
 *
 * (Fix round 1, M5: this repo's index has 187 ENTRIES — 184 stories and 3 docs
 * pages. The distinction does not change the default: `storybookUrl` always
 * forces `viewMode=story`, so a docs entry renders into `#storybook-root` too,
 * verified live across all 187.)
 */
export const STORYBOOK_ROOT_SELECTOR = "#storybook-root";

/**
 * Scene selection follows the spec's C → A → B preference: an isolated story
 * where the unit can stand alone, a seeded route where page composition is the
 * thing under test, masking only where state cannot be made deterministic.
 *
 * D5 (task 15), part 1: `compare` used to fall back to the DESIGN's selector
 * (`spec.selector`) when `--selector` was omitted. That selector is whatever won
 * the design inventory — `#dock`, `#root`, `svg.circuit-svg` — and it is not
 * merely useless on the implementation side, it is dangerous: `#root` and
 * `div.row:nth-child(3)` are generic enough to match SOMETHING in a real app
 * while naming an entirely unrelated node, and a `compare` that quietly measures
 * the wrong node is worse than one that refuses. So the design's selector is
 * never inherited, and no fallback chain leads back to it.
 *
 * The two scenes are then treated differently because the evidence differs. A
 * story always mounts into `#storybook-root` — that is Storybook's own contract,
 * true of every story in this repo's 187 and not an inference about anyone's
 * markup — so it is a safe default. A route has no equivalent: Next's App Router
 * mounts straight into `<body>`, and comparing a design region against the whole
 * body is meaningless. There is nothing correct to default to, so it refuses and
 * says what to pass.
 */
export function resolveScene(options) {
  const masks = options.masks ?? [];
  if (options.story) {
    return {
      mode: "story",
      url: storybookUrl(options.story, options.storybookBase ?? STORYBOOK_BASE),
      selector: options.selector ?? STORYBOOK_ROOT_SELECTOR,
      masks,
    };
  }
  if (options.route) {
    if (!options.selector) {
      throw new Error(
        "design-match: --route vyžaduje i --selector — v implementaci neexistuje uzel, který by šlo bezpečně uhodnout, " +
          "a selector z designu (spec.json) se nedědí: buď v aplikaci není, nebo tam náhodou sedí na úplně jiný prvek. " +
          "Otevři route v prohlížeči a předej selector kořene porovnávané části.",
      );
    }
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

/**
 * How long the settle is willing to wait for the network to go quiet AFTER the
 * page has loaded. It is a bound on an optimisation, not on correctness: what
 * makes a page measurable is `load`, and idleness only buys late-arriving
 * resources. 10 s is comfortably more than a locally-served mockup or a local
 * Storybook needs, and a third of the 30 s a page that can never go idle used to
 * burn before failing outright.
 */
export const SETTLE_IDLE_TIMEOUT_MS = 10_000;

/**
 * A navigation that times out is not a crash — it is a page that never loaded,
 * and the operator needs the one-line treatment, not a Playwright stack. Only
 * the timeout is translated; any other navigation failure is a real fault and
 * keeps its stack.
 */
export function translateNavigationError(url, error) {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new Error(
      `design-match: stránku se nepodařilo načíst (událost load nenastala) — ${url}. ` +
        `Ověř, že adresa odpovídá (u --route běží dev server? u --story běží Storybook?) a že se stránka otevře v prohlížeči. ` +
        `Pozn.: na požadavek, který nikdy neskončí — fetch s nepřečtenou odpovědí (větev pro 404) nebo polling — se už nečeká fatálně.`,
    );
  }
  return error;
}

function warnUnsettled(url, idleTimeoutMs) {
  console.warn(
    `design-match: stránka se do ${idleTimeoutMs} ms neustálila (networkidle) — ${url}. ` +
      `Měří se to, co bylo v tu chvíli vykresleno. Nejčastější příčina je požadavek, který nikdy neskončí: ` +
      `fetch, jehož odpověď se nikdy nepřečte (např. větev pro 404), nebo pravidelný polling.`,
  );
}

/**
 * The ONE settle both sides of a comparison use — `measure` on the design and
 * `compare` on the implementation. That it is one function is the point: two
 * sides that settle differently produce a pixel delta whose cause is the tool,
 * not the code, and that is exactly why task 16 refused to change one side's
 * semantics on its own.
 *
 * `load` is what decides whether the page can be measured; `networkidle` is a
 * best-effort extra that gives late resources time to arrive. Waiting for idle
 * FATALLY was D7's other half: `ZIBBY Redesign Canvas.html` renders in
 * milliseconds and then never goes idle, because a `fetch` on its 404 branch
 * never reads or cancels the response body — Chromium holds that body stream
 * open forever, the request never finishes, and the page can never be idle
 * again. It was the eleventh mockup, failing at 30 s for a reason that had
 * nothing to do with whether it rendered.
 *
 * So idleness is bounded and non-fatal — and, because the tool must not make a
 * claim it cannot back, an unsettled page SAYS SO on stderr and reports
 * `settled: false` rather than quietly passing itself off as a settled one.
 */
export async function gotoSettled(page, url, options = {}) {
  const idleTimeoutMs = options.idleTimeoutMs ?? SETTLE_IDLE_TIMEOUT_MS;
  const onUnsettled = options.onUnsettled ?? warnUnsettled;
  try {
    await page.goto(url, { waitUntil: "load" });
  } catch (error) {
    throw translateNavigationError(url, error);
  }
  let settled = true;
  try {
    await page.waitForLoadState("networkidle", { timeout: idleTimeoutMs });
  } catch (error) {
    // Only the timeout is tolerated. A closed page, a crashed browser or any
    // other failure is a real fault and must not be swallowed as "not settled".
    if (!(error instanceof Error && error.name === "TimeoutError")) throw error;
    settled = false;
    onUnsettled(url, idleTimeoutMs);
  }
  // `page.evaluate(() => document.fonts.ready)` doesn't throw, but a FontFaceSet
  // isn't a plain object — Playwright silently coerces the returned value to `{}`
  // crossing the protocol boundary, discarding the wait's actual effect. Awaiting
  // inside the page and returning nothing gets the wait without the pointless
  // (and misleading) serialization.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return { settled };
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

/**
 * Shoots a page the CALLER has already navigated and settled — it does not
 * navigate itself. D7 (task 15): it used to `page.goto(scene.url)` on a page
 * `runCompare` had loaded moments earlier, so every round paid two full loads
 * and two settle waits, and any state the extraction had established was thrown
 * away between measuring the structure and photographing it. The two are now
 * guaranteed to be the same render of the same page, which is what a pixel
 * comparison against the extracted skeleton was always assuming.
 */
export async function shootScene(page, scene, outPath) {
  const target = page.locator(scene.selector).first();
  await target.waitFor({ state: "visible" });
  const targetBox = await target.boundingBox();
  const mask = await resolveMaskLocators(page, scene.masks, targetBox);
  return shootElement(target, outPath, mask, {
    selector: scene.selector,
    // `boundingBox()` speaks width/height; the inventory and `translateCaptureError`
    // speak w/h. Converted here rather than teaching the message two shapes.
    box: targetBox
      ? { x: targetBox.x, y: targetBox.y, w: targetBox.width, h: targetBox.height }
      : undefined,
    // The compare side has no region picker to fall back on — the scene's root is
    // whatever `--selector` (or the `--story` default) named, so that is the one
    // thing the operator can change.
    remedy: " Zvol přes --selector menší prvek scény.",
  });
}

/**
 * Chromium refuses to photograph an area past its own capture limit and rejects
 * with `Protocol error (Page.captureScreenshot): Unable to capture screenshot`.
 * That message does not start with `design-match:`, so `isDeliberateError`
 * (cli.mjs) called it a crash and `logFailure` printed the whole Playwright stack
 * — the THIRD time on this branch a throw escaped that check by being prefixed by
 * Playwright (`extract.mjs`'s in-page throw and `cli.mjs`'s emptiness guard record
 * the previous two), and the first to land on the invocation SKILL.md documents as
 * the default. D9, task 19.
 *
 * Translated on the NODE side, where the rejection is already an ordinary
 * `Promise` rejection — no prefix to escape. Same shape as
 * `translateNavigationError` above, and the same discipline: ONLY the one
 * recognisable refusal is translated. A detached element, a closed page, a crashed
 * browser or a timeout is a real fault whose stack is the diagnostic, and passing
 * it through untouched is what keeps this from becoming a swallow-everything
 * catch.
 *
 * Deliberately NOT a predictive guard, and specifically not `cropFitsPage`'s
 * (inventory.mjs). That predicate answers "does this box lie on the full-page
 * screenshot", which is the right question for a `clip`-based thumbnail and the
 * WRONG one here: `ZIBBY Redesign Canvas`'s winning region under `"karta"` is
 * 4256×1103 at (0,1173) — off the page image by that definition, refused a crop —
 * and `locator.screenshot` photographs it in full, producing the 8512×2206
 * `design.png` the published corpus table is measured from. Refusing it would be a
 * confident claim the tool cannot back, which is the one thing this branch forbids.
 * What actually decides is Chromium's capture limit, and the browser is the only
 * thing that knows where it is — so the tool asks it rather than guessing.
 *
 * `remedy` is the caller's, not this function's: `measure` has an inventory and
 * `--region`, `compare` has `--selector`, and inventing one sentence for both
 * would send half of its readers somewhere that does not exist.
 */
const UNCAPTURABLE_MESSAGE = "Unable to capture screenshot";

export function translateCaptureError(error, { selector, box, remedy = "" } = {}) {
  if (!(error instanceof Error) || !error.message.includes(UNCAPTURABLE_MESSAGE)) return error;
  const size = box
    ? ` o rozměrech ${Math.round(box.w)}×${Math.round(box.h)} px na pozici (${Math.round(box.x)},${Math.round(box.y)})`
    : "";
  return new Error(
    `design-match: region "${selector}" se nepodařilo vyfotit — prohlížeč odmítl snímek plochy${size}. ` +
      `Tak velký výřez je nad limitem snímkování v prohlížeči; není to chyba mockupu a menší výřez projde.${remedy}`,
  );
}

/**
 * The ONE screenshot both sides of a comparison go through — `measure` for
 * `design.png` and `shootScene` for `app.png` — for the same reason `gotoSettled`
 * is one function: a capture setting applied to one side and not the other is a
 * pixel delta the TOOL creates and then attributes to the implementation.
 *
 * Fix round 1, I4: `animations: "disabled"` lived only on the `shootScene` side,
 * so the design could be photographed mid-transition while the implementation
 * was frozen — on `ZIBBY Loading Screen` and `ZIBBY Orb`, exactly where it
 * matters. Without it, any CSS transition or animation (a hover state, a mount
 * fade-in, a spinner) is caught at whatever frame the shot lands on.
 *
 * Its reach stops at CSS. Motion driven by script — a three.js render loop, a
 * `setTimeout` progress simulation — lands on a wall-clock-dependent frame
 * regardless, so those two mockups stay non-deterministic between runs (a
 * measured ~0.01 % on `ZIBBY Loading Screen`). This option makes both sides
 * frozen the SAME way; it does not make either side reproducible.
 *
 * Being the one capture site is also why the D9 translation lives here: both
 * sides get it from one `try`, and `path` is written by Playwright only on
 * success, so a refused capture leaves no half-written png to name.
 */
export async function shootElement(locator, outPath, mask = [], context = {}) {
  try {
    return await locator.screenshot({ path: outPath, mask, animations: "disabled" });
  } catch (error) {
    throw translateCaptureError(error, context);
  }
}
