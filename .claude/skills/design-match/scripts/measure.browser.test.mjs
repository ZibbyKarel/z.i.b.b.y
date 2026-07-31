import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "cli.mjs");
const FIXTURES = path.join(here, "fixtures");

// M5: `runMeasure` is the one thing on this branch the suite never touched —
// the review had to verify the server wiring and the emptiness guard by hand,
// against the real corpus. It is not exported and cannot be, so the seam is the
// process boundary: run the CLI the way an operator does and read what it left
// on disk. cwd is a throwaway directory because ARTIFACT_ROOT (`.design-match`)
// and `assertServableRoot`'s "inside cwd" floor are both cwd-relative.
let tmpDirs = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function makeWorkspace(files) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "design-match-measure-")));
  tmpDirs.push(dir);
  // The default --theme points at the DS globals.css relative to cwd, which a
  // throwaway cwd has no copy of. One real token is enough for the mapping
  // stage to run; this test is about the measure path, not about tokens.
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

const measure = (cwd, file, slug) =>
  run("node", [CLI, "measure", file, "karta", "--slug", slug, "--theme", "theme.css"], { cwd });

describe("measure, end to end through the CLI", () => {
  // D2 part 1 in one assertion: this fixture loads its markup through the
  // synchronous XHR Babel uses, which Chromium refuses over `file://`. If the
  // http server were not wired into runMeasure, the region would come back
  // empty and the guard — not the assertion below — would be what failed.
  it("measures a mockup that only renders when it is served over http", async () => {
    const dir = await makeWorkspace({
      "mockup.html": await fs.readFile(path.join(FIXTURES, "xhr-loaded.html"), "utf8"),
      "xhr-loaded-partial.html": await fs.readFile(
        path.join(FIXTURES, "xhr-loaded-partial.html"),
        "utf8",
      ),
      "xhr-loaded-dep.js": await fs.readFile(path.join(FIXTURES, "xhr-loaded-dep.js"), "utf8"),
    });

    await measure(dir, "mockup.html", "wired");

    const spec = JSON.parse(
      await fs.readFile(path.join(dir, ".design-match", "wired", "spec.json"), "utf8"),
    );
    // Skeleton nodes carry no raw text, so the proof has to be structural:
    // `#root` is empty in the source html — the card and its heading exist only
    // inside the partial the synchronous XHR fetches.
    expect(spec.selector).toBe("#root");
    expect(spec.skeleton.children[0]).toMatchObject({ role: "card" });
    expect(spec.skeleton.children[0].children[0]).toMatchObject({ tag: "h2", role: "heading" });
  });

  // D2 part 2, at the only layer where "no spec.json was written" is a fact
  // rather than a promise: an empty box big enough to be ranked as a candidate,
  // which is exactly the shape seven mockups silently produced.
  it("refuses to write a spec for a region that rendered nothing, with one design-match: line", async () => {
    const dir = await makeWorkspace({
      "blank.html": `<!doctype html><html><body><div class="shell" style="width:400px;height:300px"></div></body></html>`,
    });

    const failure = await measure(dir, "blank.html", "blank").catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.code).toBe(3);
    expect(failure.stderr).toContain("design-match: region");
    // The whole point of `logFailure`: an operator-caused error is one line, not
    // a stack. A stack here would mean `isDeliberateError` missed the prefix.
    expect(failure.stderr).not.toContain("at ");
    await expect(
      fs.readFile(path.join(dir, ".design-match", "blank", "spec.json"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  // D8 (task 15), and the rule stated at every refusal path in runMeasure:
  // design-match never deletes what it SAW, and never writes what it CONCLUDED.
  // An out-of-range --region has already produced the crops; they are correct
  // renderings and they are exactly what the operator needs in order to pick a
  // valid region, so they stay — and the message names them. What must not exist
  // is spec.json, the file that asserts a conclusion.
  it("keeps the crops an out-of-range --region already produced, and names them", async () => {
    const dir = await makeWorkspace({
      "mockup.html": `<!doctype html><html><body><div id="root" style="width:400px;height:300px"><h2>karta</h2></div></body></html>`,
    });

    const failure = await run(
      "node",
      [
        CLI,
        "measure",
        "mockup.html",
        "karta",
        "--slug",
        "oob",
        "--theme",
        "theme.css",
        "--region",
        "999",
      ],
      { cwd: dir },
    ).catch((error) => error);

    expect(failure.code).toBe(3);
    expect(failure.stderr).toContain("design-match:");
    expect(failure.stderr).not.toContain("at ");
    // The evidence is on disk …
    const artifactDir = path.join(dir, ".design-match", "oob");
    await expect(fs.readFile(path.join(artifactDir, "r1.png"))).resolves.toBeInstanceOf(Buffer);
    // … the message says so …
    expect(failure.stderr).toContain("r1.png");
    // … and no conclusion was written.
    await expect(fs.readFile(path.join(artifactDir, "spec.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  /*
   * Fix round 1, I1, reproduced from the review's own repro on `ZIBBY Redesign
   * Canvas`: the refusal built its file list from a COUNT, so once `cropFitsPage`
   * could skip a crop it named files that were never written — five "bez
   * náhledu" lines and, two lines below them, "choose by looking at r1..r5.png"
   * over an empty directory.
   *
   * The assertion is the invariant rather than a fixture-specific string: the
   * message names exactly the crops that exist on disk, no more and no fewer.
   */
  it("names exactly the crops that exist on disk, never one cropFitsPage skipped", async () => {
    const dir = await makeWorkspace({
      "offpage.html": await fs.readFile(path.join(FIXTURES, "offpage.html"), "utf8"),
    });

    const failure = await run(
      "node",
      [
        CLI,
        "measure",
        "offpage.html",
        "karta",
        "--slug",
        "off",
        "--theme",
        "theme.css",
        "--region",
        "999",
      ],
      { cwd: dir },
    ).catch((error) => error);

    expect(failure.code).toBe(3);
    const artifactDir = path.join(dir, ".design-match", "off");
    const onDisk = (await fs.readdir(artifactDir)).filter((name) => /^r\d+\.png$/.test(name));
    // The fixture exists to make this true — without a skipped crop the test
    // would pass against the defect it is pinning.
    expect(failure.stdout).toContain("bez náhledu");
    for (const name of onDisk) expect(failure.stderr).toContain(name);
    for (let index = 1; index <= 5; index += 1) {
      const name = `r${index}.png`;
      if (onDisk.includes(name)) continue;
      expect(failure.stderr).not.toContain(name);
    }
  });

  /*
   * D9 (task 19), reproduced from the crash task 18 had to document as
   * true-today: `measure "ZIBBY Redesign Canvas.html" "qqzz"` chose a
   * 16256×18608 region, `locator.screenshot` rejected with a Playwright
   * `Protocol error (Page.captureScreenshot)`, and because that message does not
   * start with `design-match:` the operator got the whole stack at exit 3 — from
   * the invocation SKILL.md documents as the default.
   *
   * The fixture is that region's box exactly. Two things make this test the
   * mutation control rather than the unit test above: it goes through the real
   * `locator.screenshot`, so it fails if the translation is not wired into the
   * path `runMeasure` actually walks; and it asserts the absence of a stack,
   * which is the whole defect.
   */
  it("refuses a region the browser cannot photograph with one design-match: line, no stack", async () => {
    const dir = await makeWorkspace({
      "oversized.html": await fs.readFile(path.join(FIXTURES, "oversized.html"), "utf8"),
    });

    const failure = await measure(dir, "oversized.html", "huge").catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.code).toBe(3);
    expect(failure.stderr).toContain("design-match:");
    // The defect itself: a Playwright-prefixed message defeats isDeliberateError
    // and logFailure prints the stack.
    expect(failure.stderr).not.toContain("at ");
    expect(failure.stderr).not.toContain("Protocol error");
    // Named by fact: the region, and the box the operator saw in the inventory
    // two lines earlier.
    expect(failure.stderr).toContain("div.huge");
    expect(failure.stderr).toContain("16256×18608");
    // Task 17's artifact rule, applied here rather than as a third variant: the
    // crops that were taken survive and are named; nothing that asserts a
    // conclusion is written.
    const artifactDir = path.join(dir, ".design-match", "huge");
    const onDisk = await fs.readdir(artifactDir);
    for (const name of onDisk.filter((file) => /^r\d+\.png$/.test(file))) {
      expect(failure.stderr).toContain(name);
    }
    expect(onDisk).not.toContain("spec.json");
    // `locator.screenshot` writes its file only on success, so naming design.png
    // here would be naming a file that does not exist.
    expect(onDisk).not.toContain("design.png");
    expect(failure.stderr).not.toContain("design.png");
  });

  /*
   * The other half of D9's first decision, and the reason the guard is NOT
   * `cropFitsPage`: this region is off the page image by exactly the definition
   * `cropFitsPage` uses — it gets no crop, and the inventory says so — and the
   * browser photographs it perfectly well. A predictive guard built on
   * `cropFitsPage` would refuse it, which is a claim the tool cannot back.
   */
  it("still measures a region that is off the page image but capturable", async () => {
    const dir = await makeWorkspace({
      "offpage.html": await fs.readFile(path.join(FIXTURES, "offpage.html"), "utf8"),
    });

    const result = await run(
      "node",
      [
        CLI,
        "measure",
        "offpage.html",
        "karta",
        "--slug",
        "offpage",
        "--theme",
        "theme.css",
        "--region",
        "2",
      ],
      { cwd: dir },
    );

    // Region 2 is the off-page one, and the inventory says it has no preview —
    // `cropFitsPage` refused it a thumbnail. It measures anyway.
    expect(result.stdout).toContain("bez náhledu");
    const artifactDir = path.join(dir, ".design-match", "offpage");
    const spec = JSON.parse(await fs.readFile(path.join(artifactDir, "spec.json"), "utf8"));
    expect(spec.selector).toBe("div.off-page");
    await expect(fs.readFile(path.join(artifactDir, "design.png"))).resolves.toBeInstanceOf(Buffer);
  });

  /*
   * Task 20, I1 — instance 7, and the control that proves the boundary covers
   * the call site the per-call translator missed rather than only the one it was
   * written beside.
   *
   * `cropRegions` shoots the whole page to cut previews. On a 20000×9000
   * document Chromium refuses that shot with the SAME
   * `Protocol error (Page.captureScreenshot): Unable to capture screenshot`
   * `translateCaptureError` already recognised — one call site over, so the
   * operator got a raw stack, and it killed `measure` before the inventory
   * printed at all.
   *
   * This runs through the real `page.screenshot`, so it fails if the boundary is
   * removed, and it asserts on the absence of a stack, which is the whole defect.
   */
  it("refuses a page the browser cannot photograph for previews with one design-match: line, no stack", async () => {
    const dir = await makeWorkspace({
      "oversized-page.html": await fs.readFile(path.join(FIXTURES, "oversized-page.html"), "utf8"),
    });

    const failure = await measure(dir, "oversized-page.html", "wide").catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.code).toBe(3);
    expect(failure.stderr).toContain("design-match:");
    expect(failure.stderr).not.toContain("page.screenshot");
    expect(failure.stderr).not.toContain("Protocol error");
    expect(failure.stderr).not.toContain("    at ");
    // Named by fact: the page whose shot was refused, at its real size.
    expect(failure.stderr).toContain("20000×9000");
    // The remedy must not be `--region`: the inventory the operator would pick
    // from is exactly what this failure prevented from printing.
    expect(failure.stdout).not.toContain("Inventura");
    expect(failure.stderr).not.toContain("--region");
    // Nothing that asserts a conclusion was written.
    const artifactDir = path.join(dir, ".design-match", "wide");
    expect(await fs.readdir(artifactDir)).not.toContain("spec.json");
  });

  /*
   * Fix round 1, I4. `shootScene` shoots the implementation with
   * `animations: "disabled"`; `design.png` was shot without it, so the two sides
   * of every comparison were captured under different settings and the tool
   * manufactured a pixel delta it then attributed to the implementation. Mirrors
   * the existing `shootScene` byte-equality test, one layer up.
   */
  it("shoots design.png byte-identically on two runs of a continuously animated mockup", async () => {
    const dir = await makeWorkspace({
      "animated-card.html": await fs.readFile(path.join(FIXTURES, "animated-card.html"), "utf8"),
    });

    await measure(dir, "animated-card.html", "anim-a");
    await measure(dir, "animated-card.html", "anim-b");

    const [first, second] = await Promise.all([
      fs.readFile(path.join(dir, ".design-match", "anim-a", "design.png")),
      fs.readFile(path.join(dir, ".design-match", "anim-b", "design.png")),
    ]);
    expect(first.equals(second)).toBe(true);
  });

  // D7's other half, at the process boundary: a mockup that renders and then
  // never goes idle (an unread 404 response body — `ZIBBY Redesign Canvas.html`
  // in miniature) used to burn 30 s and fail. It must measure.
  it("measures a mockup whose network never goes idle", async () => {
    const dir = await makeWorkspace({
      "never-idle.html": await fs.readFile(path.join(FIXTURES, "never-idle.html"), "utf8"),
    });

    const result = await measure(dir, "never-idle.html", "restless");

    const spec = JSON.parse(
      await fs.readFile(path.join(dir, ".design-match", "restless", "spec.json"), "utf8"),
    );
    expect(spec.selector).toBe("#root");
    // Measured, but not silently: the tool says the page never settled rather
    // than passing an unsettled render off as a settled one.
    expect(result.stderr).toContain("neustálila");
    // Fix round 1, I3: stderr is ephemeral, and the design is measured once,
    // rounds before any comparison reads it. The fact has to travel in the
    // artifact, or every later `compare` states a pixel delta against a
    // design.png nobody knows was photographed mid-load.
    expect(spec.settled).toBe(false);
  });

  it("records in spec.json that a page which did settle, settled", async () => {
    const dir = await makeWorkspace({
      "mockup.html": `<!doctype html><html><body><div id="root" style="width:400px;height:300px"><h2>karta</h2></div></body></html>`,
    });

    await measure(dir, "mockup.html", "calm");

    const spec = JSON.parse(
      await fs.readFile(path.join(dir, ".design-match", "calm", "spec.json"), "utf8"),
    );
    expect(spec.settled).toBe(true);
  });

  // Fix round 2, N2. `carriesContent`'s handling of the truncation flag was
  // pinned over hand-built objects, but nothing pinned that `extractRaw` emits
  // the flag at all — setting it to a constant `false` left every test green
  // while ZIBBY Roadmap.html exited 3 with a false "region nic neobsahuje".
  // That is the exact regression this rule already caused once, so the pin has
  // to be on the producer, and the only place the flag is observable is the
  // outcome: `normalizeSkeleton` deliberately never copies it into spec.json.
  //
  // The fixture is the roadmap's shape in miniature: layout wrappers with no
  // text of their own, nested past extractRaw's depth cap of 6, with every
  // piece of content below the cut.
  it("measures a mockup whose only content sits below the extraction depth cap", async () => {
    const depth = 9;
    const inner = Array.from({ length: depth }).reduce(
      (acc) => `<div class="layer">${acc}</div>`,
      `<h2>obsah pod řezem</h2>`,
    );
    const dir = await makeWorkspace({
      "deep.html": `<!doctype html><html><body><div id="root" style="width:400px;height:300px">${inner}</div></body></html>`,
    });

    await measure(dir, "deep.html", "deep");

    // The assertion is that it did NOT refuse. The stored skeleton is cut off
    // at the cap and so genuinely looks blank — which is the point: the tool
    // must not condemn a subtree it never looked at.
    const spec = JSON.parse(
      await fs.readFile(path.join(dir, ".design-match", "deep", "spec.json"), "utf8"),
    );
    expect(spec.selector).toBe("#root");
  });
});
