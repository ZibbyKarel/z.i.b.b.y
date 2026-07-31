import { execFile } from "node:child_process";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "cli.mjs");

/**
 * `runCompare` is the other half of what the suite never touched, and it is
 * where task 15's D4, D5, D6 and D7 are actually observable — the verdict
 * written into report.md versus the process's exit code, the selector default,
 * whether the pixel layer ran, and how many times the page was loaded. None of
 * those is reachable from a unit test of an exported helper, so the seam is the
 * process boundary, exactly as `measure.browser.test.mjs` does it: run the CLI
 * the way an operator does, against a real page, and read what it left behind.
 *
 * `--app-base` exists so the "app" can be a local fixture server instead of a
 * running Next dev server. The server counts requests per path, which is how D7
 * (shootScene no longer re-navigating a page runCompare already loaded) is
 * pinned as a fact rather than as a code reading.
 */
let tmpDirs = [];
let servers = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers = [];
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

const CONTENT_TYPE = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8" };

async function startCountingServer(root) {
  const counts = new Map();
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    counts.set(pathname, (counts.get(pathname) ?? 0) + 1);
    fs.readFile(path.join(root, pathname)).then(
      (body) => {
        res.writeHead(200, {
          "content-type": CONTENT_TYPE[path.extname(pathname)] ?? "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end(body);
      },
      () => {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
      },
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const handle = {
    origin: `http://127.0.0.1:${server.address().port}`,
    counts,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  servers.push(handle);
  return handle;
}

async function makeWorkspace(files) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "design-match-compare-")));
  tmpDirs.push(dir);
  await fs.writeFile(
    path.join(dir, "theme.css"),
    "@theme {\n  --color-base: #0b0e13;\n}\n",
    "utf8",
  );
  for (const [name, contents] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), contents, "utf8");
  }
  return dir;
}

/** The design mockup and the two implementations differ in exactly one thing each. */
const page = (body, fontStack = "Geist, Arial, sans-serif", size = "width:400px;height:300px") =>
  `<!doctype html><html lang="cs"><head><meta charset="utf-8" /></head><body style="margin:0">
<div id="root" style="${size};background:#101418;font-family:${fontStack}">${body}</div>
</body></html>`;

const CARD = `<h2 style="margin:0;color:#eaeaea">karta</h2>`;

/**
 * Same node as `CARD`, sized as a fraction of its parent instead of by content.
 * The skeleton gate compares every box RELATIVE to its parent, so a percentage
 * child keeps its ratios (0.5 × 0.5) whatever the root's absolute size is —
 * which is what lets a fixture change the root's size by orders of magnitude and
 * still reach the layers past the gate.
 */
const SIZED_CARD = `<h2 style="margin:0;width:50%;height:50%;color:#eaeaea">karta</h2>`;

const measure = (cwd, file, slug) =>
  run("node", [CLI, "measure", file, "karta", "--slug", slug, "--theme", "theme.css"], { cwd });

const compare = (cwd, args) =>
  run("node", [CLI, "compare", ...args], { cwd }).then(
    (ok) => ({ code: 0, ...ok }),
    (error) => error,
  );

