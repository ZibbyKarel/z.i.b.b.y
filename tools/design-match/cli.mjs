#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { withPage } from "./browser.mjs";
import { ensureCdnCache } from "./cdn-cache.mjs";
import { compareSkeletons } from "./compare-skeleton.mjs";
import { compareValues } from "./compare-values.mjs";
import { extractRaw } from "./extract.mjs";
import { collectRegions, cropRegions, formatInventory, rankCandidates } from "./inventory.mjs";
import { decideNext, evaluateRound } from "./loop.mjs";
import { childPath, normalizeSkeleton, rootPath } from "./normalize.mjs";
import { diffPngs } from "./pixels.mjs";
import { fontPreflight } from "./preflight.mjs";
import { writeArtifacts } from "./report.mjs";
import { resolveScene, shootScene } from "./shoot.mjs";
import { TOKEN_PROPS, mapValue, parseThemeTokens, proposeTokenName } from "./tokens.mjs";
import { DESIGN_MATCH_VERSION } from "./version.mjs";

const DEFAULT_THEME_PATH = "libs/design-system/src/theme/globals.css";

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
    } else if (arg === "--theme") {
      flags.theme = takeFlagValue(rest, i, "--theme");
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
    theme: flags.theme ?? DEFAULT_THEME_PATH,
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
 * The skeleton flattened to the `path → props` map Task 12b's two consumers
 * (`buildTokenMappings`, `collectFontStacks`) were written against. Values live
 * on the skeleton nodes now — there is no second walk producing a flat map —
 * but "every node's values, keyed by path" is still the right input for two
 * functions that only ever collect across the whole tree and never pair two
 * trees against each other. Pairing is `compareValues`' job, and it does it in
 * lockstep on the trees themselves, which is why nothing here can go missing.
 *
 * The keys are the skeleton's own paths, so a `--zt-text-heading` proposed in
 * `tokens.md` names a node the reader can find in `skeleton.md`.
 */
export function flattenValues(skeleton) {
  const flat = {};
  const walk = (node, nodePath) => {
    flat[nodePath] = node.values;
    node.children.forEach((child, index) => walk(child, childPath(nodePath, child, index)));
  };
  walk(skeleton, rootPath(skeleton));
  return flat;
}

/** The leaf role at the end of a values path, with any `[n]` index stripped. */
function leafRole(valuesPath) {
  return valuesPath
    .split("/")
    .at(-1)
    .replace(/\[\d+\]$/, "");
}

/**
 * Which existing-theme name family (the CSS custom-property prefix Tailwind
 * v4's `@theme` block declares under) each `TOKEN_PROPS` prop is allowed to
 * match against. This is NOT `PROP_PREFIX` — that names the *new* `--zt-`
 * token this module proposes; this is the *real* theme's own naming,
 * required so `mapValue`'s plain nearest-distance ranking never picks a
 * same-length token from the wrong family (a `--text-sm` at 12px is not a
 * candidate for a `gap: 12px`, no matter how close the number).
 *
 * Confirmed against `libs/design-system/src/theme/globals.css`: --color-,
 * --text-, --radius-, --shadow-, --tracking-, --spacing- all exist there.
 * There is no --leading-* family — so `lineHeight` always filters down to an
 * empty candidate list. That is the correct, honest outcome (an empty list is
 * passed straight through, never a fallback to the unfiltered list), not a
 * bug to special-case around.
 */
const PROP_THEME_FAMILY = {
  color: "--color-",
  backgroundColor: "--color-",
  borderColor: "--color-",
  gap: "--spacing-",
  rowGap: "--spacing-",
  columnGap: "--spacing-",
  paddingTop: "--spacing-",
  paddingLeft: "--spacing-",
  borderRadius: "--radius-",
  boxShadow: "--shadow-",
  fontSize: "--text-",
  lineHeight: "--leading-",
  letterSpacing: "--tracking-",
};

/**
 * Every tokenisable value measured off the **design** mockup
 * (`flattenValues(spec.skeleton)`, from `runMeasure`), mapped against the **app's** design-system theme
 * (parsed from the CSS `--theme` points at) — this is what fills
 * `tokens.md`: which of the design's values already have a home in the app's
 * palette, and which need a new one. Deduplicated by `prop` + `value` (the
 * same colour on forty nodes is one row, not forty) and sorted by `prop`
 * then `value` so two runs of the same design produce a diff-stable table.
 */
export function buildTokenMappings(values, tokens) {
  const byKey = new Map();
  for (const [valuesPath, props] of Object.entries(values)) {
    for (const prop of TOKEN_PROPS) {
      if (!(prop in props)) continue;
      const value = props[prop];
      const key = `${prop}::${value}`;
      if (byKey.has(key)) continue;
      const family = PROP_THEME_FAMILY[prop];
      const familyTokens = tokens.filter((token) => token.name.startsWith(family));
      const mapping = mapValue(value, familyTokens);
      const finalMapping =
        mapping.kind === "new"
          ? { ...mapping, proposedName: proposeTokenName(leafRole(valuesPath), prop) }
          : mapping;
      byKey.set(key, { value, prop, path: valuesPath, mapping: finalMapping });
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.prop !== b.prop) return a.prop < b.prop ? -1 : 1;
    return a.value < b.value ? -1 : 1;
  });
}

