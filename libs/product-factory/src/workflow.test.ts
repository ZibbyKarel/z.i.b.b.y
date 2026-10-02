import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { collectCosts } from "./finalize.ts";
import type { Ctx } from "./ctx.ts";
import { finalize } from "./finalize.ts";
import { planCheck } from "./plan-check.ts";
import { preflight } from "./preflight.ts";
import { produce } from "./produce.ts";
import { reject } from "./reject.ts";
import { coverSizeIn, render } from "./render.ts";
import { fixture, tmpCtx } from "./testkit.ts";

vi.spyOn(console, "log").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

async function prepared(env: NodeJS.ProcessEnv = {}): Promise<Ctx> {
  const ctx = tmpCtx(env);
  expect(await planCheck([fixture("farm-4", "content-plan.md")], ctx)).toBe(0);
  return ctx;
}
const jobs = fixture("farm-4", "jobs.json");
const read = (ctx: Ctx, ...p: string[]): string =>
  fs.readFileSync(path.join(ctx.cwd, ...p), "utf8");
const attempts = (ctx: Ctx, nn: string): string[] =>
  fs
    .readdirSync(path.join(ctx.cwd, "book", "illustrations", nn))
    .filter((f) => f.startsWith("attempt-"))
    .sort();

describe("produce", () => {
  it("approves all pages in one round with the mock provider", async () => {
    const ctx = await prepared();
    expect(await produce([jobs, "--rounds", "1"], ctx)).toBe(0);
    for (const n of ["01", "02", "03", "04"])
      expect(fs.existsSync(path.join(ctx.cwd, "book", "illustrations", n, "approved.png"))).toBe(
        true,
      );
    expect(fs.existsSync(path.join(ctx.cwd, "book", "cover-art", "approved.png"))).toBe(true);
    expect(read(ctx, "produce-report.md")).toContain("<verdict>pass</verdict>");
    const costs = read(ctx, "costs.jsonl")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { source: string; page?: number });
    expect(costs.filter((c) => c.source === "image" && c.page !== undefined)).toHaveLength(4);
    const meta = JSON.parse(read(ctx, "book", "illustrations", "01", "meta.json")) as {
      provider: string;
      attempt: number;
    };
    expect(meta).toMatchObject({ provider: "mock", attempt: 1 });
    const m = await sharp(
      path.join(ctx.cwd, "book", "illustrations", "01", "approved.png"),
    ).metadata();
    expect([m.width, m.height, m.hasAlpha]).toEqual([2550, 3300, false]);
  });

  it("retries a failing page in round 2 without overwriting attempt 1", async () => {
    const ctx = await prepared({ PF_MOCK_FAIL_PAGES: "2" });
    expect(await produce([jobs, "--rounds", "2"], ctx)).toBe(0);
    expect(attempts(ctx, "02")).toEqual(["attempt-001.png", "attempt-002.png"]);
    expect(attempts(ctx, "01")).toEqual(["attempt-001.png"]);
    expect(read(ctx, "produce-report.md")).toContain("<verdict>pass</verdict>");
  });

  it("exits 2 with a gap verdict when rounds run out", async () => {
    const ctx = await prepared({ PF_MOCK_FAIL_PAGES: "2" });
    expect(await produce([jobs, "--rounds", "1"], ctx)).toBe(2);
    const report = read(ctx, "produce-report.md");
    expect(report).toContain("<verdict>gap</verdict>");
    expect(report).toMatch(/page 2:\n  - \[high\] gray-area/);
  });
});

describe("render + preflight + finalize", () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await prepared();
    expect(await produce([jobs], ctx)).toBe(0);
  });

  it("renders a byte-identical, correctly sized book", async () => {
    expect(await render([], ctx)).toBe(0);
    const first = fs.readFileSync(path.join(ctx.cwd, "book", "interior.pdf"));
    const firstCover = fs.readFileSync(path.join(ctx.cwd, "book", "cover.pdf"));
    expect(await render([], ctx)).toBe(0);
    expect(fs.readFileSync(path.join(ctx.cwd, "book", "interior.pdf")).equals(first)).toBe(true);
    expect(fs.readFileSync(path.join(ctx.cwd, "book", "cover.pdf")).equals(firstCover)).toBe(true);

    const interior = await PDFDocument.load(first);
    expect(interior.getPageCount()).toBe(1 + 4 * 2);
    expect(interior.getPage(3).getSize()).toEqual({ width: 612, height: 792 });
    const { widthIn, heightIn } = coverSizeIn(9);
    const cs = (await PDFDocument.load(firstCover)).getPage(0).getSize();
    expect(cs.width / 72).toBeCloseTo(widthIn, 3);
    expect(cs.height / 72).toBeCloseTo(heightIn, 3);
    expect(widthIn).toBeCloseTo(17 + 9 * 0.002252 + 0.25, 6);
  });

  it("passes preflight (with the <24 pages warning), then fails on a low-DPI image", async () => {
    await render([], ctx);
    expect(await preflight([], ctx)).toBe(0);
    const pf = JSON.parse(read(ctx, "book", "preflight.json")) as {
      passed: boolean;
      warnings: string[];
    };
    expect(pf.passed).toBe(true);
    expect(pf.warnings.join()).toMatch(/KDP minimum is 24/);
    expect(read(ctx, "preflight.md")).toContain("<verdict>pass</verdict>");

    const target = path.join(ctx.cwd, "book", "illustrations", "03", "approved.png");
    const orig = fs.readFileSync(target);
    await sharp({ create: { width: 100, height: 100, channels: 3, background: "#fff" } })
      .png()
      .toFile(target);
    expect(await preflight([], ctx)).toBe(1);
    expect(read(ctx, "preflight.md")).toMatch(/DPI < 300/);
    fs.writeFileSync(target, orig);
  });

  it("finalizes with the summed cost and the book path", async () => {
    fs.mkdirSync(path.join(ctx.cwd, "stage2"));
    fs.writeFileSync(
      path.join(ctx.cwd, "stage2", "costs.jsonl"),
      JSON.stringify({
        at: "x",
        source: "vision",
        provider: "p",
        model: "m",
        costUsd: 0.5,
        durationMs: 1,
      }) + "\n",
    );
    fs.writeFileSync(path.join(ctx.cwd, "listing.md"), "# listing\n");
    expect(await finalize([path.join(ctx.cwd, "listing.md")], ctx)).toBe(0);
    expect(collectCosts(ctx.cwd).reduce((s, c) => s + c.costUsd, 0)).toBeCloseTo(0.5);
    expect(read(ctx, "book", "README.md")).toMatch(
      /total production cost: \$0\.5000[\s\S]*AI-generated/,
    );
    expect(read(ctx, "book.md")).toContain(path.join(ctx.cwd, "book"));
  });
});

describe("reject", () => {
  it("un-approves a page so the next produce regenerates only it", async () => {
    const ctx = await prepared();
    expect(await produce([jobs, "--rounds", "1"], ctx)).toBe(0);
    expect(await reject(["2", "--reason", "duplicate composition"], ctx)).toBe(0);
    const dir = path.join(ctx.cwd, "book", "illustrations", "02");
    expect(fs.existsSync(path.join(dir, "approved.png"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "rejected-001.png"))).toBe(true);
    expect(read(ctx, "book", "rejections.md")).toContain("duplicate composition");
    expect(await produce([jobs, "--rounds", "1"], ctx)).toBe(0);
    expect(attempts(ctx, "02")).toHaveLength(2);
    expect(attempts(ctx, "01")).toHaveLength(1);
  });
});