describe("compare, end to end through the CLI", () => {
  // D4: a round that exits 1 used to write `Výsledek: PARK` into report.md — the
  // file SKILL.md tells the operator to read first — while the console said
  // POKRAČUJ. The assertion is the agreement between the two, not the wording.
  //
  // Fix round 1, M6: this test used to carry a request-count assertion and a
  // name that promised the D7 pin. It cannot pin D7 — its round fails the
  // skeleton gate and returns before `shootScene` is ever reached, which is
  // exactly how the d7a mutant survived. The D7 pin has one home, the round that
  // actually reaches `shootScene`, and this test now claims only what it checks.
  it("writes a report.md whose verdict matches the exit code", async () => {
    const dir = await makeWorkspace({
      "design.html": page(CARD),
      // One extra child: the skeleton gate fails, which is the ordinary
      // "keep going" round — exit 1.
      "impl.html": page(`${CARD}<p style="margin:0">navíc</p>`),
    });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("POKRAČUJ");
    const report = await fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8");
    expect(report).toContain("**Výsledek:** POKRAČUJ");
    expect(report).not.toContain("PARK");
    expect(report).toContain("Kolo 1 z 5");
  });

  // D5 part 1: `compare` used to inherit the DESIGN's selector when --selector
  // was omitted. This fixture is the dangerous case, not the crashing one — the
  // design's selector is `#root` and the implementation HAS a `#root`, so
  // inheriting it does not fail, it silently measures a node nobody chose. The
  // tool must refuse instead.
  it("refuses a route with no --selector rather than inheriting the design's", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain("--selector");
    expect(result.stderr).not.toContain("at ");
    await expect(
      fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  /*
   * Task 20, I1 — instance 4, and the commonest operator error the tool has:
   * `--route` against a dev server that is not running. `page.goto` rejects with
   * `net::ERR_CONNECTION_REFUSED` under `name: "Error"`, so the per-call
   * `translateNavigationError`'s `TimeoutError` test missed it and the operator
   * got an 11-line raw stack.
   *
   * The control is at the call site, not at the boundary's unit test: it goes
   * through the real `page.goto` in `gotoSettled`, so it fails if the annotation
   * or the boundary is removed.
   */
  it("refuses an unreachable --app-base with one clean design-match: line, no stack", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    // A port nothing is listening on — bound to get one the OS considered free,
    // then closed. A literal low port would report ERR_UNSAFE_PORT instead, which
    // is a different browser refusal and would not pin the one this is about.
    const dead = await startCountingServer(dir);
    await dead.close();

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      dead.origin,
      "--selector",
      "#root",
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain("design-match:");
    expect(result.stderr).toContain(`${dead.origin}/impl.html`);
    expect(result.stderr).toContain("ERR_CONNECTION_REFUSED");
    // The whole defect: without the boundary this is a raw Playwright stack.
    expect(result.stderr).not.toContain("page.goto:");
    expect(result.stderr).not.toContain("Call log");
    expect(result.stderr).not.toContain("    at ");
  });

  /*
   * Task 20, I1 — instance 5. A Tailwind class name typed straight into
   * `--selector` (`.sm:flex`) is legal-looking and is not legal CSS: the browser
   * rejects it inside `page.evaluate` with a `SyntaxError`, Playwright prefixes
   * the message, and the operator got an 8-line stack.
   *
   * This is a DIFFERENT failure from the test below it (a selector that is valid
   * CSS and matches nothing) and it walks the same call site — which is exactly
   * why one had a clean line and the other did not.
   */
  it("refuses a selector that is not valid CSS with one clean design-match: line, no stack", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      ".sm:flex",
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain("design-match:");
    expect(result.stderr).toContain(".sm:flex");
    expect(result.stderr).not.toContain("page.evaluate");
    expect(result.stderr).not.toContain("Failed to execute");
    expect(result.stderr).not.toContain("    at ");
  });

  /*
   * Task 20, I1 — instance 6. The same operator mistake in `--mask`, arriving
   * through `locator.all` and Playwright's OWN selector parser rather than the
   * browser's. Two different libraries, two different message shapes, one rule
   * at the boundary — and the round has to get past the skeleton gate and the
   * font preflight to reach `shootScene` at all, which identical pages do.
   */
  it("refuses a --mask that is not valid CSS with one clean design-match: line, no stack", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
      "--mask",
      "div[",
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain("design-match:");
    expect(result.stderr).toContain("div[");
    expect(result.stderr).not.toContain("locator.all");
    expect(result.stderr).not.toContain("Unexpected token");
    expect(result.stderr).not.toContain("    at ");
  });

  // D5 part 2: the throw happened inside `page.evaluate`, Playwright prefixed
  // the message, `isDeliberateError` stopped recognising it, and the operator
  // got a raw stack. A selector that matches nothing is the likeliest operator
  // error in the whole tool.
  it("fails a selector that matches nothing with one clean design-match: line, no stack", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#nothing-matches-this",
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain("design-match:");
    expect(result.stderr).toContain("#nothing-matches-this");
    expect(result.stderr).not.toContain("page.evaluate");
    expect(result.stderr).not.toContain("at ");
  });

  // D6: identical fonts in a different fallback order used to park the run at
  // exit 2 with the pixel layer suppressed — which left the loop with no
  // progress signal for the rest of its rounds. The primary family is the same,
  // so the run must proceed all the way to the pixel layer. `app.png` existing
  // is the proof that it did: it is written by shootScene, which the preflight
  // used to skip entirely.
  it("reaches the pixel layer when only the font fallback order differs", async () => {
    const dir = await makeWorkspace({
      "design.html": page(CARD, "Geist, Arial, sans-serif"),
      "impl.html": page(CARD, "Geist, sans-serif, Arial"),
    });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
    ]);

    expect(result.code).not.toBe(2);
    await expect(
      fs.readFile(path.join(dir, ".design-match", "s", "app.png")),
    ).resolves.toBeInstanceOf(Buffer);
    const report = await fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8");
    expect(report).not.toContain("font stack se liší");
    // D7, and this is the round where it is observable: only a round that
    // survives the gate and the preflight ever reaches shootScene, so this is
    // the only place a second navigation could happen. The gate-failing round
    // above returns before shootScene is called and cannot see it — which is
    // exactly the mistake the mutation run caught.
    expect(server.counts.get("/impl.html")).toBe(1);
  });

  /*
   * Fix round 1, I3. By this task's own headline finding, every `--route`
   * compare against this repo's web app runs unsettled — the run-events SSE
   * stream is a request that by construction never finishes. A report that
   * states a pixel percentage with no record that the page was still loading is
   * the tool making a claim it cannot back, and a `console.warn` on stderr does
   * not survive to the file the driver reads.
   */
  it("records in report.md that the page was photographed before it settled", async () => {
    const dir = await makeWorkspace({
      "design.html": page(CARD),
      // Identical to the design in every way a comparison can see, plus the
      // second of the two causes `warnUnsettled` names: a poll that keeps the
      // connection count above zero forever, so `networkidle` can never fire.
      // (This is `apps/web`'s real shape — the run-events SSE stream — rather
      // than `never-idle.html`'s unread-404-body, which depends on how the
      // serving side ends the response.) The run must complete anyway, and say
      // that it did so mid-load.
      "impl.html": page(CARD).replace(
        "</body>",
        `<script>setInterval(() => { fetch("./design-match-poll.json"); }, 100);</script></body>`,
      ),
    });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
    ]);

    expect(result.stderr).toContain("neustálila");
    const report = await fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8");
    expect(report).toContain("neustálila");
    const round = JSON.parse(
      await fs.readFile(path.join(dir, ".design-match", "s", "round-1.json"), "utf8"),
    );
    expect(round.settled).toBe(false);
  });

  it("says nothing about settling in a report whose page settled normally", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
    ]);

    const report = await fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8");
    expect(report).not.toContain("neustálila");
  });

  /*
   * Fix round 1, M7. D5's headline decision — a story with no `--selector`
   * mounts at `#storybook-root` — had no test above `resolveScene`'s unit test,
   * because only the route origin was overridable. `--storybook-base` makes the
   * story path reachable here: this fixture answers on `/iframe.html` exactly as
   * Storybook does, and the run only gets as far as a verdict if the default
   * selector resolved.
   */
  it("compares a story with no --selector at all, mounting at #storybook-root", async () => {
    const dir = await makeWorkspace({
      "design.html": page(CARD),
      "iframe.html": `<!doctype html><html lang="cs"><head><meta charset="utf-8" /></head><body style="margin:0">
<div id="storybook-root" style="width:400px;height:300px;background:#101418;font-family:Geist, Arial, sans-serif">${CARD}</div>
</body></html>`,
    });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--story",
      "ds-card--default",
      "--storybook-base",
      server.origin,
    ]);

    // Whatever the verdict, it is a verdict: the run reached the comparison
    // rather than refusing for want of a selector or crashing on a missing node.
    expect([0, 1, 2]).toContain(result.code);
    expect(result.stderr).not.toContain("--selector");
    // Against THIS server, not whatever happens to be listening on :6006.
    expect(server.counts.get("/iframe.html")).toBe(1);
    await expect(
      fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8"),
    ).resolves.toContain("**Výsledek:**");
  });

  /*
   * Fix round 1, M3. D8's rule covered writing conclusions but said nothing
   * about ones already on disk, and SKILL.md tells the operator to read
   * report.md FIRST, always — the exact premise D4 was fixed on. A refused
   * round used to leave the previous round's POKRAČUJ standing as though it
   * were the answer to the invocation that just failed.
   */
  it("marks the previous report.md as superseded when the next round refuses", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);
    const args = ["--slug", "s", "--route", "/impl.html", "--app-base", server.origin];

    await compare(dir, [...args, "--selector", "#root"]);
    const reportPath = path.join(dir, ".design-match", "s", "report.md");
    expect(await fs.readFile(reportPath, "utf8")).toContain("**Výsledek:**");

    const failure = await compare(dir, [...args, "--selector", "#nothing-matches-this"]);

    expect(failure.code).toBe(3);
    const stale = await fs.readFile(reportPath, "utf8");
    expect(stale).toContain("NEPLATNÉ");
    // The retraction adds a caveat; it must not fabricate a new verdict, and it
    // must not destroy the record of the round that really did run.
    expect(stale).toContain("**Výsledek:**");
  });

  /*
   * I2 (task 20). Two tasks that were each right alone. `writeArtifacts` (fix
   * round 2) writes everything it can and THEN throws, so one bad file cannot
   * cut the record short. `markStaleReport` (task 16, M3) assumes any failing
   * `compare` means the report.md on disk predates the invocation. Together they
   * retracted the freshly written report of the round that had just run, with a
   * sentence saying it describes an older one — a claim the tool cannot back.
   */
  it("does not retract the round it just ran when only a sibling artifact failed to write", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    // A directory where skeleton.md belongs: writeFile fails with EISDIR for
    // that one entry while every sibling — report.md included — lands normally.
    // This is the review's own reproduction, and the only shape of failure that
    // reaches the seam.
    await fs.mkdir(path.join(dir, ".design-match", "s", "skeleton.md"), { recursive: true });

    const failure = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
    ]);

    expect(failure.code).toBe(3);
    expect(failure.stderr).toContain("skeleton.md");

    const report = await fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8");
    // The verdict below the marker is this round's own, and it stands.
    expect(report).toContain("**Výsledek:**");
    expect(report).not.toContain("NEPLATNÉ");
    // What IS true gets its own sentence, naming what is missing — otherwise the
    // exit code and the headline simply disagree with nothing to explain them.
    expect(report).toContain("NEÚPLNÉ");
    expect(report).toContain("skeleton.md");
  });

  /*
   * D10 (task 19). The skeleton gate CANNOT catch this: `relativeTo` returns
   * `{w:1,h:1,x:0,y:0}` for the root by construction, so the root's absolute size
   * is never compared and two structurally identical trees of different size pass
   * the gate cleanly. The run then reached `diffPngs`, which threw INSIDE the
   * browser block — before a single artifact was written — so the operator was
   * told the two images differ in size and given neither image.
   *
   * The fixture differs in exactly the root's width, which is what makes the gate
   * pass (every child's box is relative to its parent, and those ratios are
   * unchanged) and the two screenshots differ (800×600 vs 1000×600 device px).
   */
  it("parks on mismatched screenshot sizes instead of crashing, and keeps both images", async () => {
    const dir = await makeWorkspace({
      "design.html": page(CARD),
      "impl.html": page(CARD, "Geist, Arial, sans-serif", "width:500px;height:300px"),
    });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
    ]);

    // PARK, not CHYBA: an ordinary implementation difference, handed to the
    // operator as one decision rather than as a tool failure.
    expect(result.code).toBe(2);
    expect(result.stdout).toContain("PARK");
    expect(result.stderr).not.toContain("at ");
    const artifactDir = path.join(dir, ".design-match", "s");
    // The two images whose sizes differ ARE the finding, so they are the one
    // thing that must survive.
    await expect(fs.readFile(path.join(artifactDir, "design.png"))).resolves.toBeInstanceOf(Buffer);
    await expect(fs.readFile(path.join(artifactDir, "app.png"))).resolves.toBeInstanceOf(Buffer);
    const report = await fs.readFile(path.join(artifactDir, "report.md"), "utf8");
    expect(report).toContain("800×600");
    expect(report).toContain("1000×600");
    // Fix round 1, Minor 4: the remedy paragraph belongs to the verdict headline
    // and the round's reason — two places, both answering "what happened". The
    // "## Preflighty" line answers "what did each check say" and takes the short
    // form, so the paragraph must not appear a third time.
    expect(report.match(/Sjednoť velikost scény/g)).toHaveLength(2);
    expect(report).toContain(
      "rozměry snímků: snímky mají různé rozměry — design 800×600 px, implementace 1000×600 px\n",
    );
    // The gate really did pass — this is not a skeleton failure wearing a
    // different label.
    const skeleton = await fs.readFile(path.join(artifactDir, "skeleton.md"), "utf8");
    expect(skeleton).not.toContain("SKELETON MISMATCH");
    // …and the values really were measured, which is where the actionable
    // difference (`width`) is named against a node.
    const values = await fs.readFile(path.join(artifactDir, "values.md"), "utf8");
    expect(values).not.toContain("Neměřeno");
    expect(values).toContain("width");
    await expect(fs.readFile(path.join(artifactDir, "round-1.json"), "utf8")).resolves.toContain(
      "rozměry",
    );
  });

  /*
   * D9 (task 19), the `compare` half. `shootElement` is the single funnel both
   * commands shoot through, but only `measure` passes its own context — the
   * `selector`, the box and the remedy — and only `measure` had a test. Fix round
   * 1, Important 2: deleting the whole context object from `shootScene`'s call
   * left both suites green, so `compare`'s half of the fix was held by a code
   * reading alone. This is the round that reaches `shootScene`: the gate passes
   * (percentage child, unchanged ratios) and the fonts match, so the run gets all
   * the way to photographing a scene Chromium will not photograph.
   *
   * The remedy differs from `measure`'s on purpose and that is what this pins:
   * there is no region inventory on `compare`, so pointing at `--region <n>`
   * would name a flag the command does not have.
   */
  it("refuses a scene the browser cannot photograph with one design-match: line, no stack", async () => {
    const dir = await makeWorkspace({
      "design.html": page(SIZED_CARD),
      "impl.html": page(
        SIZED_CARD,
        "Geist, Arial, sans-serif",
        "width:16256px;height:18608px;transform:translate(-6000px,-6000px)",
      ),
    });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
    ]);

    expect(result.code).toBe(3);
    // The whole contract for a refusal: one prefixed line and no stack. Without
    // the translation this arrives as `locator.screenshot: Protocol error …`,
    // which `isDeliberateError` does not recognise.
    expect(result.stderr).toContain("design-match: region");
    expect(result.stderr).not.toContain("locator.screenshot");
    expect(result.stderr).not.toContain("    at ");
    // Named concretely enough to act on: which element, and how big it was.
    expect(result.stderr).toContain('"#root"');
    expect(result.stderr).toContain("16256×18608");
    // …and the remedy is compare's own, not measure's --region inventory.
    expect(result.stderr).toContain("--selector");
    expect(result.stderr).not.toContain("--region");
  });

  /*
   * D12 (task 19). `preflight.mjs:93` built a message for the passing case that
   * nothing ever read, so a clean round said nothing about fonts at all — and
   * silence from that layer is indistinguishable from a round that never reached
   * it. This is the round that DOES reach it: identical pages, so the gate passes
   * and the preflight actually runs (a gate-failing fixture would assert on a path
   * the run never walks).
   */
  it("records the passing font preflight in report.md rather than leaving it silent", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);

    const result = await compare(dir, [
      "--slug",
      "s",
      "--route",
      "/impl.html",
      "--app-base",
      server.origin,
      "--selector",
      "#root",
    ]);

    const report = await fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8");
    expect(report).toContain("## Preflighty");
    expect(report).toContain("font stack shodný v první rodině");
    expect(report).toContain("rozměry snímků sedí");
    // Not on stdout: a clean run's console stays the one outcome line it has
    // always been.
    expect(result.stdout).not.toContain("font stack");
  });

  it("does not stack a second retraction onto an already-superseded report", async () => {
    const dir = await makeWorkspace({ "design.html": page(CARD), "impl.html": page(CARD) });
    await measure(dir, "design.html", "s");
    const server = await startCountingServer(dir);
    const args = ["--slug", "s", "--route", "/impl.html", "--app-base", server.origin];

    await compare(dir, [...args, "--selector", "#root"]);
    await compare(dir, [...args, "--selector", "#nothing-matches-this"]);
    await compare(dir, [...args, "--selector", "#nothing-matches-this"]);

    const stale = await fs.readFile(path.join(dir, ".design-match", "s", "report.md"), "utf8");
    expect(stale.match(/NEPLATNÉ/g)).toHaveLength(1);
  });
});
