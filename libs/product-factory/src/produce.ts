import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { readJsonArtifact } from "./artifact.ts";
import sharp from "sharp";
import { castImage, characterBlock, pageCharacters } from "./characters.ts";
import { coverLayout } from "./cover-layout.ts";
import { appendCost, bookDirOf, envNum, nn, pageFile, readJson, writeJson } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";
import { COVER_H, COVER_W, processCover, processImage } from "./image-proc.ts";
import { createImageProvider, createVisionProvider } from "./providers/index.ts";
import { DEFAULT_THRESHOLDS, busyRatio, busyZoneQa, coverQa, pixelQa } from "./qa/pixel.ts";
import { JobsSchema, PlanSchema } from "./schemas.ts";
import type { Plan, QaIssue, QaResult } from "./schemas.ts";

/** One thing to illustrate: a coloring page, or the cover art (pageNumber 0). */
interface Unit {
  pageNumber: number;
  dir: string;
  prompt: string;
  seed?: number;
  referenceImages?: string[];
  subjects: string[];
  isCover: boolean;
  attempts: number;
  approved: boolean;
  judge: QaResult["judge"] | "-";
  issues: QaIssue[];
}

const hashSeed = (page: number, attempt: number): number =>
  (Math.imul(page + 1, 2654435761) ^ Math.imul(attempt, 40503)) >>> 0;
const attemptFiles = (dir: string, pageNumber: number): string[] => {
  const re = new RegExp(`^${pageFile(pageNumber, "attempt-")}\\d+\\.png$`);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)) : [];
};

