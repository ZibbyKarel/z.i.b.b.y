import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { appendCost, bookDirOf, envNum, readJson, writeJson } from "./ctx.ts";
import type { Ctx } from "./ctx.ts";
import { createImageProvider, createVisionProvider } from "./providers/index.ts";
import { cutOut } from "./image-proc.ts";
import { grayRatioOf, pixelQa } from "./qa/pixel.ts";
import { thresholdsOf } from "./produce.ts";
import { PlanSchema } from "./schemas.ts";
import type { Character, Plan, QaIssue } from "./schemas.ts";

/**
 * Recurring characters are drawn ONCE, as a reference sheet, before any page. Every page
 * (and the cover) that shows them gets the sheets as its reference image, so the model
 * edits the same character into a new scene instead of re-inventing it from text.
 */

export const charDir = (book: string, id: string): string => path.join(book, "characters", id);
export const sheetFile = (book: string, id: string): string =>
  path.join(charDir(book, id), "approved.png");

export const sheetPrompt = (c: Character): string =>
  `children's coloring page, character reference sheet: exactly one character, full body, front view, standing in a calm neutral pose with arms slightly away from the body, centered, nothing else in the image, no background objects. ${c.spec}`;

/** Appended to a page or cover prompt: who is in the reference image and what must not change. */
export function characterBlock(chars: Character[]): string {
  if (chars.length === 0) return "";
  const who = chars.map((c, i) => `${i + 1}) ${c.label}: ${c.spec}`).join(" ");
  return `Recurring characters, drawn exactly as in the reference image (left to right): ${who} Keep every shape, every count and every piece of clothing of each character exactly as in the reference image; only the pose and the scene change.`;
}

const charsOf = (plan: Plan, ids: string[]): Character[] =>
  ids.map((id) => {
    const c = plan.characters.find((x) => x.id === id);
    if (!c) throw new Error(`unknown character "${id}"`);
    return c;
  });

export const pageCharacters = (plan: Plan, ids: string[]): Character[] => charsOf(plan, ids);

/**
 * One reference image holding every sheet side by side (left to right in `ids` order).
 * A single combined reference keeps FLUX.2 klein 4B from mixing two characters up and
 * is ~4x faster than one reference per character (bench 2026-10-27).
 */
export async function castImage(book: string, ids: string[]): Promise<string> {
  const out = path.join(book, "characters", `cast-${ids.join("+")}.png`);
  const sources = ids.map((id) => sheetFile(book, id));
  const missing = sources.filter((f) => !fs.existsSync(f));
  if (missing.length > 0)
    throw new Error(
      `no approved character sheet: ${missing.join(", ")} (run product-factory cast)`,
    );
  const newest = Math.max(...sources.map((f) => fs.statSync(f).mtimeMs));
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= newest) return out;
  const H = 900;
  const parts = await Promise.all(
    sources.map(async (f) => {
      const buf = await sharp(f).trim({ threshold: 20 }).resize({ height: H }).png().toBuffer();
      return { buf, w: (await sharp(buf).metadata()).width ?? H };
    }),
  );
  const gap = 80;
  const width = parts.reduce((n, p) => n + p.w, 0) + gap * (parts.length + 1);
  let x = gap;
  const composite = parts.map((p) => {
    const at = { input: p.buf, left: x, top: 62 };
    x += p.w + gap;
    return at;
  });
  await sharp({ create: { width, height: H + 124, channels: 3, background: "#ffffff" } })
    .composite(composite)
    .png()
    .toFile(out);
  return out;
}

interface SheetMeta {
  spec: string;
  seed: number;
  attempt: number;
  prompt: string;
  provider: string;
  model: string;
  issues: QaIssue[];
}

const hashSeed = (s: string, attempt: number): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h ^ Math.imul(attempt, 40503)) >>> 0;
};

const numbered = (dir: string, prefix: string): string => {
  let i = 1;
  while (fs.existsSync(path.join(dir, `${prefix}-${String(i).padStart(3, "0")}.png`))) i++;
  return path.join(dir, `${prefix}-${String(i).padStart(3, "0")}.png`);
};

