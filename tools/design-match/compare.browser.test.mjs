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
const page = (body, fontStack = "Geist, Arial, sans-serif") =>
  `<!doctype html><html lang="cs"><head><meta charset="utf-8" /></head><body style="margin:0">
<div id="root" style="width:400px;height:300px;background:#101418;font-family:${fontStack}">${body}</div>
</body></html>`;

const CARD = `<h2 style="margin:0;color:#eaeaea">karta</h2>`;

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
  // D7 rides along on the same run: the implementation page must be fetched
  // exactly ONCE. shootScene used to `page.goto` it a second time, after
  // runCompare had already loaded and settled it.
  it("writes a report.md whose verdict matches the exit code, having loaded the page once", async () => {
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
    expect(server.counts.get("/impl.html")).toBe(1);
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
});
