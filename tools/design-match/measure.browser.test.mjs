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
