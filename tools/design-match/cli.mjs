#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { withPage } from "./browser.mjs";
import { ensureCdnCache } from "./cdn-cache.mjs";
import { compareSkeletons } from "./compare-skeleton.mjs";
import { compareValues } from "./compare-values.mjs";
import { extractRaw, extractValues } from "./extract.mjs";
import { collectRegions, cropRegions, formatInventory, rankCandidates } from "./inventory.mjs";
import { decideNext, evaluateRound } from "./loop.mjs";
import { normalizeSkeleton } from "./normalize.mjs";
import { diffPngs } from "./pixels.mjs";
import { writeArtifacts } from "./report.mjs";
import { resolveScene, shootScene } from "./shoot.mjs";

const ARTIFACT_ROOT = ".design-match";
const ROUNDS_FILE = "rounds.json";

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * A value-taking flag with nothing after it (e.g. `--mask` as the last argv
 * token) must fail right here, naming the flag — not three calls later as
 * `page.locator(undefined)` or a `path.join(dir, undefined)` TypeError with no
 * clue which flag caused it.
 */
function takeFlagValue(rest, index, flagName) {
  const value = rest[index + 1];
  if (value === undefined) {
    throw new Error(`design-match: příznak "${flagName}" vyžaduje hodnotu`);
  }
  return value;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "measure" && command !== "compare") {
    throw new Error(`design-match: neznámý příkaz "${command}" — použij measure nebo compare`);
  }
  const positional = [];
  const flags = { masks: [], strictWrappers: false, reset: false };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--strict-wrappers") {
      flags.strictWrappers = true;
    } else if (arg === "--reset") {
      flags.reset = true;
    } else if (arg === "--mask") {
      flags.masks.push(takeFlagValue(rest, i, "--mask"));
      i += 1;
    } else if (arg === "--slug") {
      flags.slug = takeFlagValue(rest, i, "--slug");
      i += 1;
    } else if (arg === "--story") {
      flags.story = takeFlagValue(rest, i, "--story");
      i += 1;
    } else if (arg === "--route") {
      flags.route = takeFlagValue(rest, i, "--route");
      i += 1;
    } else if (arg === "--selector") {
      flags.selector = takeFlagValue(rest, i, "--selector");
      i += 1;
    } else if (arg === "--region") {
      flags.region = takeFlagValue(rest, i, "--region");
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  const [design, description] = positional;

  if (command === "measure" && (!design || !description)) {
    throw new Error(
      'design-match: measure vyžaduje cestu k design souboru a popis — measure <design.html> "<popis>"',
    );
  }
  if (command === "compare" && !flags.slug) {
    throw new Error("design-match: compare vyžaduje --slug <slug>");
  }

  return {
    command,
    design,
    description,
    slug: flags.slug ?? (description ? slugify(description) : undefined),
    story: flags.story,
    route: flags.route,
    selector: flags.selector,
    masks: flags.masks,
    strictWrappers: flags.strictWrappers,
    region: flags.region !== undefined ? Number(flags.region) : 1,
    reset: flags.reset,
  };
}

/** 1-based `--region` → 0-based index, validated against the actual candidate count. */
export function resolveRegionIndex(region, candidateCount) {
  if (!(region >= 1 && region <= candidateCount)) {
    throw new Error(
      `design-match: region ${region} neexistuje — platný rozsah je 1–${candidateCount}`,
    );
  }
  return region - 1;
}

/**
 * `rounds.json`'s content, or `undefined`/`null` when it couldn't be read at
 * all. Either a missing file or a body that isn't the JSON array we wrote
 * must start an empty history rather than throwing — a corrupt or absent
 * history file is not a reason to refuse to run.
 */
export function historyFromRaw(raw) {
  if (raw === undefined || raw === null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed : [];
}

/** The shape persisted to `rounds.json` and replayed into `decideNext`/`writeArtifacts` history — never the buffers. */
export function stripImages(round) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude them from `rest`
  const { appImage, maskImage, ...rest } = round;
  return rest;
}

/**
 * `renderReport` keys HOTOVO/PARK off the final round's own `RoundVerdict.status`
 * (evaluateRound), not off `decideNext`'s `stop` flag — `stop` only means the loop
 * halted, which is equally true whether it halted because the match succeeded or
 * because it gave up. A done round always reports done and never stops for a
 * decideNext reason (there's nothing left to keep going for); any other round
 * carries decideNext's stop/reason straight through.
 */
export function combineVerdict(roundVerdict, next) {
  if (roundVerdict.status === "done") {
    return { status: "done", stop: false, reason: roundVerdict.reason };
  }
  return { status: roundVerdict.status, stop: next.stop, reason: next.reason };
}

/**
 * One exit code cannot express three outcomes, so the driving agent gets three:
 *   0 — done: a match was found, stop calling compare.
 *   1 — continue: no match yet, but the loop has not given up — run compare again.
 *   2 — parked: decideNext stopped the loop (thrash, skeleton gate, round ceiling)
 *       without ever reaching done — stop calling compare and escalate to a human.
 */
