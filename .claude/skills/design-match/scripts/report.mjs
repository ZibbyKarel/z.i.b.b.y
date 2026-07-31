import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { DesignMatchError } from "./errors.mjs";
import { MAX_ROUNDS, classifyVerdict, describeOutcome } from "./loop.mjs";

const bullet = (line) => `- ${line}`;

export function renderSkeleton(findings) {
  if (findings.length === 0)
    return "# Skeleton\n\nSedí — struktura implementace odpovídá designu.\n";
  const lines = ["# Skeleton", "", "SKELETON MISMATCH", ""];
  for (const finding of findings) {
    lines.push(
      `## \`${finding.path}\``,
      "",
      bullet(`**${finding.kind}** — ${finding.message}`),
      "",
    );
  }
  return lines.join("\n");
}

// What the value layer did NOT look at. Wrapper collapsing drops a pass-through
// wrapper's values along with the wrapper, so those nodes are never measured —
// and a pass-through wrapper is exactly the kind of node that carries a
// background colour. "No differences" and "not measured" are both silence in a
// report, and they must not read the same; masked regions are already always
// listed in report.md for the same reason. Stated as scope, not as a warning:
// collapsing is a deliberate trade that stops the gate crying wolf over one
// extra <div>, and --strict-wrappers is there when the trade is wrong.
const WRAPPER_COVERAGE_NOTE =
  "> Měřeny jsou uzly, které zůstaly ve skeletonu. Průchozí obaly, které normalizace sbalila, měřené nejsou — spusť s `--strict-wrappers`, pokud potřebuješ i je.";