/**
 * Every distinct font family referenced across the tree, in first-seen order —
 * `fontPreflight`'s input. It does its own quote-stripping and case-folding, so
 * this stays a plain split+trim+dedupe.
 */
export function collectFontStacks(values) {
  const families = new Set();
  for (const props of Object.values(values)) {
    const stack = props.fontFamily;
    if (!stack) continue;
    for (const family of stack.split(",")) {
      const trimmed = family.trim();
      if (trimmed) families.add(trimmed);
    }
  }
  return [...families];
}

/**
 * The exact `(designValues, appValues) → preflight result` step `runCompare`
 * runs once the skeleton gate passes. Pulled out of `runCompare` (which is
 * browser-driven and untestable here) so a test can prove `fontPreflight`
 * receives the arrays `collectFontStacks` produces — not the raw values maps,
 * not a raw `font-family` string — which is exactly the mistake the brief
 * warned about and nothing closed off before this.
 */
export function checkFontPreflight(designValues, appValues) {
  return fontPreflight(collectFontStacks(designValues), collectFontStacks(appValues));
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
  // "parked" is a round that has already decided to stop for a reason
  // decideNext has no way to know about (e.g. a font mismatch: decideNext
  // only reasons about the history of pixel percentages). Like "done", its
  // own reason wins outright — consulting `next` at all would let a
  // percentage-shaped answer ("pokračuje") paper over a cause no further
  // round can fix.
  if (roundVerdict.status === "parked") {
    return { status: "parked", stop: true, reason: roundVerdict.reason };
  }
  return { status: roundVerdict.status, stop: next.stop, reason: next.reason };
}

/**
 * One exit code cannot express four outcomes, so the driving agent gets four —
 * looked up here from a single table so the exit code and the console label
 * (`describeOutcome`) can never drift apart as two separately maintained
 * copies of the same branch:
 *   0 — done: a match was found, stop calling compare.
 *   1 — continue: no match yet, but the loop has not given up — run compare again.
 *   2 — parked: decideNext stopped the loop (thrash, skeleton gate, round ceiling)
 *       without ever reaching done — stop calling compare and escalate to a human.
 *   3 — error: compare (or measure) itself failed — a bad invocation, a missing
 *       spec.json, a browser that wouldn't launch, a failed write. This must
 *       never collapse into 1 ("continue") — the driving agent has to be able
 *       to tell "make another round" from "the tool itself is broken", or it
 *       loops forever against a dead tool.
 * Published for the driving agent in Task 14.
 */
const OUTCOME = {
  done: { code: 0, label: "HOTOVO" },
  continue: { code: 1, label: "POKRAČUJ" },
  parked: { code: 2, label: "PARK" },
  error: { code: 3, label: "CHYBA" },
};

function classifyVerdict(verdict) {
  if (verdict.status === "error") return "error";
  if (verdict.status === "done") return "done";
  if (verdict.stop) return "parked";
  return "continue";
}

export function selectExitCode(verdict) {
  return OUTCOME[classifyVerdict(verdict)].code;
}

/** Same table as `selectExitCode`, plus the console label — one home for both. */
export function describeOutcome(verdict) {
  return OUTCOME[classifyVerdict(verdict)];
}

/**
 * Our own thrown errors are already one clean Czech sentence prefixed
 * `design-match:` (every module in this tool follows the same convention) —
 * logging just that line is the right amount of detail for an operator.
 * Anything else — a browser that failed to launch, an unexpected fs error, an
 * actual bug — needs its stack to be diagnosable, so it must be logged in full
 * rather than reduced to `.message`.
 */
