import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compositeDiff,
  renderComponents,
  renderReport,
  renderSkeleton,
  renderTokens,
  renderValues,
  writeArtifacts,
} from "./report.mjs";

function png(width, height, paint) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (width * y + x) << 2;
      const [r, g, b, a] = paint(x, y);
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = a;
    }
  }
  return PNG.sync.write(image);
}

describe("renderSkeleton", () => {
  it("reports a passing skeleton as sedí", () => {
    expect(renderSkeleton([])).toContain("Sedí");
    expect(renderSkeleton([])).not.toContain("MISMATCH");
  });

  it("renders each finding under its path heading", () => {
    const out = renderSkeleton([
      { path: "form", kind: "layout-mode", message: "grid vs flex-column" },
    ]);
    expect(out).toContain("SKELETON MISMATCH");
    expect(out).toContain("`form`");
    expect(out).toContain("**layout-mode** — grid vs flex-column");
  });
});

describe("renderValues", () => {
  it("reports no deltas as sedí, but still explains the path space", () => {
    const out = renderValues([]);
    expect(out).toContain("Sedí");
    expect(out).toContain("extractValues");
    expect(out).toContain("skeleton.md");
  });

  it("groups deltas by path and carries the same path-space note", () => {
    const out = renderValues([
      {
        path: "card/row[0]",
        prop: "gap",
        expected: "16px",
        actual: "12px",
        message: "gap 16 vs 12",
      },
      {
        path: "card/row[0]",
        prop: "color",
        expected: "red",
        actual: "blue",
        message: "color red vs blue",
      },
      { path: "form", prop: "width", expected: "100%", actual: "80%", message: "width 100 vs 80" },
    ]);
    expect(out).toContain("`card/row[0]`");
    expect(out).toContain("**gap** — gap 16 vs 12");
    expect(out).toContain("**color** — color red vs blue");
    expect(out).toContain("`form`");
    expect(out).toContain("**width** — width 100 vs 80");
    expect(out).toContain("extractValues");
  });
});

describe("renderTokens", () => {
  it("renders an empty table with no rows", () => {
    const out = renderTokens([]);
    expect(out).toContain("# Mapování tokenů");
    expect(out.trim().split("\n")).toHaveLength(4);
  });

  it("renders exact and new mappings differently", () => {
    const out = renderTokens([
      { value: "#0a0a0a", mapping: { kind: "exact", token: "--zt-fg-1" } },
      {
        value: "#123456",
        mapping: { kind: "new", nearest: "--zt-fg-2", distance: 4.2, proposedName: "--zt-fg-hero" },
      },
    ]);
    expect(out).toContain("| `#0a0a0a` | `--zt-fg-1` | — | 0 |");
    expect(out).toContain("| `#123456` | **nový** `--zt-fg-hero` | `--zt-fg-2` | 4.2 |");
  });
});

describe("renderComponents", () => {
  it("renders no decisions as an empty body under the heading", () => {
    const out = renderComponents([]);
    expect(out.trim()).toBe("# Volba komponent");
  });

  it("renders a decision with rejected candidates and one without any", () => {
    const out = renderComponents([
      {
        path: "form/action[0]",
        chosen: "Button",
        rejected: [{ component: "IconButton", reason: "chybí label" }],
      },
      { path: "form/input[0]", chosen: "TextInput", rejected: [] },
    ]);
    expect(out).toContain("`form/action[0]` → Button");
    expect(out).toContain("`IconButton` zamítnut — chybí label");
    expect(out).toContain("`form/input[0]` → TextInput");
    expect(out).toContain("žádný existující DS kandidát nebyl zvažován");
  });
});

describe("renderReport", () => {
  it("renders HOTOVO when the final round's status is done, regardless of the stop flag", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 0.3, skeletonPass: true, reason: "diff 0.3 %" }],
      verdict: { stop: true, status: "done", reason: "diff 0.3 %, největší region 2×2" },
      masks: [],
    });
    expect(out).toContain("**Výsledek:** HOTOVO");
    expect(out).not.toContain("PARK");
  });

  it("renders PARK when the final round's status is continue or stop", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [{ percent: 8, skeletonPass: true, reason: "diff 8 %" }],
      verdict: { stop: true, status: "continue", reason: "strop 5 kol vyčerpán" },
      masks: ["form/input[2]"],
    });
    expect(out).toContain("**Výsledek:** PARK — strop 5 kol vyčerpán");
    expect(out).toContain("## Maskované regiony");
    expect(out).toContain("`form/input[2]`");
  });

  it("omits the masks section entirely when there are none", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      masks: [],
    });
    expect(out).not.toContain("Maskované regiony");
  });

  it("names a round's diff-image failure inline in its bullet (fix round 1, Important 1)", () => {
    const out = renderReport({
      slug: "roadmap",
      rounds: [
        { percent: 4, skeletonPass: true, reason: "kolo 1" },
        {
          percent: 0.3,
          skeletonPass: true,
          reason: "kolo 2",
          diffImageError: "design-match: rozměry se liší — app 4×4, maska 6×4",
        },
      ],
      verdict: { stop: true, status: "continue", reason: "diff obrázek chybí pro kolo 2" },
      masks: [],
    });
    expect(out).toContain("kolo 2");
    expect(out).toContain("diff obrázek chybí");
    expect(out).toContain("app 4×4, maska 6×4");
    // round 1 has no diffImageError, so its bullet must not carry the note
    expect(out.split("\n").find((line) => line.includes("kolo 1"))).not.toContain(
      "diff obrázek chybí",
    );
  });

  it("lists only the sibling files actually supplied, under their own section (fix round 1, Minor 2)", () => {
    const withFiles = renderReport({
      slug: "roadmap",
      rounds: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      masks: [],
      siblingFiles: ["skeleton.md", "values.md", "round-1.json"],
    });
    expect(withFiles).toContain("## Doprovodné soubory");
    expect(withFiles).toContain("`skeleton.md`");
    expect(withFiles).toContain("`values.md`");
    expect(withFiles).toContain("`round-1.json`");
    expect(withFiles).not.toContain("spec.json");

    const withoutFiles = renderReport({
      slug: "roadmap",
      rounds: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      masks: [],
    });
    expect(withoutFiles).not.toContain("Doprovodné soubory");
  });
});