/** `product-factory cast`: draw and QA one reference sheet per plan character. */
export async function cast(argv: string[], ctx: Ctx): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      report: { type: "string", default: "cast-report.md" },
      rounds: { type: "string" },
    },
  });
  const book = bookDirOf(ctx);
  const plan = PlanSchema.parse(readJson(path.join(book, "plan.json")));
  const rounds = values.rounds ? Number(values.rounds) : envNum(ctx, "PF_ROUNDS", 3);
  const threshold = envNum(ctx, "PF_THRESHOLD", 160);
  const th = thresholdsOf(ctx);

  // A sheet drawn from an older spec (the concept changed) is superseded, never reused.
  const todo = new Map<string, { c: Character; attempts: number; issues: QaIssue[] }>();
  for (const c of plan.characters) {
    const dir = charDir(book, c.id);
    const approved = sheetFile(book, c.id);
    const metaFile = path.join(dir, "meta.json");
    if (fs.existsSync(approved)) {
      const meta = fs.existsSync(metaFile) ? (readJson(metaFile) as SheetMeta) : undefined;
      if (meta?.spec === c.spec) continue;
      fs.renameSync(approved, numbered(dir, "superseded"));
    }
    const attempts = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => /^attempt-\d+\.png$/.test(f)).length
      : 0;
    todo.set(c.id, { c, attempts, issues: [] });
  }

  let costUsd = 0;
  if (todo.size > 0) {
    const image = createImageProvider(ctx.env);
    const vision = createVisionProvider(ctx.env);
    const tmp = path.join(book, ".tmp-cast");
    for (let round = 1; round <= rounds; round++) {
      const open = [...todo.values()].filter((t) => !fs.existsSync(sheetFile(book, t.c.id)));
      if (open.length === 0) break;
      const items = open.map((t) => ({
        key: `char-${t.c.id}`,
        prompt: sheetPrompt(t.c),
        seed: hashSeed(t.c.id, t.attempts + 1),
        width: 1024,
        height: 1024,
        attempt: t.attempts + 1,
      }));
      const results = await image.generateBatch(items, tmp);
      await image.dispose?.();
      const judged: { t: (typeof open)[number]; file: string; seed: number; issues: QaIssue[] }[] =
        [];
      for (const [i, t] of open.entries()) {
        const item = items[i];
        const res = results.find((r) => r.key === item?.key);
        if (!item || !res) throw new Error(`provider returned no image for ${item?.key}`);
        costUsd += res.costUsd;
        appendCost(ctx, {
          source: "image",
          provider: image.id,
          model: image.model,
          costUsd: res.costUsd,
          durationMs: res.durationMs,
        });
        const dir = charDir(book, t.c.id);
        fs.mkdirSync(dir, { recursive: true });
        t.attempts = item.attempt;
        const file = path.join(dir, `attempt-${String(t.attempts).padStart(3, "0")}.png`);
        const gray = sharp(res.file).flatten({ background: "#ffffff" }).greyscale();
        const raw = await gray.clone().raw().toBuffer({ resolveWithObject: true });
        const bw = await gray
          .clone()
          .threshold(threshold)
          .raw()
          .toBuffer({ resolveWithObject: true });
        await sharp(bw.data, { raw: { width: bw.info.width, height: bw.info.height, channels: 1 } })
          .png()
          .toFile(file);
        const px = pixelQa(
          new Uint8Array(bw.data),
          bw.info.width,
          grayRatioOf(new Uint8Array(raw.data)),
          null,
          th,
        );
        judged.push({ t, file, seed: item.seed, issues: px.issues });
      }
      for (const j of judged) {
        if (vision && j.issues.length === 0) {
          const v = await vision.judge({
            file: j.file,
            pageNumber: 0,
            expectedSubjects: [j.t.c.label],
            styleGuide: plan.styleGuide,
            characterSpec: j.t.c.spec,
            characterCounts: j.t.c.counts,
          });
          costUsd += v.costUsd;
          appendCost(ctx, {
            source: "vision",
            provider: vision.id,
            model: vision.model,
            costUsd: v.costUsd,
            durationMs: v.durationMs,
          });
          j.issues = v.issues;
        }
        j.t.issues = j.issues;
        if (j.issues.length > 0) continue;
        const dir = charDir(book, j.t.c.id);
        fs.copyFileSync(j.file, sheetFile(book, j.t.c.id));
        const meta: SheetMeta = {
          spec: j.t.c.spec,
          seed: j.seed,
          attempt: j.t.attempts,
          prompt: sheetPrompt(j.t.c),
          provider: image.id,
          model: image.model,
          issues: [],
        };
        writeJson(path.join(dir, "meta.json"), meta);
      }
      await vision?.dispose?.();
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  costUsd += await drawBuddies(ctx, book, plan, rounds);
  const buddyMissing = plan.cover.titleBuddies
    .map((b, i) => ({ b, file: buddyFile(book, i + 1) }))
    .filter((x) => !fs.existsSync(x.file));
  const blocked = [...todo.values()].filter((t) => !fs.existsSync(sheetFile(book, t.c.id)));
  const report = [
    "# Cast report",
    "",
    `Plan: ${path.join(book, "plan.json")}`,
    "",
    plan.characters.length === 0
      ? "No recurring characters in the plan."
      : "| Character | Label | Sheet |\n|---|---|---|\n" +
        plan.characters
          .map((c) => {
            const ok = fs.existsSync(sheetFile(book, c.id));
            return `| ${c.id} | ${c.label} | ${ok ? sheetFile(book, c.id) : "blocked"} |`;
          })
          .join("\n"),
    "",
    "## Blocked characters",
    "",
    ...(blocked.length === 0
      ? ["none"]
      : blocked.flatMap((t) => [
          `- ${t.c.id} (${t.attempts} attempts) — simplify or fix its spec in the plan:`,
          ...t.issues.map((i) => `  - [${i.severity}] ${i.type}: ${i.description}`),
        ])),
    "",
    "## Title buddies",
    "",
    ...(plan.cover.titleBuddies.length === 0
      ? ["none"]
      : plan.cover.titleBuddies.map((b, i) => {
          const f = buddyFile(book, i + 1);
          return `- ${i + 1}. ${b.character} ${b.anchor}: ${fs.existsSync(f) ? f : "blocked (simplify the pose)"}`;
        })),
    "",
    `- costUsd: ${costUsd.toFixed(4)}`,
    "",
    blocked.length === 0 && buddyMissing.length === 0
      ? "<verdict>pass</verdict>"
      : "<verdict>gap</verdict>",
    "",
  ].join("\n");
  fs.writeFileSync(path.resolve(ctx.cwd, values.report), report);
  // The log tail is the retry handoff for the plan phase: name what failed.
  for (const t of blocked)
    console.error(
      `- character ${t.c.id}: ${t.issues.map((i) => `${i.type}: ${i.description}`).join("; ") || "no approved sheet"}`,
    );
  for (const m of buddyMissing)
    console.error(
      `- title buddy ${m.b.character} (${m.b.anchor}): no clean sticker, simplify the pose`,
    );
  console.log(
    `cast: ${plan.characters.length - blocked.length}/${plan.characters.length} character sheets approved`,
  );
  return blocked.length === 0 && buddyMissing.length === 0 ? 0 : 2;
}

export const buddyFile = (book: string, n: number): string =>
  path.join(book, "cover-art", `buddy-${n}.png`);

const buddyPrompt = (c: Character, pose: string): string =>
  `exactly one character, the same character as in the reference image, in full colour: ${pose}. Full body, whole character inside the frame with white space all around. ${c.spec}`;

/**
 * Title buddies: the character, redrawn from its sheet in colour and in the plan's pose, cut out
 * of its white background so the renderer can sit it on (or hang it from) the title letters.
 */
async function drawBuddies(ctx: Ctx, book: string, plan: Plan, rounds: number): Promise<number> {
  const open = plan.cover.titleBuddies
    .map((b, i) => ({ b, n: i + 1, c: plan.characters.find((c) => c.id === b.character) }))
    .filter((x) => x.c && fs.existsSync(sheetFile(book, x.b.character)));
  const metaOf = (n: number): string => path.join(book, "cover-art", `buddy-${n}.json`);
  const todo = open.filter((x) => {
    if (!fs.existsSync(buddyFile(book, x.n))) return true;
    const m = fs.existsSync(metaOf(x.n)) ? (readJson(metaOf(x.n)) as { prompt?: string }) : {};
    return x.c && m.prompt !== buddyPrompt(x.c, x.b.pose);
  });
  if (todo.length === 0) return 0;
  for (const x of todo) fs.rmSync(buddyFile(book, x.n), { force: true });
  const image = createImageProvider(ctx.env);
  const tmp = path.join(book, ".tmp-buddies");
  let costUsd = 0;
  for (let attempt = 1; attempt <= rounds; attempt++) {
    const left = todo.filter((x) => !fs.existsSync(buddyFile(book, x.n)));
    if (left.length === 0) break;
    const items = left.map((x) => ({
      key: `buddy-${x.n}`,
      prompt: buddyPrompt(x.c as Character, x.b.pose),
      seed: hashSeed(`buddy-${x.n}`, attempt),
      width: 1024,
      height: 1024,
      referenceImages: [sheetFile(book, x.b.character)],
      attempt,
    }));
    const results = await image.generateBatch(items, tmp);
    await image.dispose?.();
    for (const [i, x] of left.entries()) {
      const item = items[i];
      const res = results.find((r) => r.key === item?.key);
      if (!item || !res) throw new Error(`provider returned no image for ${item?.key}`);
      costUsd += res.costUsd;
      appendCost(ctx, {
        source: "image",
        provider: image.id,
        model: image.model,
        costUsd: res.costUsd,
        durationMs: res.durationMs,
      });
      const out = path.join(
        book,
        "cover-art",
        `buddy-${x.n}-attempt-${String(attempt).padStart(3, "0")}.png`,
      );
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const cut = await cutOut(res.file, out);
      // ponytail: a gap in the outline lets the fill eat the character; the 5% floor catches the
      // total leaks only. Add vision QA of the sticker when partial leaks show up on covers.
      if (cut.touchesEdge || cut.opaqueRatio < 0.05) continue;
      fs.copyFileSync(out, buddyFile(book, x.n));
      writeJson(metaOf(x.n), { prompt: item.prompt, seed: item.seed, attempt, ...cut });
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return costUsd;
}
