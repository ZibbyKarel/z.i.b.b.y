#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { withPage } from "./browser.mjs";
import { CDN_CACHE_URL_PREFIX, ensureCdnCache } from "./cdn-cache.mjs";
import { compareSkeletons } from "./compare-skeleton.mjs";
import { compareValues } from "./compare-values.mjs";
import { DesignMatchError, isDeliberateError } from "./errors.mjs";
import { extractRaw } from "./extract.mjs";
import { collectRegions, cropRegions, formatInventory, rankCandidates } from "./inventory.mjs";
import { decideNext, describeOutcome, evaluateRound, selectExitCode } from "./loop.mjs";
import { childPath, normalizeSkeleton, rootPath } from "./normalize.mjs";
import { diffPngs, pngSize } from "./pixels.mjs";
import { fontPreflight, sizePreflight } from "./preflight.mjs";
import { artifactWriteFailure, writeArtifacts } from "./report.mjs";
import {
  assertServableRoot,
  gotoSettled,
  resolveScene,
  shootElement,
  shootScene,
  staticUrl,
  withStaticServer,
} from "./shoot.mjs";
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
    throw new DesignMatchError(`design-match: příznak "${flagName}" vyžaduje hodnotu`);
  }
  return value;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "measure" && command !== "compare") {
    throw new DesignMatchError(
      `design-match: neznámý příkaz "${command}" — použij measure nebo compare`,
    );
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
    } else if (arg === "--app-base") {
      // `resolveScene` has always accepted an `appBase` override; nothing ever
      // reached it from argv, so a `--route` scene was hardcoded to
      // http://localhost:3000. Plumbing it is what makes an end-to-end `compare`
      // testable at the process boundary at all (compare.browser.test.mjs),
      // which is where D4, D5 and D7 are actually observable.
      flags.appBase = takeFlagValue(rest, i, "--app-base");
      i += 1;
    } else if (arg === "--storybook-base") {
      // Fix round 1, M7: `--app-base` made the route scene testable at the
      // process boundary and left the story scene with no counterpart, so D5's
      // headline decision — a story with no --selector mounting at
      // #storybook-root — had no end-to-end test at all. Symmetric plumbing.
      flags.storybookBase = takeFlagValue(rest, i, "--storybook-base");
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  const [design, description] = positional;

  if (command === "measure" && (!design || !description)) {
    throw new DesignMatchError(
      'design-match: measure vyžaduje cestu k design souboru a popis — measure <design.html> "<popis>"',
    );
  }
  if (command === "compare" && !flags.slug) {
    throw new DesignMatchError("design-match: compare vyžaduje --slug <slug>");
  }
  // I3 (task 20). `--selector` names a node in the IMPLEMENTATION, and only
  // `resolveScene`/`runCompare` read it — `runMeasure` never has. Accepting it
  // on `measure` meant taking the operator's region choice and discarding it
  // without a word. Refused rather than wired up: the design side already has
  // `--region`, which picks from the inventory the run just printed, and a
  // second way to say the same thing is a way for the two to disagree.
  if (command === "measure" && flags.selector !== undefined) {
    throw new DesignMatchError(
      "design-match: measure nezná --selector — region designu se vybírá z inventury, kterou měření vypíše, přes --region <n>. " +
        "--selector patří na compare, kde míří na implementaci.",
    );
  }

  return {
    command,
    design,
    description,
    slug: flags.slug ?? (description ? slugify(description) : undefined),
    story: flags.story,
    route: flags.route,
    appBase: flags.appBase,
    storybookBase: flags.storybookBase,
    selector: flags.selector,
    masks: flags.masks,
    strictWrappers: flags.strictWrappers,
    region: flags.region !== undefined ? Number(flags.region) : 1,
    reset: flags.reset,
    theme: flags.theme ?? DEFAULT_THEME_PATH,
  };
}