describe("compositeDiff", () => {
  it("leaves the app image byte-identical when the mask is fully transparent", () => {
    const app = png(6, 6, () => [10, 20, 30, 255]);
    const mask = png(6, 6, () => [255, 0, 0, 0]);
    const out = compositeDiff(app, mask);
    const outPng = PNG.sync.read(out);
    const appPng = PNG.sync.read(app);
    expect(Buffer.compare(outPng.data, appPng.data)).toBe(0);
  });

  it("shows an opaque mask pixel at its exact coordinate, leaving the rest untouched", () => {
    const app = png(6, 6, () => [0, 0, 0, 255]);
    const mask = png(6, 6, (x, y) => (x === 2 && y === 3 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
    const out = compositeDiff(app, mask);
    const outPng = PNG.sync.read(out);
    const hit = (2 + 6 * 3) << 2;
    expect([outPng.data[hit], outPng.data[hit + 1], outPng.data[hit + 2]]).toEqual([255, 0, 0]);
    const untouched = (0 + 6 * 0) << 2;
    expect([
      outPng.data[untouched],
      outPng.data[untouched + 1],
      outPng.data[untouched + 2],
    ]).toEqual([0, 0, 0]);
  });

  it("does not mutate the app buffer passed in", () => {
    const app = png(4, 4, () => [1, 2, 3, 255]);
    const appCopy = Buffer.from(app);
    const mask = png(4, 4, () => [255, 255, 255, 128]);
    compositeDiff(app, mask);
    expect(Buffer.compare(app, appCopy)).toBe(0);
  });

  it("throws when dimensions differ, naming both", () => {
    const app = png(10, 10, () => [0, 0, 0, 255]);
    const mask = png(12, 10, () => [0, 0, 0, 255]);
    expect(() => compositeDiff(app, mask)).toThrow(/10×10.*12×10/);
  });

  it("blends a partial-alpha mask pixel arithmetically, not just short-circuiting on 0/255 (Minor 1)", () => {
    // app channel 0, mask channel 255, alpha 128 -> a = 128/255, so
    // mask*a + app*(1-a) = 255*(128/255) + 0 = 128 exactly: a clean value that
    // only comes out right if the interpolation itself is correct.
    const app = png(2, 2, () => [0, 0, 0, 255]);
    const mask = png(2, 2, () => [255, 255, 255, 128]);
    const out = compositeDiff(app, mask);
    const outPng = PNG.sync.read(out);
    expect([outPng.data[0], outPng.data[1], outPng.data[2], outPng.data[3]]).toEqual([
      128, 128, 128, 255,
    ]);
  });
});

describe("writeArtifacts", () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-report-"));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes exactly the expected file set, including a diff png only for rounds that carry buffers", async () => {
    const app = png(4, 4, () => [0, 0, 0, 255]);
    const mask = png(4, 4, () => [255, 0, 0, 255]);
    await writeArtifacts(dir, {
      slug: "roadmap",
      spec: { threshold: 0.5 },
      skeletonFindings: [],
      values: [],
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      rounds: [
        { percent: 4, skeletonPass: true, reason: "kolo 1" },
        { percent: 0.3, skeletonPass: true, reason: "kolo 2", appImage: app, maskImage: mask },
      ],
    });

    const entries = (await fs.readdir(dir)).sort();
    expect(entries).toEqual(
      [
        "skeleton.md",
        "values.md",
        "tokens.md",
        "components.md",
        "report.md",
        "spec.json",
        "round-1.json",
        "round-2.json",
        "round-2-diff.png",
      ].sort(),
    );

    const round1 = JSON.parse(await fs.readFile(path.join(dir, "round-1.json"), "utf8"));
    expect(round1).toEqual({ percent: 4, skeletonPass: true, reason: "kolo 1" });
    const round2 = JSON.parse(await fs.readFile(path.join(dir, "round-2.json"), "utf8"));
    expect(round2).toEqual({ percent: 0.3, skeletonPass: true, reason: "kolo 2" });

    const report = await fs.readFile(path.join(dir, "report.md"), "utf8");
    expect(report).toContain("HOTOVO");
  });

  it("skips spec.json when payload.spec is absent, without throwing", async () => {
    await writeArtifacts(dir, {
      slug: "roadmap",
      skeletonFindings: [],
      values: [],
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "continue", reason: "strop 5 kol vyčerpán" },
      rounds: [{ percent: 8, skeletonPass: true, reason: "kolo 1" }],
    });

    const entries = await fs.readdir(dir);
    expect(entries).not.toContain("spec.json");
    expect(entries).not.toContain("round-1-diff.png");
    expect(entries).toContain("round-1.json");
  });

  it("lists its own sibling files in report.md, excluding files this run never wrote", async () => {
    const app = png(4, 4, () => [0, 0, 0, 255]);
    const mask = png(4, 4, () => [255, 0, 0, 255]);
    await writeArtifacts(dir, {
      slug: "roadmap",
      skeletonFindings: [],
      values: [],
      tokenMappings: [],
      componentDecisions: [],
      masks: [],
      verdict: { stop: true, status: "done", reason: "ok" },
      rounds: [
        { percent: 0.3, skeletonPass: true, reason: "kolo 1", appImage: app, maskImage: mask },
      ],
    });

    const report = await fs.readFile(path.join(dir, "report.md"), "utf8");
    expect(report).toContain("`skeleton.md`");
    expect(report).toContain("`values.md`");
    expect(report).toContain("`tokens.md`");
    expect(report).toContain("`components.md`");
    expect(report).toContain("`round-1.json`");
    expect(report).toContain("`round-1-diff.png`");
    expect(report).not.toContain("spec.json");
  });

  it(
    "collects one round's composite failure without stopping the others, writes the complete " +
      "file set with the failure named in it, then rejects naming the affected round " +
      "(fix round 1, Important 1)",
    async () => {
      const goodApp = png(4, 4, () => [0, 0, 0, 255]);
      const goodMask = png(4, 4, () => [255, 0, 0, 255]);
      const badApp = png(4, 4, () => [0, 0, 0, 255]);
      const badMask = png(6, 4, () => [255, 0, 0, 255]);

      const attempt = writeArtifacts(dir, {
        slug: "roadmap",
        skeletonFindings: [],
        values: [],
        tokenMappings: [],
        componentDecisions: [],
        masks: [],
        verdict: { stop: true, status: "continue", reason: "diff obrázek chybí pro kolo 2" },
        rounds: [
          {
            percent: 0.3,
            skeletonPass: true,
            reason: "kolo 1",
            appImage: goodApp,
            maskImage: goodMask,
          },
          {
            percent: 4,
            skeletonPass: true,
            reason: "kolo 2",
            appImage: badApp,
            maskImage: badMask,
          },
        ],
      });

      await expect(attempt).rejects.toThrow(/kolo 2|round 2|2/);

      const entries = (await fs.readdir(dir)).sort();
      expect(entries).toEqual(
        [
          "skeleton.md",
          "values.md",
          "tokens.md",
          "components.md",
          "report.md",
          "round-1.json",
          "round-1-diff.png",
          "round-2.json",
        ].sort(),
      );
      expect(entries).not.toContain("round-2-diff.png");

      const round2 = JSON.parse(await fs.readFile(path.join(dir, "round-2.json"), "utf8"));
      expect(round2.diffImageError).toMatch(/4×4.*6×4/);

      const report = await fs.readFile(path.join(dir, "report.md"), "utf8");
      expect(report).toContain("kolo 2");
      expect(report).toMatch(/diff obrázek/i);
      expect(report).toContain("4×4");
      expect(report).toContain("6×4");
    },
  );

  it("the all-good path still writes exactly the file set it wrote before, and does not throw", async () => {
    const app = png(4, 4, () => [0, 0, 0, 255]);
    const mask = png(4, 4, () => [255, 0, 0, 255]);
    await expect(
      writeArtifacts(dir, {
        slug: "roadmap",
        skeletonFindings: [],
        values: [],
        tokenMappings: [],
        componentDecisions: [],
        masks: [],
        verdict: { stop: true, status: "done", reason: "ok" },
        rounds: [
          { percent: 4, skeletonPass: true, reason: "kolo 1" },
          { percent: 0.3, skeletonPass: true, reason: "kolo 2", appImage: app, maskImage: mask },
        ],
      }),
    ).resolves.toBeUndefined();

    const entries = (await fs.readdir(dir)).sort();
    expect(entries).toEqual(
      [
        "skeleton.md",
        "values.md",
        "tokens.md",
        "components.md",
        "report.md",
        "round-1.json",
        "round-2.json",
        "round-2-diff.png",
      ].sort(),
    );
  });
});