export function isDeliberateError(error) {
  return error instanceof Error && error.message.startsWith("design-match:");
}

/**
 * Everything between "I have a round result" and "here is the object
 * `writeArtifacts` receives" — Ruling 1 (`values` must never be forwarded as
 * `null`) and Ruling 3 (image buffers only on the round actually shot this
 * invocation) both live here now, as pure, directly testable branches, rather
 * than as inline expressions inside the browser-driven `runCompare` that no
 * test could ever reach.
 */
export function buildCompareOutcome({
  result,
  spec,
  slug,
  masks,
  history,
  fontPreflight,
  strictWrappers = false,
}) {
  // A font mismatch makes every pixel delta a lie — the numbers move but the
  // cause is not in the code — so it overrides whatever `evaluateRound` would
  // have said, and forces `pixels: null` even if a caller (or a future bug)
  // handed us pixels anyway. The preflight message becomes the round's whole
  // reason, so it reaches report.md and round-N.json instead of being swallowed.
  const preflightFailed = Boolean(fontPreflight && !fontPreflight.ok);
  const effectiveResult = preflightFailed ? { ...result, pixels: null } : result;
  // "parked", not "continue": a font mismatch is not fixed by another round —
  // the pixel layer stays suppressed, `percent` stays `null` forever, and
  // `decideNext`'s thrash/progress logic can only ever see "no signal". This
  // hands the operator one clear decision instead of burning all five rounds
  // against a condition no code edit can change.
  const roundVerdict = preflightFailed
    ? { status: "parked", reason: fontPreflight.message }
    : evaluateRound(effectiveResult);
  // Only this invocation's round carries image buffers — replayed history
  // rounds (read back from rounds.json) never do, they were stripped before
  // being persisted.
  const currentRound = {
    percent: effectiveResult.pixels ? effectiveResult.pixels.percent : null,
    skeletonPass: effectiveResult.skeleton.pass,
    reason: roundVerdict.reason,
    ...(effectiveResult.pixels
      ? { appImage: effectiveResult.appImage, maskImage: effectiveResult.pixels.diffBuffer }
      : {}),
  };
  const roundRecord = stripImages(currentRound);
  const fullHistory = [...history, roundRecord];

  const next = decideNext([], fullHistory);
  const verdict = combineVerdict(roundVerdict, next);

  const payload = {
    slug,
    spec,
    rounds: [...history, currentRound],
    verdict,
    masks,
    skeletonFindings: result.skeleton.findings,
    values: result.values ?? [],
    tokenMappings: spec.tokenMappings ?? [],
    componentDecisions: [],
    // values.md needs this to say which nodes the run never measured: with
    // collapsing on, a pass-through wrapper's values went with the wrapper.
    strictWrappers,
  };

  return { payload, roundRecord, fullHistory, verdict };
}

export async function loadHistory(dir, reset) {
  if (reset) return [];
  let raw;
  try {
    raw = await fs.readFile(path.join(dir, ROUNDS_FILE), "utf8");
  } catch {
    return [];
  }
  return historyFromRaw(raw);
}

/**
 * Every other error in this file is a clear Czech sentence naming what to do
 * — but `compare` run before any `measure` for the slug used to surface a raw
 * Node `ENOENT`, the single most likely first-run mistake. Only the missing-
 * file case is translated; any other read failure (permissions, a corrupt
 * file's JSON.parse failure) keeps propagating as-is.
 */