export function selectExitCode(verdict) {
  if (verdict.status === "done") return 0;
  if (verdict.stop) return 2;
  return 1;
}

async function loadHistory(dir, reset) {
  if (reset) return [];
  let raw;
  try {
    raw = await fs.readFile(path.join(dir, ROUNDS_FILE), "utf8");
  } catch {
    return [];
  }
  return historyFromRaw(raw);
}

async function runMeasure(cmd) {
  const dir = path.join(ARTIFACT_ROOT, cmd.slug);
  const { localHtmlPath } = await ensureCdnCache(
    cmd.design,
    path.join(ARTIFACT_ROOT, ".cdn-cache"),
  );

  const spec = await withPage(async (page) => {
    await page.goto(pathToFileURL(localHtmlPath).href, { waitUntil: "networkidle" });
    // `page.evaluate(() => document.fonts.ready)` doesn't throw, but a
    // FontFaceSet isn't a plain object — Playwright silently coerces the
    // returned value to `{}` crossing the protocol boundary, discarding the
    // wait's actual effect. Awaiting inside the page and returning nothing
    // gets the wait without the pointless (and misleading) serialization.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const ranked = rankCandidates(await collectRegions(page), cmd.description);
    await fs.mkdir(dir, { recursive: true });
    await cropRegions(page, ranked, dir);
    console.log(formatInventory(ranked));

    const regionIndex = resolveRegionIndex(cmd.region, ranked.length);
    const chosen = ranked[regionIndex];
    console.log(
      `Vybrán region [${cmd.region}]: ${chosen.selector} — pokud je špatně, spusť znovu s --region <n>.`,
    );

    // design.png is written here and nowhere else — `compare` reads it every round.
    await page
      .locator(chosen.selector)
      .first()
      .screenshot({ path: path.join(dir, "design.png") });
    return {
      selector: chosen.selector,
      skeleton: normalizeSkeleton(await extractRaw(page, chosen.selector), {
        strictWrappers: cmd.strictWrappers,
      }),
      values: await extractValues(page, chosen.selector),
    };
  });

  await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec, null, 2), "utf8");
  console.log(`spec.json zapsán → ${path.join(dir, "spec.json")}`);
}

async function runCompare(cmd) {
  const dir = path.join(ARTIFACT_ROOT, cmd.slug);
  const spec = JSON.parse(await fs.readFile(path.join(dir, "spec.json"), "utf8"));
  const scene = resolveScene({ ...cmd, selector: cmd.selector ?? spec.selector });
  const history = await loadHistory(dir, cmd.reset);

  const result = await withPage(async (page) => {
    await page.goto(scene.url, { waitUntil: "networkidle" });
    const appSkeleton = normalizeSkeleton(await extractRaw(page, scene.selector), {
      strictWrappers: cmd.strictWrappers,
    });
    const skeleton = compareSkeletons(spec.skeleton, appSkeleton);
    if (!skeleton.pass) return { skeleton, values: null, pixels: null };

    const values = compareValues(spec.values, await extractValues(page, scene.selector));
    const appImage = await shootScene(page, scene, path.join(dir, "app.png"));
    const designPng = await fs.readFile(path.join(dir, "design.png"));
    return { skeleton, values, pixels: diffPngs(designPng, appImage), appImage };
  });

  const roundVerdict = evaluateRound(result);
  // Only this invocation's round carries image buffers — replayed history
  // rounds (read back from rounds.json) never do, they were stripped before
  // being persisted.
  const currentRound = {
    percent: result.pixels ? result.pixels.percent : null,
    skeletonPass: result.skeleton.pass,
    reason: roundVerdict.reason,
    ...(result.pixels ? { appImage: result.appImage, maskImage: result.pixels.diffBuffer } : {}),
  };
  const currentRoundCore = stripImages(currentRound);
  const fullHistory = [...history, currentRoundCore];

  const next = decideNext([], fullHistory);
  const verdict = combineVerdict(roundVerdict, next);

  await fs.writeFile(path.join(dir, ROUNDS_FILE), JSON.stringify(fullHistory, null, 2), "utf8");

  await writeArtifacts(dir, {
    slug: cmd.slug,
    spec,
    rounds: [...history, currentRound],
    verdict,
    masks: scene.masks,
    skeletonFindings: result.skeleton.findings,
    values: result.values ?? [],
    tokenMappings: [],
    componentDecisions: [],
  });

  const label = verdict.status === "done" ? "HOTOVO" : verdict.stop ? "PARK" : "POKRAČUJ";
  console.log(`${label} — ${verdict.reason}`);
  process.exitCode = selectExitCode(verdict);
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  const cmd = parseArgs(process.argv.slice(2));
  const run = cmd.command === "measure" ? runMeasure : runCompare;
  run(cmd).catch((error) => {
    console.error(`[design-match] ${error.message}`);
    process.exitCode = 1;
  });
}
