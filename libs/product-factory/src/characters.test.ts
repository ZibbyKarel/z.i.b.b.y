import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { readJsonArtifact } from "./artifact.ts";
import { cast, castImage, characterBlock, sheetFile } from "./characters.ts";
import { FRONT_H, FRONT_W, coverLayout } from "./cover-layout.ts";
import type { Ctx } from "./ctx.ts";
import { cutOut } from "./image-proc.ts";
import { planCheck } from "./plan-check.ts";
import { produce } from "./produce.ts";
import { busyRatio } from "./qa/pixel.ts";
import { render } from "./render.ts";
import type { Plan } from "./schemas.ts";
import { fixture, tmpCtx } from "./testkit.ts";

vi.spyOn(console, "log").mockImplementation(() => undefined);
vi.spyOn(console, "error").mockImplementation(() => undefined);

const SPEC = "a round body, exactly 2 eyes, 3 buttons, 2 antennae with a ball on each tip";

function castPlan(): Plan {
  const p = readJsonArtifact(fixture("farm-4", "content-plan.md")) as Plan;
  p.characters = [{ id: "hero", label: "the round alien", spec: SPEC, counts: { eyes: 2 } }];
  p.pages = p.pages.map((pg) => ({ ...pg, characters: pg.pageNumber <= 2 ? ["hero"] : [] }));
  p.cover = {
    ...p.cover,
    characters: ["hero"],
    titlePalette: ["#ff6b9d", "#7ee081"],
    titleBuddies: [{ character: "hero", pose: "sits and waves", anchor: "on-top", at: 0.8 }],
  };
  return p;
}

async function prepared(plan = castPlan()): Promise<Ctx> {
  const ctx = tmpCtx();
  fs.writeFileSync(path.join(ctx.cwd, "plan.in.json"), JSON.stringify(plan));
  expect(await planCheck(["plan.in.json"], ctx)).toBe(0);
  return ctx;
}
const book = (ctx: Ctx, ...p: string[]): string => path.join(ctx.cwd, "book", ...p);
const jobs = fixture("farm-4", "jobs.json");

describe("cast", () => {
  it("draws one approved sheet per character and the title buddies, once", async () => {
    const ctx = await prepared();
    expect(await cast([], ctx)).toBe(0);
    expect(fs.readFileSync(path.join(ctx.cwd, "cast-report.md"), "utf8")).toContain(
      "<verdict>pass</verdict>",
    );
    expect(fs.existsSync(sheetFile(book(ctx), "hero"))).toBe(true);
    const buddy = await sharp(book(ctx, "cover-art", "buddy-1.png")).metadata();
    expect(buddy.hasAlpha).toBe(true);
    // Unchanged spec: nothing is redrawn.
    expect(await cast([], ctx)).toBe(0);
    expect(
      fs.readdirSync(book(ctx, "characters", "hero")).filter((f) => f.startsWith("attempt-")),
    ).toHaveLength(1);
  });

  it("supersedes a sheet whose spec changed", async () => {
    const ctx = await prepared();
    expect(await cast([], ctx)).toBe(0);
    const p = castPlan();
    p.characters[0]!.spec = `${SPEC}, a striped scarf`;
    fs.writeFileSync(book(ctx, "plan.json"), JSON.stringify(p));
    expect(await cast([], ctx)).toBe(0);
    expect(fs.readdirSync(book(ctx, "characters", "hero")).sort()).toEqual([
      "approved.png",
      "attempt-001.png",
      "attempt-002.png",
      "meta.json",
      "superseded-001.png",
    ]);
  });
});

describe("produce with recurring characters", () => {
  it("refuses to run before the cast is drawn", async () => {
    const ctx = await prepared();
    await expect(produce([jobs, "--rounds", "1"], ctx)).rejects.toThrow(/run product-factory cast/);
  });

  it("hands the cast image to every page and the cover that shows the character", async () => {
    const ctx = await prepared();
    expect(await cast([], ctx)).toBe(0);
    expect(await produce([jobs, "--rounds", "1"], ctx)).toBe(0);
    const meta = (f: string): { prompt: string; referenceImages?: string[] } =>
      JSON.parse(fs.readFileSync(f, "utf8"));
    const p1 = meta(book(ctx, "illustrations", "01", "01-meta.json"));
    expect(p1.referenceImages).toEqual([book(ctx, "characters", "cast-hero.png")]);
    expect(p1.prompt).toContain(characterBlock(castPlan().characters));
    expect(meta(book(ctx, "illustrations", "03", "03-meta.json")).referenceImages).toBeUndefined();
    expect(meta(book(ctx, "cover-art", "meta.json")).referenceImages).toHaveLength(1);

    expect(await render([], ctx)).toBe(0);
    const front = await sharp(book(ctx, "cover-front.png")).metadata();
    expect([front.width, front.height, front.hasAlpha]).toEqual([FRONT_W, FRONT_H, false]);
    const manifest = JSON.parse(fs.readFileSync(book(ctx, "render-manifest.json"), "utf8")) as {
      images: { file: string }[];
    };
    expect(manifest.images.at(-1)?.file).toBe(book(ctx, "cover-front.png"));
  });

  it("combines several sheets side by side into one reference", async () => {
    const ctx = tmpCtx();
    for (const id of ["a", "b"]) {
      fs.mkdirSync(path.join(ctx.cwd, "characters", id), { recursive: true });
      await sharp({ create: { width: 400, height: 800, channels: 3, background: "#000" } })
        .png()
        .toFile(sheetFile(ctx.cwd, id));
    }
    const m = await sharp(await castImage(ctx.cwd, ["a", "b"])).metadata();
    expect(m.width).toBeGreaterThan(m.height ?? 0);
  });
});

describe("cover layout", () => {
  it("keeps title, buddies and badges inside the front and apart", () => {
    const l = coverLayout(castPlan());
    const { titleZone: t, badgeZone: b, buddies } = l;
    expect(t.y).toBeGreaterThan(0);
    expect(t.x + t.w).toBeLessThanOrEqual(FRONT_W);
    expect(b && b.y > t.y + t.h).toBe(true);
    // The on-top buddy sits above the first title line and inside the title zone.
    expect(buddies[0]!.y).toBeGreaterThanOrEqual(t.y);
    expect(l.svg).toContain("<svg");
  });

  it("busyRatio: plain zone is calm, a striped one is busy", () => {
    const w = 100;
    const rgb = new Uint8Array(w * w * 3).fill(40);
    const box = { x: 0, y: 0, w, h: w };
    expect(busyRatio(rgb, w, box)).toBe(0);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++)
        if (x % 4 < 2) rgb.fill(250, (y * w + x) * 3, (y * w + x) * 3 + 3);
    expect(busyRatio(rgb, w, box)).toBeGreaterThan(0.15);
  });
});

describe("cutOut", () => {
  it("keeps a closed outlined shape, flags one touching the edge", async () => {
    const ctx = tmpCtx();
    const svg = (cx: number): Buffer =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><circle cx="${cx}" cy="100" r="50" fill="white" stroke="black" stroke-width="8"/></svg>`,
      );
    const src = path.join(ctx.cwd, "s.png");
    await sharp(svg(100)).png().toFile(src);
    const ok = await cutOut(src, path.join(ctx.cwd, "o.png"));
    // The white inside the closed outline survives the background fill.
    expect(ok.opaqueRatio).toBeGreaterThan(0.15);
    expect(ok.touchesEdge).toBe(false);
    await sharp(svg(10)).png().toFile(src);
    expect((await cutOut(src, path.join(ctx.cwd, "o.png"))).touchesEdge).toBe(true);
  });
});
