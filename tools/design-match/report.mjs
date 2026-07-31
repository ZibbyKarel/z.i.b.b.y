import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";

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

// extractValues keys come from the raw DOM walk, compareSkeletons' findings.path
// from the normalised tree (collapsed wrappers, children re-sorted by CSS `order`).
// The same element can carry two different paths — the two address spaces are
// never joined, so the note below is load-bearing, not decoration.
const VALUES_PATH_NOTE =
  "> Cesty v této tabulce pocházejí ze syrového DOM průchodu (`extractValues`) — nejde o stejný adresní prostor jako `skeleton.md`, který je odvozen z normalizovaného stromu (sbalené průchozí obaly, potomci přeřazení podle CSS `order`). Stejný element tak může mít jinde jinou cestu; nic tyto dvě sady cest nespojuje.";

export function renderValues(deltas) {
  if (deltas.length === 0)
    return `# Hodnoty\n\n${VALUES_PATH_NOTE}\n\nSedí — žádné hodnotové rozdíly.\n`;
  const lines = ["# Hodnoty", "", VALUES_PATH_NOTE, ""];
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

export function renderTokens(mappings) {
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

export function renderComponents(decisions) {
  const lines = ["# Volba komponent", ""];
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

export function renderReport({ slug, rounds, verdict, masks, siblingFiles = [] }) {
  // The headline is the last round's RoundVerdict.status, not decideNext's `stop`
  // flag: `stop` only means "the loop halted", which is equally true whether it
  // halted because the match succeeded or because it gave up. Filing a genuine
  // match as PARK would invert the one line operators read first.
  const lines = [
    `# design-match — ${slug}`,
    "",
    `**Výsledek:** ${verdict.status === "done" ? "HOTOVO" : "PARK"} — ${verdict.reason}`,
    "",
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
    throw new Error(
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
 * this module exists to produce. Only after everything is written does this
 * function reject, naming the affected round(s); the error is never swallowed,
 * it is just not allowed to cut the record short first.
 */
export async function writeArtifacts(dir, payload) {
  await fs.mkdir(dir, { recursive: true });

  // One pass per round: destructure the image buffers out (this is what keeps
  // them out of round-N.json — jsonSafe is exactly what gets stringified) and,
  // where both are present, attempt the composite right there so appImage and
  // maskImage are used in the same scope they're bound in. One round's failure
  // is caught and carried as `diffImageError` rather than thrown — it must not
  // stop the rounds after it from being attempted or written.
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
  const writes = [
    fs.writeFile(path.join(dir, "skeleton.md"), renderSkeleton(payload.skeletonFindings), "utf8"),
    fs.writeFile(path.join(dir, "values.md"), renderValues(payload.values), "utf8"),
    fs.writeFile(path.join(dir, "tokens.md"), renderTokens(payload.tokenMappings), "utf8"),
    fs.writeFile(
      path.join(dir, "components.md"),
      renderComponents(payload.componentDecisions),
      "utf8",
    ),
  ];

  if (payload.spec !== undefined) {
    siblingFiles.push("spec.json");
    writes.push(
      fs.writeFile(path.join(dir, "spec.json"), JSON.stringify(payload.spec, null, 2), "utf8"),
    );
  }

  roundsForRender.forEach((round, index) => {
    const roundJsonName = `round-${index + 1}.json`;
    siblingFiles.push(roundJsonName);
    writes.push(
      fs.writeFile(path.join(dir, roundJsonName), JSON.stringify(round, null, 2), "utf8"),
    );
    const composition = compositions[index];
    if (composition.attempted && composition.ok) {
      const diffPngName = `round-${index + 1}-diff.png`;
      siblingFiles.push(diffPngName);
      writes.push(fs.writeFile(path.join(dir, diffPngName), composition.buffer));
    }
  });

  writes.push(
    fs.writeFile(
      path.join(dir, "report.md"),
      renderReport({ ...payload, rounds: roundsForRender, siblingFiles }),
      "utf8",
    ),
  );

  await Promise.all(writes);

  const failedRounds = compositions
    .map((composition, index) => (composition.attempted && !composition.ok ? index + 1 : null))
    .filter((roundNumber) => roundNumber !== null);
  if (failedRounds.length > 0) {
    const roundFiles = failedRounds.map((n) => `round-${n}.json`).join(", ");
    throw new Error(
      `design-match: diff obrázek se nepodařilo sestavit pro kolo ${failedRounds.join(", ")} — viz report.md a ${roundFiles}`,
    );
  }
}