function parseRange(s: string | undefined, max: number): Set<number> {
  const all = new Set(Array.from({ length: max }, (_, i) => i + 1));
  if (!s) return all;
  const m = /^(\d+)(?:-(\d+))?$/.exec(s);
  if (!m) throw new Error(`--pages expects "a-b" or "n", got "${s}"`);
  const a = Number(m[1]);
  const b = Number(m[2] ?? m[1]);
  return new Set([...all].filter((n) => n >= a && n <= b));
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export const thresholdsOf = (ctx: Ctx): typeof DEFAULT_THRESHOLDS => ({
  ...DEFAULT_THRESHOLDS,
  maxGray: envNum(ctx, "PF_MAX_GRAY", DEFAULT_THRESHOLDS.maxGray),
  minInk: envNum(ctx, "PF_MIN_INK", DEFAULT_THRESHOLDS.minInk),
  maxInk: envNum(ctx, "PF_MAX_INK", DEFAULT_THRESHOLDS.maxInk),
  maxMarginInk: envNum(ctx, "PF_MAX_MARGIN_INK", DEFAULT_THRESHOLDS.maxMarginInk),
  minColor: envNum(ctx, "PF_MIN_COLOR", DEFAULT_THRESHOLDS.minColor),
  maxWhite: envNum(ctx, "PF_MAX_WHITE", DEFAULT_THRESHOLDS.maxWhite),
});

/**
 * Recurring characters ride along as one reference image (their approved sheets side by side)
 * plus their spec appended to the prompt, so the model redraws the same character every time.
 */
async function withCharacters(
  book: string,
  plan: Plan,
  prompt: string,
  ids: string[],
): Promise<{ prompt: string; referenceImages?: string[] }> {
  if (ids.length === 0) return { prompt };
  return {
    prompt: `${prompt}. ${characterBlock(pageCharacters(plan, ids))}`,
    referenceImages: [await castImage(book, ids)],
  };
}

/** Portrait generation size for the cover (front-cover aspect, multiple of 16 for flux). */
const coverGenWidth = (size: number): number => Math.round((size * COVER_W) / COVER_H / 16) * 16;

export async function produce(argv: string[], ctx: Ctx): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      report: { type: "string", default: "produce-report.md" },
      rounds: { type: "string" },
      pages: { type: "string" },
    },
  });
  const jobsFile = positionals[0];
  if (!jobsFile)
    throw new Error(
      "usage: product-factory produce <jobs.json> [--report f] [--rounds N] [--pages a-b]",
    );
  const book = bookDirOf(ctx);
  const rounds = values.rounds ? Number(values.rounds) : envNum(ctx, "PF_ROUNDS", 3);
  const threshold = envNum(ctx, "PF_THRESHOLD", 160);
  const size = envNum(ctx, "PF_IMAGE_SIZE", 1024);
  const th = thresholdsOf(ctx);
  const maxBusy = envNum(ctx, "PF_MAX_BUSY", 0.15);

  const plan = PlanSchema.parse(readJson(path.join(book, "plan.json")));
  const jobs = JobsSchema.parse(readJsonArtifact(path.resolve(ctx.cwd, jobsFile)));
  writeJson(path.join(book, "jobs.json"), jobs);
  const image = createImageProvider(ctx.env);
  const vision = createVisionProvider(ctx.env);

  const wanted = parseRange(values.pages, plan.pages.length);
  const units: Unit[] = [];
  for (const page of plan.pages.filter((p) => wanted.has(p.pageNumber))) {
    const job = jobs.jobs.find((j) => j.pageNumber === page.pageNumber);
    if (!job) throw new Error(`jobs file has no job for page ${page.pageNumber}`);
    units.push({
      ...job,
      ...(await withCharacters(book, plan, job.prompt, page.characters)),
      subjects: page.subjects,
      dir: path.join(book, "illustrations", nn(page.pageNumber)),
      isCover: false,
      attempts: 0,
      approved: false,
      judge: "-",
      issues: [],
    });
  }
  if (jobs.cover && !values.pages)
    units.push({
      pageNumber: 0,
      ...jobs.cover,
      ...(await withCharacters(book, plan, jobs.cover.prompt, plan.cover.characters)),
      subjects: [],
      dir: path.join(book, "cover-art"),
      isCover: true,
      attempts: 0,
      approved: false,
      judge: "-",
      issues: [],
    });
  for (const u of units) {
    u.attempts = attemptFiles(u.dir, u.pageNumber).length;
    u.approved = fs.existsSync(path.join(u.dir, pageFile(u.pageNumber, "approved.png")));
    const qaFile = path.join(book, "qa", `${nn(u.pageNumber)}.json`);
    if (!u.isCover && u.approved && fs.existsSync(qaFile))
      u.judge = (readJson(qaFile) as QaResult).judge;
  }

  let generated = 0;
  let genMs = 0;
  let costUsd = 0;
  const tmp = path.join(book, ".tmp");
  for (let round = 1; round <= rounds; round++) {
    const todo = units.filter((u) => !u.approved);
    if (todo.length === 0) break;
    const items = todo.map((u) => {
      const attempt = u.attempts + 1;
      const seed = u.seed !== undefined ? u.seed + attempt - 1 : hashSeed(u.pageNumber, attempt);
      return {
        key: u.isCover ? "cover" : `p${nn(u.pageNumber)}`,
        prompt: u.prompt,
        seed,
        width: u.isCover ? coverGenWidth(size) : size,
        height: size,
        referenceImages: u.referenceImages,
        attempt,
      };
    });
    console.log(
      `produce: round ${round}/${rounds}: generating ${items.length} image(s): ${items.map((i) => i.key).join(", ")} [${image.id}/${image.model}]`,
    );
    const results = await image.generateBatch(items, tmp);
    await image.dispose?.();

    const judged: {
      u: Unit;
      qa: QaResult;
      file: string;
      durationMs: number;
      costUsd: number;
      seed: number;
      attempt: number;
    }[] = [];
    for (const [i, u] of todo.entries()) {
      const item = items[i];
      const res = results.find((r) => r.key === item?.key);
      if (!item || !res) throw new Error(`provider returned no image for ${item?.key}`);
      generated++;
      genMs += res.durationMs;
      costUsd += res.costUsd;
      appendCost(ctx, {
        source: "image",
        provider: image.id,
        model: image.model,
        costUsd: res.costUsd,
        durationMs: res.durationMs,
        ...(u.isCover ? {} : { page: u.pageNumber }),
      });

      fs.mkdirSync(u.dir, { recursive: true });
      const attempt = item.attempt;
      const file = path.join(
        u.dir,
        pageFile(u.pageNumber, `attempt-${String(attempt).padStart(3, "0")}.png`),
      );
      if (fs.existsSync(file)) throw new Error(`refusing to overwrite ${file}`);
      let pixel: QaResult["pixel"];
      let issues: QaIssue[];
      if (u.isCover) {
        const c = await processCover(res.file, file);
        // The renderer lays the title and badges over these zones: the art must stay calm there.
        const layout = coverLayout(plan);
        const rgb = new Uint8Array(await sharp(file).removeAlpha().raw().toBuffer());
        const topPct = Math.round(((layout.titleZone.y + layout.titleZone.h) / COVER_H) * 100);
        const zones = [
          { name: `title (top ${topPct}% of the cover)`, box: layout.titleZone },
          ...(layout.badgeZone
            ? [{ name: "badge (bottom-right corner)", box: layout.badgeZone }]
            : []),
        ].map((z) => ({ name: z.name, ratio: busyRatio(rgb, COVER_W, z.box) }));
        issues = [...coverQa(c.colorRatio, c.whiteRatio, th), ...busyZoneQa(zones, maxBusy)];
        pixel = { grayRatio: 0, inkRatio: 0, openRegions: 0, marginInk: 0, ...c };
      } else {
        const proc = await processImage(res.file, file, threshold, true);
        const px = pixelQa(proc.pixels, 2550, proc.rawGrayRatio, proc.box, th);
        issues = px.issues;
        pixel = {
          grayRatio: px.grayRatio,
          inkRatio: px.inkRatio,
          openRegions: px.openRegions,
          marginInk: px.marginInk,
        };
      }
      u.attempts = attempt;
      u.issues = issues;
      u.judge = "pixel";
      const qa: QaResult = {
        pageNumber: u.pageNumber,
        attempt,
        passed: issues.length === 0,
        pixel,
        issues,
        judge: "pixel",
      };
      judged.push({
        u,
        qa,
        file,
        durationMs: res.durationMs,
        costUsd: res.costUsd,
        seed: item.seed,
        attempt,
      });
    }

    if (vision) {
      const v = vision;
      await pool(
        judged.filter((j) => j.qa.passed && !j.u.isCover),
        envNum(ctx, "PF_CONCURRENCY", 1),
        async (j) => {
          const verdict = await v.judge({
            file: j.file,
            pageNumber: j.u.pageNumber,
            expectedSubjects: j.u.subjects,
            styleGuide: plan.styleGuide,
          });
          appendCost(ctx, {
            source: "vision",
            provider: v.id,
            model: v.model,
            costUsd: verdict.costUsd,
            durationMs: verdict.durationMs,
            page: j.u.pageNumber,
          });
          costUsd += verdict.costUsd;
          j.qa = { ...j.qa, passed: verdict.passed, issues: verdict.issues, judge: v.id };
          j.u.issues = verdict.issues;
          j.u.judge = v.id;
        },
      );
      await v.dispose?.();
    }

    for (const j of judged) {
      const key = j.u.isCover ? "cover" : `p${nn(j.u.pageNumber)}`;
      console.log(
        `produce: ${key} attempt ${j.attempt} ${j.qa.passed ? "approved" : `rejected: ${[...new Set(j.qa.issues.map((i) => i.type))].join(", ")}`}`,
      );
      writeJson(path.join(book, "qa", `${nn(j.u.pageNumber)}.json`), j.qa);
      if (!j.qa.passed) continue;
      fs.copyFileSync(j.file, path.join(j.u.dir, pageFile(j.u.pageNumber, "approved.png")));
      writeJson(path.join(j.u.dir, pageFile(j.u.pageNumber, "meta.json")), {
        provider: image.id,
        model: image.model,
        seed: j.seed,
        prompt: j.u.prompt,
        ...(j.u.referenceImages ? { referenceImages: j.u.referenceImages } : {}),
        attempt: j.attempt,
        durationMs: j.durationMs,
        costUsd: j.costUsd,
        qa: j.qa,
      });
      j.u.approved = true;
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  const blocked = units.filter((u) => !u.approved);
  const label = (u: Unit): string => (u.isCover ? "cover" : String(u.pageNumber));
  const report = [
    "# Produce report",
    "",
    "| Page | Attempts | Judge | Status |",
    "|---|---|---|---|",
    ...units.map(
      (u) =>
        `| ${label(u)} | ${u.attempts} | ${u.judge} | ${u.approved ? "approved" : "blocked"} |`,
    ),
    "",
    "## Approved images",
    "",
    ...units
      .filter((u) => u.approved)
      .map((u) => `- ${path.join(u.dir, pageFile(u.pageNumber, "approved.png"))}`),
    "",
    "## Blocked pages",
    "",
    ...(blocked.length === 0
      ? ["none"]
      : blocked.flatMap((u) => [
          `- page ${label(u)}:`,
          ...u.issues.map((i) => `  - [${i.severity}] ${i.type}: ${i.description}`),
        ])),
    "",
    `## Totals`,
    "",
    `- images generated: ${generated}`,
    `- generation seconds: ${(genMs / 1000).toFixed(1)}`,
    `- costUsd: ${costUsd.toFixed(4)}`,
    "",
    blocked.length === 0 ? "<verdict>pass</verdict>" : "<verdict>gap</verdict>",
    "",
  ].join("\n");
  fs.writeFileSync(path.resolve(ctx.cwd, values.report), report);
  console.log(
    `produce: ${units.length - blocked.length}/${units.length} approved, ${generated} generated`,
  );
  return blocked.length === 0 ? 0 : 2;
}