// The paths here are the skeleton's own — one walk, one address space — so
// `values.md` and `skeleton.md` name the same node the same way. There used to
// be a note warning the reader that they did not; it is gone because it is no
// longer true, and a stale warning would make trustworthy paths look suspect.
//
// `wrappersCollapsed` defaults to true because collapsing is the tool's own
// default: a caller that forgets to say gets the coverage caveat rather than
// silent, false reassurance.
//
// fix round (task 14b), Defect 1: `deltas === null` and `deltas.length === 0`
// used to render identically — both produced "Sedí — žádné hodnotové rozdíly.".
// `null` means compareValues never ran at all (the skeleton gate failed first,
// see cli.mjs's runCompare); `[]` means it ran and genuinely found nothing.
// The first is "not measured", the second is "matches", and this is the exact
// silence-vs-silence collision the comment above already names — except this
// one is worse, because the current output isn't silent, it is a positive
// false claim. The two must stay distinguishable at the type level (null vs.
// array), not by a caller remembering to pass a separate flag.
//
// fix round 1, M1: `undefined` (a payload that omits `values` entirely, not
// one that deliberately set it to `null`) is neither of the two legitimate
// states above — it is a caller contract violation. Rendering it as "not
// measured" would name the skeleton gate as the cause of something that might
// not even involve the gate, which is the exact false-claim failure this task
// exists to close. It throws instead, the same clean `design-match:`-prefixed
// one-liner every other usage error in this tool gets — never `?? []` again.
export function renderValues(deltas, { wrappersCollapsed = true } = {}) {
  if (deltas === undefined) {
    throw new DesignMatchError(
      "design-match: renderValues dostal payload bez pole `values` — musí být buď `null` (skeleton gate neprošel), nebo pole delt (i prázdné).",
    );
  }
  if (deltas === null) {
    return [
      "# Hodnoty",
      "",
      "Neměřeno — skeleton gate neprošel, hodnoty se vůbec neporovnávaly. Oprav strukturu podle skeleton.md a spusť compare znovu.",
      "",
    ].join("\n");
  }
  const note = wrappersCollapsed ? [WRAPPER_COVERAGE_NOTE, ""] : [];
  if (deltas.length === 0) {
    return ["# Hodnoty", "", ...note, "Sedí — žádné hodnotové rozdíly.", ""].join("\n");
  }
  const lines = ["# Hodnoty", "", ...note];
  const byPath = new Map();
  for (const delta of deltas) {
    if (!byPath.has(delta.path)) byPath.set(delta.path, []);
    byPath.get(delta.path).push(delta);
  }
  for (const [nodePath, group] of byPath) {
    lines.push(`## \`${nodePath}\``, "");
    for (const delta of group) lines.push(bullet(`**${delta.prop}** — ${delta.message}`));
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * I4 (task 20). The third artifact with the same three states `renderValues`
 * already distinguishes, and the last one where they were still collapsed:
 *
 *   `undefined` — the payload has no `tokenMappings` key. Not a state of the
 *                 measurement, a malformed payload; `readSpec` rejects any
 *                 spec.json that is not the current version, so it cannot be an
 *                 old spec arriving here. Throws, like `renderValues`.
 *   `null`      — the theme file was never read, so nothing was mapped and
 *                 nothing CAN be concluded about tokens.
 *   `[]`        — the theme was read and the design needs no token beyond it.
 *
 * `null` used to be `[]`, and `[]` renders as an empty table — which SKILL.md
 * tells the operator to read as "no new tokens needed", an approval gate passed.
 * The only record that the theme was never opened was a stderr line from a
 * different command, long gone by the time anyone reads the artifact.
 */
export function renderTokens(mappings, { themeError } = {}) {
  if (mappings === undefined) {
    throw new DesignMatchError(
      "design-match: renderTokens dostal payload bez pole `tokenMappings` — musí být buď `null` (theme soubor se nepodařilo načíst), nebo pole mapování (i prázdné).",
    );
  }
  if (mappings === null) {
    // The reason is `measure`'s to record; if a spec carries the `null` without
    // it, the headline is still the honest one — we just cannot say why.
    const because = themeError === undefined ? "" : ` (${themeError})`;
    return [
      "# Mapování tokenů",
      "",
      `Neměřeno — theme soubor se při \`measure\` nepodařilo načíst${because}, takže se hodnoty proti tokenům vůbec nemapovaly. Tohle NENÍ "žádné nové tokeny nejsou potřeba": spusť \`measure\` znovu se správnou cestou v \`--theme\`.`,
      "",
    ].join("\n");
  }
  const lines = [
    "# Mapování tokenů",
    "",
    "| hodnota | výsledek | nejbližší existující | vzdálenost |",
    "| --- | --- | --- | --- |",
  ];
  for (const m of mappings) {
    lines.push(
      m.mapping.kind === "exact"
        ? `| \`${m.value}\` | \`${m.mapping.token}\` | — | 0 |`
        : `| \`${m.value}\` | **nový** \`${m.mapping.proposedName}\` | \`${m.mapping.nearest ?? "—"}\` | ${m.mapping.distance ?? "—"} |`,
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Task 20 re-review. This is not I4's defect — there is one state here, not two
 * collapsing into one rendering — but I4's argument holds unchanged: a fact kept
 * somewhere other than the artifact is gone by the time anyone opens the
 * artifact. `buildCompareOutcome` hardcodes `componentDecisions: []` and nothing
 * populates it, so an empty file said "the component-choice layer ran and
 * recorded no decisions" in exactly the words it would use for "this layer does
 * not exist". SKILL.md's `components.md` section is honest about it; this file
 * now carries the same sentence, in the same words, rather than a second
 * phrasing that could drift away from it.
 */
export function renderComponents(decisions) {
  const lines = ["# Volba komponent", ""];
  if (decisions.length === 0) {
    lines.push(
      "Tenhle soubor `compare` nikdy nevyplňuje — `componentDecisions` je natvrdo prázdné a nic do něj nezapisuje. Prázdno tady tedy neznamená, že volba komponent proběhla a nic nenašla.",
      "",
      "Zaznamenat, _proč_ byla nová komponenta oprávněná (které existující DS kandidáty jsi zkusil a proč jsi každý zamítl), je zatím ruční krok toho, kdo smyčku řídí — `compare` si to sám neodvodí.",
      "",
    );
    return lines.join("\n");
  }
  for (const d of decisions) {
    lines.push(`## \`${d.path}\` → ${d.chosen}`, "");
    if (d.rejected.length === 0) {
      lines.push(bullet("žádný existující DS kandidát nebyl zvažován"), "");
      continue;
    }
    for (const r of d.rejected) lines.push(bullet(`\`${r.component}\` zamítnut — ${r.reason}`));
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Fix round 1, I3. `gotoSettled` bounds the `networkidle` wait and warns on
 * stderr when it expires — but stderr is gone the moment the terminal scrolls,
 * and report.md is what the driver and the operator actually read. A page
 * photographed mid-load is not a reason to refuse (D7 is the whole argument for
 * that), but it IS a caveat on every number in this file, so it has to be in it.
 *
 * `undefined` is a third state and renders as neither: a round replayed from a
 * rounds.json written before the flag existed, or a spec.json from before it was
 * stamped, knows nothing about its settle. Unknown must not be laundered into
 * "settled" — that is the same collapse `values: null` vs `[]` exists to prevent.
 */
function settleCaveat(rounds, designSettled) {
  const unsettledRounds = rounds
    .map((round, index) => (round.settled === false ? index + 1 : null))
    .filter((index) => index !== null);
  if (unsettledRounds.length === 0 && designSettled !== false) return [];
  const parts = [];
  if (designSettled === false) {
    parts.push(
      "`design.png` byl pořízen na stránce, která se neustálila (networkidle) — měřený design je stav v tu chvíli vykreslený. Přeměř `measure`, pokud se mockup dokresluje.",
    );
  }
  if (unsettledRounds.length > 0) {
    parts.push(
      `implementace se neustálila (networkidle) v ${unsettledRounds.length === 1 ? "kole" : "kolech"} ${unsettledRounds.join(", ")} — snímek je z rozpracovaného načítání, takže procenta níž jsou orientační.`,
    );
  }
  return ["> **Pozor na ustálení stránky:** " + parts.join(" Dále: "), ""];
}

export function renderReport({ slug, rounds, verdict, masks, siblingFiles = [], designSettled }) {
  // D4 (task 15): this used to be a two-state ternary — done or PARK — with no
  // `continue` branch at all, so the normal "keep going" round wrote
  // `Výsledek: PARK` while the process exited 1 and the console said POKRAČUJ.
  // report.md is the file SKILL.md tells the operator to read FIRST, so a driver
  // following the documentation abandoned the loop on round 1 of every run.
  //
  // The label is now looked up from `loop.mjs`'s OUTCOME table — literally the
  // same object `selectExitCode` indexes — so the rendered verdict and the exit
  // code cannot disagree without one of them being undefined. There is no second
  // list of strings to keep in step, which is the only version of this fix that
  // stays fixed.
  const outcome = describeOutcome(verdict);
  const lines = [
    `# design-match — ${slug}`,
    "",
    `**Výsledek:** ${outcome.label} — ${verdict.reason}`,
    "",
    // The round counter is on rounds ALREADY RUN. `decideNext` checks
    // `rounds.length >= MAX_ROUNDS` after the round has produced its result, so
    // round MAX_ROUNDS runs fully and writes its artifacts before parking — the
    // ceiling is not a refusal to run the last round, and a driver sees at most
    // MAX_ROUNDS - 1 POKRAČUJ rounds. Verified against loop.mjs, not copied from
    // an earlier description of it, which was wrong.
    // Fix round 1, M8: history is replayed and appended, so a driver that keeps
    // calling `compare` past the ceiling produced "Kolo 6 z 5" — a sentence that
    // describes nothing. Past the ceiling the ceiling is the fact worth stating.
    rounds.length <= MAX_ROUNDS
      ? `Kolo ${rounds.length} z ${MAX_ROUNDS}. ${outcome.nextStep}`
      : `Kolo ${rounds.length}, strop ${MAX_ROUNDS} kol už je překročen. ${outcome.nextStep}`,
    "",
    ...settleCaveat(rounds, designSettled),
    ...(classifyVerdict(verdict) === "continue"
      ? [
          `Kolo ${MAX_ROUNDS} ještě proběhne celé a zapíše artefakty, teprve pak se běh zaparkuje — POKRAČUJ tedy může přijít nejvýš v ${MAX_ROUNDS - 1} kolech.`,
          "",
        ]
      : []),
    "## Kola",
    "",
  ];
  rounds.forEach((round, index) => {
    const percent = round.percent === null ? "—" : `${round.percent} %`;
    // A round whose diff image failed to composite (fix round 1, Important 1)
    // names the failure right in its own bullet — report.md alone must tell a
    // reader that the image is missing and why, not just leave a gap.
    const diffNote = round.diffImageError ? ` — diff obrázek chybí: ${round.diffImageError}` : "";
    lines.push(
      bullet(
        `kolo ${index + 1}: skeleton ${round.skeletonPass ? "✓" : "✗"}, diff ${percent} — ${round.reason}${diffNote}`,
      ),
    );
  });
  // D12 (task 19). The preflights used to say nothing when they passed, so
  // silence from that layer covered three different facts — verified and equal,
  // verified nothing, and never reached. Masked regions are already always
  // listed for exactly this reason ("a masked region is unverified area — never
  // mask silently"); an unrecorded check is the same kind of gap.
  //
  // A round with no `preflights` at all is a THIRD state — it was written before
  // the field existed — and renders as neither, the same rule `settled` follows.
  const preflightLines = rounds.flatMap((round, index) =>
    Array.isArray(round.preflights)
      ? round.preflights.map((preflight) =>
          bullet(`kolo ${index + 1} — ${preflight.name}: ${preflight.message}`),
        )
      : [],
  );
  if (preflightLines.length > 0) {
    lines.push("", "## Preflighty", "", ...preflightLines);
  }
  if (masks.length > 0) {
    lines.push("", "## Maskované regiony (nezkontrolovaná plocha)", "");
    for (const mask of masks) lines.push(bullet(`\`${mask}\``));
  }
  // fix round 1, Minor 2: report.md is the entry point to the run, so it must
  // itself point at every other file this run actually wrote.
  if (siblingFiles.length > 0) {
    lines.push("", "## Doprovodné soubory", "");
    for (const file of siblingFiles) lines.push(bullet(`\`${file}\``));
  }
  return lines.join("\n") + "\n";
}

/**
 * `diffPngs` runs with `diffMask: true`, so every matching pixel in `diffBuffer`
 * is fully transparent — opened alone it is marks floating on nothing, with no
 * page to place them against. This alpha-composites the mask over a COPY of the
 * app screenshot (the input buffers are read-only) so a human can see where on
 * the page the diff actually falls.
 */
export function compositeDiff(appPngBuffer, maskPngBuffer) {
  const app = PNG.sync.read(appPngBuffer);
  const mask = PNG.sync.read(maskPngBuffer);
  if (app.width !== mask.width || app.height !== mask.height) {
    throw new DesignMatchError(
      `design-match: rozměry se liší — app ${app.width}×${app.height}, maska ${mask.width}×${mask.height}`,
    );
  }
  const out = new PNG({ width: app.width, height: app.height });
  app.data.copy(out.data);
  for (let i = 0; i < mask.data.length; i += 4) {
    const alpha = mask.data[i + 3];
    if (alpha === 0) continue;
    const a = alpha / 255;
    for (let c = 0; c < 3; c += 1) {
      out.data[i + c] = Math.round(mask.data[i + c] * a + out.data[i + c] * (1 - a));
    }
    out.data[i + 3] = 255;
  }
  return PNG.sync.write(out);
}

/**
 * Writes, always: skeleton.md, values.md, tokens.md, components.md, report.md,
 * and one round-N.json per entry in `payload.rounds`. Writes conditionally:
 * spec.json only when `payload.spec` is present (its absence must not throw),
 * and round-N-diff.png only for a round that carries both `appImage` and
 * `maskImage` AND whose composite succeeded.
 *
 * fix round 1, Important 1: compositing happens for every eligible round
 * BEFORE any file is written, so one round's mismatched image dimensions
 * cannot truncate the rest of the record. A round whose composite fails still
 * gets its round-N.json (carrying the reason as `diffImageError`) and is named
 * in report.md — the artifacts are always the complete, self-explaining set
 * this module exists to produce.
 *
 * fix round 2: two more paths could still cut that record short, both closed
 * the same way — loudly, without destroying what could be built. (1) Every
 * markdown string is rendered to a local BEFORE any file is scheduled for
 * writing; a malformed payload that makes a renderer throw is now a clean
 * no-op, nothing on disk, rather than a partial set (report.md, rendered
 * last, was worst placed of all under the old ordering). (2) Writes are
 * awaited with `Promise.allSettled`, not `Promise.all` — a filesystem error
 * on one file no longer risks the caller observing the others before they've
 * actually landed, and no longer erases a compositing failure's message (the
 * old `Promise.all` rejected with whichever error hit first, discarding the
 * other). Only after every write has settled does this function reject,
 * naming every round that failed to composite AND every file that failed to
 * write — never swallowed, just never allowed to cut the record short first.
 */
export async function writeArtifacts(dir, payload) {
  // One pass per round: destructure the image buffers out (this is what keeps
  // them out of round-N.json — jsonSafe is exactly what gets stringified) and,
  // where both are present, attempt the composite right there so appImage and
  // maskImage are used in the same scope they're bound in. One round's failure
  // is caught and carried as `diffImageError` rather than thrown — it must not
  // stop the rounds after it from being attempted or written. Nothing here
  // touches the filesystem.
  const compositions = [];
  const roundsForRender = payload.rounds.map((round) => {
    const { appImage, maskImage, ...jsonSafe } = round;
    if (!appImage || !maskImage) {
      compositions.push({ attempted: false });
      return jsonSafe;
    }
    try {
      compositions.push({ attempted: true, ok: true, buffer: compositeDiff(appImage, maskImage) });
      return jsonSafe;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      compositions.push({ attempted: true, ok: false, message });
      return { ...jsonSafe, diffImageError: message };
    }
  });

  const siblingFiles = ["skeleton.md", "values.md", "tokens.md", "components.md"];
  if (payload.spec !== undefined) siblingFiles.push("spec.json");
  roundsForRender.forEach((_round, index) => {
    siblingFiles.push(`round-${index + 1}.json`);
    const composition = compositions[index];
    if (composition.attempted && composition.ok) siblingFiles.push(`round-${index + 1}-diff.png`);
  });

  // Render every markdown string now, still entirely in memory. If any of
  // these throws (a malformed payload), it happens here — before `fs.mkdir`,
  // before a single `fs.writeFile` call exists — so the directory is left
  // exactly as it was found.
  const textFiles = [
    { name: "skeleton.md", content: renderSkeleton(payload.skeletonFindings) },
    {
      name: "values.md",
      content: renderValues(payload.values, { wrappersCollapsed: !payload.strictWrappers }),
    },
    {
      name: "tokens.md",
      content: renderTokens(payload.tokenMappings, { themeError: payload.themeError }),
    },
    { name: "components.md", content: renderComponents(payload.componentDecisions) },
    {
      name: "report.md",
      content: renderReport({ ...payload, rounds: roundsForRender, siblingFiles }),
    },
  ];
  if (payload.spec !== undefined) {
    textFiles.push({ name: "spec.json", content: JSON.stringify(payload.spec, null, 2) });
  }
  roundsForRender.forEach((round, index) => {
    textFiles.push({ name: `round-${index + 1}.json`, content: JSON.stringify(round, null, 2) });
  });

  await fs.mkdir(dir, { recursive: true });

  const writeTasks = textFiles.map((file) => ({
    name: file.name,
    promise: fs.writeFile(path.join(dir, file.name), file.content, "utf8"),
  }));
  compositions.forEach((composition, index) => {
    if (composition.attempted && composition.ok) {
      const diffPngName = `round-${index + 1}-diff.png`;
      writeTasks.push({
        name: diffPngName,
        promise: fs.writeFile(path.join(dir, diffPngName), composition.buffer),
      });
    }
  });

  const settled = await Promise.allSettled(writeTasks.map((task) => task.promise));
  const writeFailures = settled
    .map((result, index) => (result.status === "rejected" ? writeTasks[index].name : null))
    .filter((name) => name !== null);

  const failedRounds = compositions
    .map((composition, index) => (composition.attempted && !composition.ok ? index + 1 : null))
    .filter((roundNumber) => roundNumber !== null);

  if (failedRounds.length > 0 || writeFailures.length > 0) {
    const parts = [];
    if (failedRounds.length > 0) {
      const roundFiles = failedRounds.map((n) => `round-${n}.json`).join(", ");
      parts.push(
        `diff obrázek se nepodařilo sestavit pro kolo ${failedRounds.join(", ")} — viz report.md a ${roundFiles}`,
      );
    }
    if (writeFailures.length > 0) {
      parts.push(`zápis selhal pro: ${writeFailures.join(", ")}`);
    }
    throw incomplete(new DesignMatchError(`design-match: ${parts.join("; ")}`), {
      writeFailures,
      failedRounds,
    });
  }
}

/**
 * I2 (task 20). `writeArtifacts` throwing does NOT mean nothing was written —
 * that is the whole point of the `allSettled` above. The caller has to be able
 * to tell "the round never got as far as its artifacts" from "the round ran and
 * some of its artifacts are missing", because the two deserve opposite sentences
 * on the report the operator reads first.
 *
 * Carried on the error rather than returned, because the throw is the only thing
 * that crosses the boundary. A Symbol, and non-enumerable, so it never shows up
 * in the inspected output of a crash that happens to ride past it.
 */
const ARTIFACT_WRITE = Symbol("design-match.artifactWrite");

const incomplete = (error, detail) =>
  Object.defineProperty(error, ARTIFACT_WRITE, { value: detail, configurable: true });

/**
 * `null` when the failure was raised before `writeArtifacts` reached the disk —
 * which is also what a caller sees for every failure that never went through
 * this module at all. Otherwise the two lists, which together name every file
 * the round should have produced and did not.
 */
export function artifactWriteFailure(error) {
  if (!(error instanceof Error)) return null;
  return error[ARTIFACT_WRITE] ?? null;
}