/**
 * The artifact rule, stated once and applied at every refusal path in this file
 * (D8, task 15; task 16 M6):
 *
 *   design-match never deletes what it SAW, and never writes what it CONCLUDED.
 *
 * `design.png` and `r1..rN.png` are correct renderings of what the browser
 * actually put on screen. On a refusal they are not litter — they are the
 * evidence the refusal is telling the operator to go and look at, and deleting
 * them would leave a message ("open it and check it renders") with nothing to
 * open. `spec.json` is the opposite: it asserts a conclusion, so it is never
 * written on a failing path.
 *
 * The inconsistency worth removing was never that the pngs survive; it is that
 * the messages did not admit they were there, so they read as debris. Every
 * refusal that happens after something was rendered now names the file.
 *
 * Fix round 1 adds the two clauses the rule was missing, both of them the same
 * principle pointed the other way:
 *
 *   …and it names only files it actually wrote, never a count of files it might
 *   have written — and it never leaves a conclusion standing that it has just
 *   contradicted (see `markStaleReport`).
 *
 * `cropFitsPage` (task 17) made "one crop per candidate" false, so a message
 * built from `Math.min(candidateCount, 5)` claimed evidence that does not exist
 * — on `ZIBBY Redesign Canvas` it named five crops two lines below an inventory
 * saying all five had no preview. Naming absent evidence and leaving present
 * evidence unnamed are the same defect.
 */
function artifactHint(files) {
  if (files.length === 0) return "";
  return ` Soubory z tohoto běhu zůstaly na disku: ${files.join(", ")}.`;
}

/**
 * The "now pick a different one" tail of every `measure` refusal that leaves the
 * operator standing in front of the inventory. `crops` is `cropRegions`' return
 * value — one entry per candidate, the written path or `null` — so it names the
 * previews by fact rather than by arithmetic, and says so honestly when
 * `cropFitsPage` skipped every one.
 *
 * D9 (task 19) gave it a second caller and so a reason to exist as a function:
 * the capture refusal ends in exactly this situation, and a second, separately
 * worded copy of it is precisely the drift this branch keeps finding. The one
 * that matters is the empty branch — on `ZIBBY Redesign Canvas` under a
 * description that hits nothing, no crop survives, and a message that named
 * `r1..r5.png` there would be pointing at an empty directory.
 */
export function chooseRegionHint(crops = []) {
  const written = crops.filter((crop) => crop !== null && crop !== undefined);
  return written.length > 0
    ? artifactHint(written) + " Vyber podle nich a spusť measure znovu s --region <n>."
    : " Žádný náhled se z tohoto běhu nezachoval, takže vybírej podle selectorů a rozměrů v inventuře výše a spusť measure znovu s --region <n>.";
}

/**
 * 1-based `--region` → 0-based index, validated against the actual candidate
 * count. The crop limit stops being duplicated here (M2).
 */