export async function readSpec(dir, slug) {
  let raw;
  try {
    raw = await fs.readFile(path.join(dir, "spec.json"), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `design-match: spec.json pro slug "${slug}" neexistuje — nejprve spusť measure pro tento slug.`,
      );
    }
    throw error;
  }
  const spec = JSON.parse(raw);
  // A spec.json written by an older design-match can be silently missing fields
  // the current comparison logic assumes exist (matchRole, most recently) —
  // comparing it anyway produces a confident, wrong structural finding instead
  // of the honest "this cache is stale" it actually is. Any mismatch, including
  // a spec.json old enough to have no version field at all, is unusable as-is.
  if (spec.version !== DESIGN_MATCH_VERSION) {
    throw new Error(
      `design-match: spec.json pro slug "${slug}" pochází ze starší verze design-match (${spec.version ?? "neznámá"}, aktuální je ${DESIGN_MATCH_VERSION}) — spusť znovu measure pro tento slug.`,
    );
  }
  return spec;
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
      // One extraction, one tree: the skeleton carries the values, so there is
      // no separate `spec.values` to fall out of step with it.
      skeleton: normalizeSkeleton(await extractRaw(page, chosen.selector), {
        strictWrappers: cmd.strictWrappers,
      }),
    };
  });

  // Token mapping is commentary on the spec, not the point of `measure` — a
  // theme file that can't be read must not fail the run, only leave the
  // mapping list empty and say why. The `try` wraps only the read itself: a
  // genuine bug in parseThemeTokens/buildTokenMappings must surface as
  // itself, not get reported as "the theme file couldn't be read".
  let themeCss;
  try {
    themeCss = await fs.readFile(cmd.theme, "utf8");
  } catch (error) {
    // --theme defaults to a cwd-relative path, so running measure from
    // anywhere but the repo root would otherwise degrade silently — name the
    // resolved absolute path so the operator can see what was actually
    // looked for.
    console.warn(
      `design-match: nelze načíst theme soubor "${path.resolve(cmd.theme)}" — mapování tokenů zůstává prázdné (${error.message})`,
    );
  }
  spec.tokenMappings =
    themeCss !== undefined
      ? buildTokenMappings(flattenValues(spec.skeleton), parseThemeTokens(themeCss))
      : [];
  // Stamped so a later `readSpec` can tell a cache from an older measurement
  // format apart from a current one, instead of comparing it and reporting a
  // confident, wrong structural finding.
  spec.version = DESIGN_MATCH_VERSION;

  await fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(spec, null, 2), "utf8");
  console.log(`spec.json zapsán → ${path.join(dir, "spec.json")}`);
}

async function runCompare(cmd) {
  const dir = path.join(ARTIFACT_ROOT, cmd.slug);
  const spec = await readSpec(dir, cmd.slug);
  const scene = resolveScene({ ...cmd, selector: cmd.selector ?? spec.selector });
  const history = await loadHistory(dir, cmd.reset);

  const result = await withPage(async (page) => {
    await page.goto(scene.url, { waitUntil: "networkidle" });
    const appSkeleton = normalizeSkeleton(await extractRaw(page, scene.selector), {
      strictWrappers: cmd.strictWrappers,
    });
    const skeleton = compareSkeletons(spec.skeleton, appSkeleton);
    if (!skeleton.pass) return { skeleton, values: null, pixels: null };

    // Same two trees the gate just compared — no second extraction, so no
    // second address space to disagree with it.
    const values = compareValues(spec.skeleton, appSkeleton);

    // A font mismatch makes every later pixel delta a lie — the numbers move
    // but the cause is not in the code — so the pixel comparison is skipped
    // entirely rather than measuring a difference whose cause is wrong.
    const preflight = checkFontPreflight(flattenValues(spec.skeleton), flattenValues(appSkeleton));
    if (!preflight.ok) return { skeleton, values, pixels: null, fontPreflight: preflight };

    const appImage = await shootScene(page, scene, path.join(dir, "app.png"));
    const designPng = await fs.readFile(path.join(dir, "design.png"));
    return {
      skeleton,
      values,
      pixels: diffPngs(designPng, appImage),
      appImage,
      fontPreflight: preflight,
    };
  });

  const { payload, fullHistory, verdict } = buildCompareOutcome({
    result,
    spec,
    slug: cmd.slug,
    masks: scene.masks,
    history,
    fontPreflight: result.fontPreflight,
    strictWrappers: cmd.strictWrappers,
  });

  await fs.writeFile(path.join(dir, ROUNDS_FILE), JSON.stringify(fullHistory, null, 2), "utf8");
  await writeArtifacts(dir, payload);

  const outcome = describeOutcome(verdict);
  console.log(`${outcome.label} — ${verdict.reason}`);
  process.exitCode = outcome.code;
}

function logFailure(error) {
  if (isDeliberateError(error)) {
    console.error(`[design-match] ${error.message}`);
  } else {
    // Not one of our own thrown usage errors — a real crash, which needs its
    // stack to be diagnosable rather than being reduced to `.message`.
    console.error(error);
  }
}

async function main(argv) {
  let cmd;
  try {
    cmd = parseArgs(argv);
  } catch (error) {
    logFailure(error);
    process.exitCode = selectExitCode({ status: "error" });
    return;
  }
  try {
    const run = cmd.command === "measure" ? runMeasure : runCompare;
    await run(cmd);
  } catch (error) {
    logFailure(error);
    process.exitCode = selectExitCode({ status: "error" });
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main(process.argv.slice(2));
}