export function resolveRegionIndex(region, candidateCount, crops = []) {
  if (!(region >= 1 && region <= candidateCount)) {
    throw new DesignMatchError(
      `design-match: region ${region} neexistuje — platný rozsah je 1–${candidateCount}.` +
        chooseRegionHint(crops),
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
 * The `(design.png, app.png) → preflight result` step, beside its font
 * counterpart above and pulled out of `runCompare` for the same reason: that
 * function is browser-driven and untestable here.
 */
export function checkSizePreflight(designPng, appPng) {
  return sizePreflight(pngSize(designPng), pngSize(appPng));
}

/**
 * The two names, in the order they run. Kept as a table rather than as branches
 * so a third preflight cannot be added to one place and forgotten in the other.
 */
const PREFLIGHTS = [
  { key: "fontPreflight", name: "písma" },
  { key: "sizePreflight", name: "rozměry snímků" },
];

/**
 * What each preflight said, for the round record — and from there for
 * `report.md`.
 *
 * D12 (task 19): both `ok: true` branches of `fontPreflight` computed a message
 * that nothing ever read, so a clean `compare` said nothing at all about fonts.
 * Silence then covered three different facts — verified and equal, verified
 * nothing (two empty stacks), and never ran — which is exactly the
 * "no differences vs not measured" collision this branch exists to prevent, one
 * layer down from where it was first fixed. Deleting the messages would have
 * collapsed those three further rather than resolving them.
 *
 * Surfaced only in the artifact, never on stdout: a clean run's console stays the
 * one outcome line it has always been, so this costs the operator nothing until
 * they go looking.
 *
 * `ok: null` is "did not run", and it carries the REAL reason rather than a
 * generic one — a size preflight skipped because the fonts differed did not fail
 * the gate, and naming the gate there would be a confident, wrong cause.
 */
export function describePreflights({ skeleton, fontPreflight: font, sizePreflight: size }) {
  const results = { fontPreflight: font, sizePreflight: size };
  let blocked = skeleton.pass ? null : "skeleton gate neprošel, k porovnání se běh nedostal";
  return PREFLIGHTS.map(({ key, name }) => {
    const result = results[key];
    if (result) {
      if (!result.ok) blocked ??= "porovnání se zastavilo na předchozím preflightu (písma)";
      // Fix round 1, Minor 4: a failing preflight's full message is already the
      // round's reason and the report's verdict headline. This section answers
      // "what did each check say", so it takes the bare finding (`summary`) when
      // the preflight offers one and does not repeat the remedy a third time.
      return { name, ok: result.ok, message: result.summary ?? result.message };
    }
    return { name, ok: null, message: `neproběhl — ${blocked ?? "běh se zastavil dřív"}` };
  });
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
 * The outcome table moved to loop.mjs (D4, task 17) so `report.mjs` reads the
 * SAME table the exit code comes from — it used to keep its own two-state list
 * of headline strings and printed PARK on rounds that were continuing.
 * Re-exported here because this module is where the CLI's published surface
 * lives; it is a re-export, not a second copy.
 */
export { describeOutcome, selectExitCode } from "./loop.mjs";

/**
 * Elements that ARE content rather than containers for it. A `<canvas>` with
 * no children and no text is a complete, legitimate measurement — task 15's
 * `--region 2` on ZIBBY Orb.html measured exactly that — so the emptiness
 * guard below must never refuse one.
 */
const SELF_CONTENT_TAGS = new Set([
  "canvas",
  "img",
  "picture",
  "svg",
  "video",
  "audio",
  "iframe",
  "object",
  "embed",
  "input",
  "textarea",
  "select",
  "progress",
  "meter",
  "hr",
]);

/**
 * The guard against the worst failure this branch has produced: a mockup that
 * rendered nothing, measured as a confident one-node spec, written at exit 0,
 * with every layer downstream then comparing against a description of nothing.
 *
 * The threshold is deliberately narrow — the measured region is refused only
 * when it is an EMPTY CONTAINER: no visible children, no own text, and a tag
 * that is not content in itself. The asymmetry decides where to put it. A
 * false refusal costs one operator one confused minute and is trivially
 * disproved by opening the crop; a false pass is silent and poisons the
 * skeleton gate, the value layer, the token mapping and every later round. So
 * the rule refuses everything that carries no structure AND no content —
 * against which no comparison could mean anything anyway — and nothing else.
 *
 * Note what it deliberately does NOT do: it does not require a minimum node
 * count, and it does not look at the region's size. A one-node spec is a
 * legitimate result for a leaf `<canvas>`, an `<img>`, or a `<button>Uložit</button>`,
 * and a full-viewport region is legitimate for a full-bleed mockup.
 *
 * It looks at the WHOLE tree, not just the root. The first version tested only
 * the measured node, so a page that rendered a single empty wrapper
 * (`#root > div` with nothing inside) satisfied it and wrote a two-node spec
 * describing two nested nothings. The rule generalises without loosening: a
 * region is a failed measurement when no node anywhere in it carries content.
 *
 * "Anywhere" has to respect the extraction depth cap, and this was found the
 * expensive way: `ZIBBY Roadmap.html`'s `#root` is seven levels of nested
 * layout `<div>`s whose first text sits at DOM depth 13, well below
 * `extractRaw`'s cap of 6. A depth-blind version of this rule refused it — a
 * false refusal on the mockup `SKILL.md` uses as its worked example. A subtree
 * that was cut off is UNKNOWN, not empty, and unknown must not condemn.
 *
 * Runs in Node on the value `extractRaw` returned — never inside
 * `page.evaluate`, which cannot construct a `DesignMatchError` that survives the
 * round trip (only the message crosses, and Playwright rewrites it).
 */
function carriesContent(raw) {
  if (raw.text.trim().length > 0) return true;
  if (SELF_CONTENT_TAGS.has(raw.tag)) return true;
  if (raw.truncated) return true;
  return raw.children.some(carriesContent);
}

export function assertRegionRendered(raw, selector, artifactDir, cropFile = null) {
  if (carriesContent(raw)) return;
  throw new DesignMatchError(
    `design-match: region "${selector}" nic neobsahuje — v celém podstromu není text ani žádný obsahový prvek, takže spec by popisoval prázdno. ` +
      `Pravděpodobné příčiny: stránka se nevykreslila, skripty se nenačetly, nebo selector míří na prázdný kontejner. ` +
      `Otevři mockup v prohlížeči a ověř, že se vykreslí, případně zvol jiný region přes --region <n>.` +
      // D8: the run has already photographed exactly what the message is asking
      // the operator to go and look at. Naming the file is what makes the
      // leftover png evidence rather than debris.
      //
      // Fix round 1, I2: `design.png` is always written before this guard, so
      // naming it is a fact. `r1.png` was hardcoded — wrong twice over, since
      // `cropFitsPage` may have skipped it and since region 1 is not the region
      // being refused. The CHOSEN region's crop is the relevant evidence, and it
      // is named only when it exists.
      artifactHint([
        ...(artifactDir ? [path.join(artifactDir, "design.png")] : []),
        ...(cropFile ? [cropFile] : []),
      ]),
  );
}

/**
 * The same question asked of a `spec.json` already on disk, which is a
 * different shape: `normalizeSkeleton` drops raw text, folding "leaf with its
 * own text" into `role === "text"` (`inferRole`). So `role` stands in for the
 * text test, and `SELF_CONTENT_TAGS` is shared verbatim with the measure-time
 * guard above. `role === "group"` is exactly `inferRole`'s residue: no semantic
 * tag, no declared role, no class hint, and no own text.
 */
function skeletonCarriesContent(node) {
  // Deliberately ROOT-ONLY, unlike the measure-time guard. `normalizeSkeleton`
  // does not carry the depth-cap flag `extractRaw` produces, so a childless
  // node deeper in a stored skeleton could be a genuine leaf or a truncation —
  // unknowable from the file. A childless ROOT cannot be a truncation (the cap
  // bites at level 6, not level 0), so that one case is decidable, and it is
  // exactly the shape the silent failures left behind.
  //
  // Only a positively-identified blank container is refused. A node shaped
  // unlike anything `normalizeSkeleton` produces is not something this
  // predicate can judge, and guessing would refuse specs on no evidence.
  if ((node.children ?? []).length > 0) return true;
  return node.role !== "group" || SELF_CONTENT_TAGS.has(node.tag);
}

/**
 * Specs written before the emptiness guard existed are still valid 1.3.0
 * documents, and `readSpec`'s version check therefore accepts them — including
 * the blank one-node `#root` specs the seven silently-failing mockups left
 * behind. `compare` against one of those reports a confident SKELETON MISMATCH
 * that is an artifact of the tool, not of the implementation: the same
 * unbackable claim this guard exists to remove, merely inverted into a false
 * red.
 *
 * A version bump cannot express this. It is all-or-nothing on the format, so it
 * would condemn the legitimate one-node `<canvas>` specs and every good spec
 * alongside the blank ones. Judging the content is the only thing that
 * separates them.
 */
export function assertSpecMeasured(spec, slug) {
  if (skeletonCarriesContent(spec.skeleton)) return;
  throw new DesignMatchError(
    `design-match: spec.json pro slug "${slug}" popisuje prázdný region — vznikl před kontrolou prázdnoty, kdy se nevykreslený mockup uložil jako platný spec. Spusť znovu measure pro tento slug.`,
  );
}

/**
 * Our own thrown refusals are one clean Czech sentence prefixed `design-match:`
 * (every module in this tool follows the same convention) — logging just that
 * line is the right amount of detail for an operator. Anything else — a browser
 * that failed to launch, an unexpected fs error, an actual bug — needs its stack
 * to be diagnosable, so it must be logged in full rather than reduced to
 * `.message`.
 *
 * Which of the two a failure is is decided by IDENTITY now, not by the spelling
 * of a message this tool does not own once a library has touched it. See
 * errors.mjs — that file is where the reasoning lives, and where instance eight
 * belongs.
 */
export { isDeliberateError } from "./errors.mjs";

/**
 * Everything between "I have a round result" and "here is the object
 * `writeArtifacts` receives" lives here now, as pure, directly testable
 * branches, rather than as inline expressions inside the browser-driven
 * `runCompare` that no test could ever reach.
 *
 * Ruling 1 is SUPERSEDED by task 14b (Defect 1) — it used to require `values`
 * never be forwarded as `null`; that was the bug. `values` MUST now be
 * forwarded as `null` when the skeleton gate short-circuited the comparison
 * (see `runCompare`, the sole producer of `values: null`) — `renderValues`
 * depends on that to render the honest "not measured" state rather than a
 * false "matches". `[]` stays reserved for "compared, no deltas". If a future
 * change here restores `?? []`, it is reverting a fix, not applying one.
 * Ruling 3 (image buffers only on the round actually shot this invocation)
 * stands unchanged.
 */
export function buildCompareOutcome({
  result,
  spec,
  slug,
  masks,
  history,
  fontPreflight,
  sizePreflight,
  strictWrappers = false,
  settled,
}) {
  // A failing preflight makes every pixel delta a lie — for fonts the numbers
  // move but the cause is not in the code; for sizes (D10, task 19) the diff is
  // not even defined — so it overrides whatever `evaluateRound` would have said,
  // and forces `pixels: null` even if a caller (or a future bug) handed us pixels
  // anyway. The preflight message becomes the round's whole reason, so it reaches
  // report.md and round-N.json instead of being swallowed.
  //
  // FIRST failure wins, in run order: the fonts are checked before either
  // screenshot exists, so a font mismatch is the earlier and more fundamental
  // fact, and reporting the later one over it would name the wrong cause.
  const failedPreflight = [fontPreflight, sizePreflight].find(
    (preflight) => preflight && !preflight.ok,
  );
  const effectiveResult = failedPreflight ? { ...result, pixels: null } : result;
  // "parked", not "continue": neither mismatch is fixed by another round — the
  // pixel layer stays suppressed, `percent` stays `null` forever, and
  // `decideNext`'s thrash/progress logic can only ever see "no signal". This
  // hands the operator one clear decision instead of burning all five rounds
  // against a condition no code edit can change.
  const roundVerdict = failedPreflight
    ? { status: "parked", reason: failedPreflight.message }
    : evaluateRound(effectiveResult);
  // Only this invocation's round carries image buffers — replayed history
  // rounds (read back from rounds.json) never do, they were stripped before
  // being persisted.
  const currentRound = {
    percent: effectiveResult.pixels ? effectiveResult.pixels.percent : null,
    skeletonPass: effectiveResult.skeleton.pass,
    reason: roundVerdict.reason,
    // D12: what each preflight said, including when it passed and when it never
    // ran — the record that the layer was there at all.
    preflights: describePreflights({ skeleton: result.skeleton, fontPreflight, sizePreflight }),
    // Fix round 1, I3. Spread conditionally: absent is a THIRD state, meaning
    // "this round predates the flag", and a round replayed from an older
    // rounds.json must not be rendered as though it had been observed to settle.
    ...(settled === undefined ? {} : { settled }),
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
    // Defect 1 (task 14b): `result.values` is `null` exactly when the skeleton
    // gate failed and compareValues never ran (see runCompare) — that must
    // reach `renderValues` as `null`, not get laundered into `[]` here. `[]`
    // is the genuine "compared, no deltas" result; the two are not the same
    // fact and must not collapse into the same payload value.
    values: result.values,
    // The design was measured once, rounds ago, by a different command — so its
    // own settle can only reach report.md through spec.json. `undefined` for a
    // spec measured before the flag existed, which renders as neither fact.
    designSettled: spec.settled,
    // I4 (task 20): the same laundering Defect 1 removed one line above, in the
    // artifact nobody re-examined. `null` means `measure` never read the theme
    // file; `?? []` turned that into "the theme was read and the design needs
    // nothing new", which is what SKILL.md's approval gate reads as a pass.
    tokenMappings: spec.tokenMappings,
    themeError: spec.themeError,
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
      throw new DesignMatchError(
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
    throw new DesignMatchError(
      `design-match: spec.json pro slug "${slug}" pochází ze starší verze design-match (${spec.version ?? "neznámá"}, aktuální je ${DESIGN_MATCH_VERSION}) — spusť znovu measure pro tento slug.`,
    );
  }
  // The version stamp cannot see this: a blank spec is a well-formed 1.3.0
  // document. See `assertSpecMeasured`.
  assertSpecMeasured(spec, slug);
  return spec;
}

/**
 * `--strict-wrappers` changes whether pass-through wrappers are collapsed out
 * of the skeleton. `measure` stamps the flag it ran with into `spec.json`;
 * this refuses outright when `compare`'s own flag disagrees with it, rather
 * than silently comparing a collapsed design tree against an uncollapsed app
 * tree (or vice versa) — that mismatch produces skeleton findings that are
 * pure artifacts of the flag disagreement, not of the implementation.
 *
 * Same shape as `readSpec`'s version check just above: a fact the caller could
 * get silently wrong is treated as a hard stop, not a value to cope with. A
 * spec.json old enough to predate this field never reaches here — `readSpec`
 * already refused it for a version mismatch first.
 */
export function checkStrictWrappersMatch(spec, requestedStrictWrappers) {
  const measured = Boolean(spec.strictWrappers);
  const requested = Boolean(requestedStrictWrappers);
  if (measured === requested) return;
  throw new DesignMatchError(
    `design-match: --strict-wrappers se neshoduje s measure (measure běžel ${measured ? "s" : "bez"} --strict-wrappers, compare žádá ${requested ? "s" : "bez"}) — spusť znovu measure se stejným příznakem jako compare, nebo příznak u compare uprav tak, aby seděl.`,
  );
}

/**
 * Exactly the two directories a `measure` run needs, each checked against
 * `assertServableRoot` first — the mockup's own directory (for its sibling
 * `zibby/*.jsx`) and the shared cdn cache, mounted apart rather than merged
 * into their common ancestor.
 *
 * Extracted from `runMeasure` so the mount set and the safety floor are
 * directly testable: `runMeasure` is browser-driven and has never had a test,
 * so anything left inline there is unpinned by construction.
 */
export function planMeasureMounts(localHtmlPath, cacheDir) {
  const mockupDir = assertServableRoot(path.dirname(localHtmlPath), "adresář mockupu");
  const cacheRoot = assertServableRoot(cacheDir, "adresář cdn cache");
  return {
    mockupDir,
    // Rebuilt from the checked root rather than passed through. The floor now
    // returns a realpath, and `staticUrl` derives the url from `path.relative`
    // — handing it the original path while the mount is the resolved one would
    // produce a `../..` url the moment any component of the path is a symlink.
    // The html is by construction a direct child of its own dirname, so this
    // needs no further filesystem access.
    htmlPath: path.join(mockupDir, path.basename(localHtmlPath)),
    mounts: { "/": mockupDir, [CDN_CACHE_URL_PREFIX]: cacheRoot },
  };
}

async function runMeasure(cmd) {
  const dir = path.join(ARTIFACT_ROOT, cmd.slug);
  const cacheDir = path.join(ARTIFACT_ROOT, ".cdn-cache");
  const { localHtmlPath } = await ensureCdnCache(cmd.design, cacheDir);

  // Over `file://` Chromium blocks the XHR Babel uses to load
  // `<script type="text/babel" src="zibby/*.jsx">`, and cannot satisfy a
  // `crossorigin` fetch either — so seven of the eleven real mockups rendered
  // an empty `#root`. The bytes were never the problem; the scheme was.
  const { mockupDir, htmlPath, mounts } = planMeasureMounts(localHtmlPath, cacheDir);

  const spec = await withStaticServer(mounts, (origin) =>
    withPage(async (page) => {
      const url = staticUrl(origin, mockupDir, htmlPath);
      // The same settle `compare` uses on the implementation — one function, so
      // the two sides of a comparison can never drift apart on how long they
      // waited or what they waited for.
      const { settled } = await gotoSettled(page, url);
      const ranked = rankCandidates(await collectRegions(page), cmd.description);
      await fs.mkdir(dir, { recursive: true });
      const crops = await cropRegions(page, ranked, dir);
      console.log(formatInventory(ranked, 5, crops));

      const regionIndex = resolveRegionIndex(cmd.region, ranked.length, crops);
      const chosen = ranked[regionIndex];
      console.log(
        `Vybrán region [${cmd.region}]: ${chosen.selector} — pokud je špatně, spusť znovu s --region <n>.`,
      );

      // design.png is written here and nowhere else — `compare` reads it every
      // round. Through the same `shootElement` the implementation goes through,
      // so neither side can be captured under settings the other wasn't (I4).
      //
      // D9 (task 19): the context is what turns Chromium's capture refusal into
      // one clean line instead of a raw Playwright stack. The remedy is the SAME
      // sentence an out-of-range `--region` prints, because the operator is in
      // the same position — standing in front of the inventory that was printed
      // four lines ago, needing to pick a different row.
      await shootElement(page.locator(chosen.selector).first(), path.join(dir, "design.png"), [], {
        selector: chosen.selector,
        box: chosen.box,
        remedy: chooseRegionHint(crops),
      });
      const raw = await extractRaw(page, chosen.selector);
      // Before anything is written: a region with neither structure nor
      // content is a failed measurement, not a result.
      assertRegionRendered(raw, chosen.selector, dir, crops[regionIndex] ?? null);
      return {
        settled,
        selector: chosen.selector,
        // One extraction, one tree: the skeleton carries the values, so there is
        // no separate `spec.values` to fall out of step with it.
        skeleton: normalizeSkeleton(raw, { strictWrappers: cmd.strictWrappers }),
      };
    }),
  );

  // Token mapping is commentary on the spec, not the point of `measure` — a
  // theme file that can't be read must not fail the run, only leave the
  // mapping list empty and say why. The `try` wraps only the read itself: a
  // genuine bug in parseThemeTokens/buildTokenMappings must surface as
  // itself, not get reported as "the theme file couldn't be read".
  let themeCss;
  let themeError;
  try {
    themeCss = await fs.readFile(cmd.theme, "utf8");
  } catch (error) {
    // --theme defaults to a cwd-relative path, so running measure from
    // anywhere but the repo root would otherwise degrade silently — name the
    // resolved absolute path so the operator can see what was actually
    // looked for.
    themeError = `${path.resolve(cmd.theme)}: ${error.message}`;
    console.warn(
      `design-match: nelze načíst theme soubor "${path.resolve(cmd.theme)}" — mapování tokenů se neprovede (${error.message})`,
    );
  }
  // I4 (task 20). `null`, not `[]`: the stderr warning above belongs to THIS
  // command and is gone by the time anyone opens the artifacts a later
  // `compare` writes. Unless the fact travels in spec.json, `tokens.md` renders
  // an empty table that reads as "no new tokens needed" — a conclusion this run
  // has no evidence for. See `renderTokens` for the three states.
  spec.tokenMappings =
    themeCss !== undefined
      ? buildTokenMappings(flattenValues(spec.skeleton), parseThemeTokens(themeCss))
      : null;
  if (themeError !== undefined) spec.themeError = themeError;
  // Stamped so a later `compare` can be refused (checkStrictWrappersMatch) if
  // its own --strict-wrappers disagrees with the flag this measure actually
  // ran with — a mismatch would otherwise collapse one side's tree and not
  // the other, and the gate would report findings that are artifacts of that
  // disagreement rather than of the implementation.
  spec.strictWrappers = cmd.strictWrappers;
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
  checkStrictWrappersMatch(spec, cmd.strictWrappers);
  // `cmd` is passed through whole, deliberately: there used to be a
  // `selector: cmd.selector ?? spec.selector` here, and inheriting the DESIGN's
  // selector is D5. `resolveScene` owns every selector default now — see its
  // comment for why a story gets one and a route does not.
  const scene = resolveScene(cmd);
  const history = await loadHistory(dir, cmd.reset);

  const result = await withPage(async (page) => {
    // Navigated and settled exactly once per round, by the same function
    // `measure` used on the design. `shootScene` no longer re-navigates (D7), so
    // the skeleton extracted below and the screenshot taken further down are the
    // same render of the same page.
    const { settled } = await gotoSettled(page, scene.url);
    const appSkeleton = normalizeSkeleton(await extractRaw(page, scene.selector), {
      strictWrappers: cmd.strictWrappers,
    });
    const skeleton = compareSkeletons(spec.skeleton, appSkeleton);
    // The sole producer of `values: null` — `renderValues` (report.mjs) hardcodes
    // the skeleton gate as the cause of "not measured". Any future short-circuit
    // added before `compareValues` runs (the font preflight below deliberately
    // does not: it forwards the real `values` array) must carry its own reason
    // rather than reuse this sentinel, or values.md will confidently name the
    // wrong cause.
    if (!skeleton.pass) return { settled, skeleton, values: null, pixels: null };

    // Same two trees the gate just compared — no second extraction, so no
    // second address space to disagree with it.
    const values = compareValues(spec.skeleton, appSkeleton);

    // A font mismatch makes every later pixel delta a lie — the numbers move
    // but the cause is not in the code — so the pixel comparison is skipped
    // entirely rather than measuring a difference whose cause is wrong.
    const preflight = checkFontPreflight(flattenValues(spec.skeleton), flattenValues(appSkeleton));
    if (!preflight.ok) return { settled, skeleton, values, pixels: null, fontPreflight: preflight };

    const appImage = await shootScene(page, scene, path.join(dir, "app.png"));
    const designPng = await fs.readFile(path.join(dir, "design.png"));

    // D10 (task 19). The second preflight, and the last thing between here and
    // `diffPngs` — which throws on mismatched buffers, inside this block, before
    // `writeArtifacts` has run. Asked of the images themselves rather than of the
    // DOM boxes, because the images are what the pixel layer would consume.
    //
    // `app.png` is already on disk by now and `design.png` has been there since
    // `measure`, so parking here leaves the operator holding the two pictures the
    // finding is about — which is the whole point of moving the check off the
    // crash path.
    const sizes = checkSizePreflight(designPng, appImage);
    if (!sizes.ok) {
      return {
        settled,
        skeleton,
        values,
        pixels: null,
        fontPreflight: preflight,
        sizePreflight: sizes,
      };
    }

    return {
      settled,
      skeleton,
      values,
      pixels: diffPngs(designPng, appImage),
      appImage,
      fontPreflight: preflight,
      sizePreflight: sizes,
    };
  });

  const { payload, fullHistory, verdict } = buildCompareOutcome({
    result,
    spec,
    slug: cmd.slug,
    masks: scene.masks,
    history,
    fontPreflight: result.fontPreflight,
    sizePreflight: result.sizePreflight,
    strictWrappers: cmd.strictWrappers,
    settled: result.settled,
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

/**
 * Fix round 1, M3, and the artifact rule's second new clause: design-match never
 * leaves a conclusion standing that it has just contradicted.
 *
 * D8 covered which files a failing run may WRITE, and said nothing about the
 * ones already on disk. SKILL.md tells the operator to read `report.md` first,
 * always — the exact premise D4 was fixed on — so a refused round left the
 * previous round's `POKRAČUJ` reading like the answer to the invocation that had
 * just failed. The retraction is a caveat, not a verdict: the record of the
 * round that really did run is preserved underneath it, and the marker is
 * checked for first so repeated failures do not stack.
 *
 * Best-effort by construction. This runs while an error is already being
 * reported, and a second failure here must not replace the first one on the
 * operator's screen.
 */
const STALE_REPORT_MARKER = "> **NEPLATNÉ:**";
const INCOMPLETE_REPORT_MARKER = "> **NEÚPLNÉ:**";
const ANY_REPORT_MARKER = [STALE_REPORT_MARKER, INCOMPLETE_REPORT_MARKER];

const alreadyMarked = (report) => ANY_REPORT_MARKER.some((marker) => report.startsWith(marker));

export function markStaleReportText(report) {
  if (alreadyMarked(report)) return null;
  return (
    `${STALE_REPORT_MARKER} tenhle report popisuje starší kolo. Následující \`compare\` skončil chybou ` +
    `(hláška je ve výstupu terminálu, ne tady), takže verdikt níž na aktuální stav neodpovídá — ` +
    `oprav příčinu a spusť \`compare\` znovu.\n\n${report}`
  );
}

/**
 * I2. The other half of the same rule: the report below IS this round's, so
 * retracting it would be the false claim. What failed is the set of files beside
 * it, and that is what this says — verdict stands, artifacts incomplete, here is
 * exactly which ones. Without it the exit code (3) and the headline (`HOTOVO`)
 * simply contradict each other with nothing on the page to explain why.
 */
export function markIncompleteReportText(report, missing) {
  if (alreadyMarked(report)) return null;
  const named = missing.length > 0 ? ` Chybí nebo jsou zastaralé: ${missing.join(", ")}.` : "";
  return (
    `${INCOMPLETE_REPORT_MARKER} verdikt níž platí — popisuje kolo, které právě proběhlo. ` +
    `Běh ale skončil chybou při zápisu artefaktů (hláška je ve výstupu terminálu, ne tady), ` +
    `takže sada souborů vedle není úplná.${named} ` +
    `Než se na ně spolehneš, oprav příčinu a spusť \`compare\` znovu.\n\n${report}`
  );
}

/**
 * Which of the two sentences a failed `compare` earns is decided by the ERROR,
 * not by where in `runCompare` we think we were — the ordering would otherwise
 * be knowledge that has to be kept true in two places at once, and I2 is exactly
 * what happens when two places each hold a reasonable half of it.
 *
 * `report.md` among the write failures looks like a partial write and is not:
 * that file on disk was never replaced, so it does describe an older round and
 * the retraction is right after all.
 *
 * Pure and exported so both branches are testable without a filesystem that has
 * to be persuaded to fail in a particular way.
 */
export function annotateReportText(report, error) {
  const partial = artifactWriteFailure(error);
  if (partial === null || partial.writeFailures.includes("report.md")) {
    return markStaleReportText(report);
  }
  return markIncompleteReportText(report, [
    ...partial.writeFailures,
    ...partial.failedRounds.map((round) => `round-${round}-diff.png`),
  ]);
}

async function annotateFailedReport(dir, error) {
  const reportPath = path.join(dir, "report.md");
  try {
    const marked = annotateReportText(await fs.readFile(reportPath, "utf8"), error);
    if (marked !== null) await fs.writeFile(reportPath, marked, "utf8");
  } catch {
    // No previous report, or it cannot be rewritten. Nothing to retract, and
    // nothing worth displacing the real error with.
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
    // Only `compare` produces a verdict, so only `compare` can invalidate one.
    // A failed `measure` says nothing about whether an earlier comparison held.
    if (cmd.command === "compare")
      await annotateFailedReport(path.join(ARTIFACT_ROOT, cmd.slug), error);
    process.exitCode = selectExitCode({ status: "error" });
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main(process.argv.slice(2));
}
