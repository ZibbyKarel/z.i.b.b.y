#!/usr/bin/env node
// ZC-00 recon: subsystem → department rename inventory.
//
// Produces docs/plans/zibbycorp/recon/rename-inventory.md by grepping the tracked tree
// (via `git grep`, so it only ever sees committed/staged content) for:
//   - per-token, per-top-level-dir file counts (subsystem + the 11 persona ids)
//   - tracked file/dir PATHS whose names contain a token (candidates for `git mv`)
//   - every distinct persona-prefixed string-literal id, with file:line + a proposed
//     neutral replacement (persona -> department function word)
//   - a split of "ledger" hits into the generic word vs. the subsystem id
//   - exported TS symbols containing Subsystem/SUBSYSTEM, with a proposed Department name
//   - i18n keys/values in apps/web/i18n/messages/{cs,en}.json
//   - API routes containing "subsystem"
//   - .zibby/data files/dirs affected (frontmatter keys, dirs, vault MOCs + wikilinks)
//
// Read-only: this script never writes outside docs/plans/zibbycorp/recon/. No deps.
//
// Usage: node tools/migrate/rename-inventory.mjs [--out <file>]

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEPARTMENT_ID, FUNCTION_WORD } from "./zibbycorp-map.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT_DEFAULT = join(ROOT, "docs/plans/zibbycorp/recon/rename-inventory.md");

const outArgIdx = process.argv.indexOf("--out");
const OUT = outArgIdx !== -1 ? process.argv[outArgIdx + 1] : OUT_DEFAULT;

const PERSONAS = Object.keys(DEPARTMENT_ID); // forge, puls, sentinel, maestro, beacon, scout, herald, loom, codex, ledger, hearth
const SUBSYSTEM_TOKEN = "subsystem";
const TOKENS = [SUBSYSTEM_TOKEN, ...PERSONAS];

const TOP_LEVEL_DIRS = [
  "apps/api",
  "apps/web",
  "libs/contracts",
  "libs/design-system",
  "tools",
  "docs",
  ".zibby/data",
  "apps/api/data-test",
];

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // git grep exits 1 when there are zero matches — that's a valid empty result, not a failure.
    if (err.status === 1 && typeof err.stdout === "string") return err.stdout;
    throw err;
  }
}

// `subsystem` is matched as a case-insensitive SUBSTRING (catches `subsystems`,
// `SubsystemFoo`, `ownerSubsystem`, `SUBSYSTEM_X`) — this mirrors the I-6 grep gate in
// ROADMAP.md, which has `subsystem` bare (no \b) while the persona ids ARE `\b`-wrapped.
// Personas stay word-bounded so e.g. `puls` doesn't match inside an unrelated word.
function tokenPattern(token) {
  return token === SUBSYSTEM_TOKEN ? token : `\\b${token}\\b`;
}

/** Files (tracked) matching a token under a path, per `tokenPattern`'s rule. */
function grepFiles(token, dir) {
  const out = git(["grep", "-l", "-i", "-P", tokenPattern(token), "--", dir]);
  return out.split("\n").filter(Boolean);
}

/** file:line:text hits for a bare token, per `tokenPattern`'s rule. */
function grepHits(token, dirs) {
  return grepHitsPattern(tokenPattern(token), dirs);
}

/** file:line:text hits for an already-anchored/composed regex (no extra \b wrapping). */
function grepHitsPattern(pattern, dirs) {
  const out = git(["grep", "-n", "-i", "-P", pattern, "--", ...dirs]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = /^([^:]+):(\d+):(.*)$/.exec(line);
      if (!m) return null;
      return { file: m[1], line: Number(m[2]), text: m[3] };
    })
    .filter(Boolean);
}

/** All tracked paths (files, and their parent dirs) under a top-level dir. */
function allTrackedPaths(dir) {
  try {
    const out = git(["ls-files", "--", dir]);
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 1. Per-token, per-top-level-dir file counts
// ---------------------------------------------------------------------------

const countTable = []; // { token, dir, count }
for (const token of TOKENS) {
  for (const dir of TOP_LEVEL_DIRS) {
    let files = [];
    try {
      files = grepFiles(token, dir);
    } catch {
      files = [];
    }
    countTable.push({ token, dir, count: files.length });
  }
}

// ---------------------------------------------------------------------------
// 2. Tracked file/dir PATHS whose *names* contain a token (candidates for git mv)
// ---------------------------------------------------------------------------

const pathHits = new Map(); // token -> Set(path)
for (const token of TOKENS) pathHits.set(token, new Set());

const dirPathHits = new Set(); // distinct dir paths (any depth) whose basename matches a token

for (const topDir of TOP_LEVEL_DIRS) {
  const files = allTrackedPaths(topDir);
  for (const file of files) {
    const parts = file.split("/");
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i];
      for (const token of TOKENS) {
        const re = new RegExp(tokenPattern(token), "i");
        if (re.test(segment)) {
          const isFile = i === parts.length - 1;
          const pathSoFar = parts.slice(0, i + 1).join("/");
          if (isFile) {
            pathHits.get(token).add(file);
          } else {
            dirPathHits.add(pathSoFar);
            pathHits.get(token).add(pathSoFar + "/");
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Distinct persona-prefixed string-literal ids (kebab-case: persona-word[-word...])
// ---------------------------------------------------------------------------

const idHits = new Map(); // id -> [{file,line,text}]
const CODE_DIRS = ["apps", "libs", "tools", "docs", ".zibby/data"];

for (const persona of PERSONAS) {
  if (persona === "ledger") continue; // handled separately below (generic-word split)
  let hits = [];
  try {
    hits = grepHits(`${persona}-[a-z][a-z-]*`, CODE_DIRS);
  } catch {
    hits = [];
  }
  for (const hit of hits) {
    const m = new RegExp(`\\b(${persona}-[a-z][a-z0-9-]*)`, "i").exec(hit.text);
    if (!m) continue;
    const id = m[1].toLowerCase().replace(/[^a-z0-9-]+$/, "");
    if (!idHits.has(id)) idHits.set(id, []);
    idHits.get(id).push(hit);
  }
}

function proposedReplacement(id) {
  const [persona, ...rest] = id.split("-");
  const fw = FUNCTION_WORD[persona];
  if (!fw) return null;
  return [fw, ...rest].join("-");
}

// ---------------------------------------------------------------------------
// 4. "ledger" hits: generic word vs. subsystem id
// ---------------------------------------------------------------------------

let ledgerHits = [];
try {
  ledgerHits = grepHits("ledger", CODE_DIRS);
} catch {
  ledgerHits = [];
}
// The word "ledger" is overwhelmingly the generic finance concept here (BudgetLedgerStore,
// ReplyLedgerStore, ledger.store.ts, "the ledger", budget-ledger/, prose). It is the
// *subsystem id* only where it appears as a bare quoted string literal used as an id —
// `"ledger"` / `'ledger'` — e.g. `subsystem: "ledger"`, `s.id === "ledger"`,
// `roster("ledger")`, `.toContain("ledger")`, or the unquoted vault frontmatter `subsystem: ledger`.
const LEDGER_ID_RE = /(["'])ledger\1|^subsystem:\s*ledger\s*$|:\s*ledger\s*$/i;
const ledgerGeneric = [];
const ledgerSubsystemId = [];
for (const hit of ledgerHits) {
  if (LEDGER_ID_RE.test(hit.text.trim())) ledgerSubsystemId.push(hit);
  else ledgerGeneric.push(hit);
}

// ---------------------------------------------------------------------------
// 5. Exported TS symbols containing Subsystem/SUBSYSTEM
// ---------------------------------------------------------------------------

let symbolHits = [];
try {
  symbolHits = grepHitsPattern(
    "export (class|interface|type|const|function|enum)\\s+[A-Za-z_]*Subsystem[A-Za-z_]*",
    ["apps/api/src", "apps/web", "libs/contracts/src", "libs/design-system/src"],
  );
} catch {
  symbolHits = [];
}
const symbolRe =
  /export\s+(class|interface|type|const|function|enum)\s+([A-Za-z_]*Subsystem[A-Za-z_]*)/;
const symbolRows = []; // { name, kind, file, line }
const seenSymbol = new Set();
for (const hit of symbolHits) {
  const m = symbolRe.exec(hit.text);
  if (!m) continue;
  const key = `${m[2]}@${hit.file}`;
  if (seenSymbol.has(key)) continue;
  seenSymbol.add(key);
  symbolRows.push({ kind: m[1], name: m[2], file: hit.file, line: hit.line });
}
function proposedSymbolName(name) {
  return name
    .replace(/SUBSYSTEM/g, "DEPARTMENT")
    .replace(/Subsystem/g, "Department")
    .replace(/subsystem/g, "department");
}

// ---------------------------------------------------------------------------
// 6. i18n keys/values
// ---------------------------------------------------------------------------

const PERSONA_DISPLAY_NAMES = [
  "Forge",
  "Puls",
  "Sentinel",
  "Maestro",
  "Beacon",
  "Scout",
  "Herald",
  "Loom",
  "Codex",
  "Ledger",
  "Hearth",
];

function scanI18n(locale) {
  const path = join(ROOT, `apps/web/i18n/messages/${locale}.json`);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return { keys: [], values: [] };
  }
  const lines = raw.split("\n");
  const keys = [];
  const values = [];
  const KEY_RE = /^\s*"([^"]*subsystem[^"]*)"\s*:/i;
  lines.forEach((line, idx) => {
    const km = KEY_RE.exec(line);
    if (km) keys.push({ key: km[1], line: idx + 1 });
    for (const name of PERSONA_DISPLAY_NAMES) {
      // Only match on the VALUE side (after the colon), not arbitrary key text.
      const valueOnlyRe = new RegExp(`:\\s*"([^"]*\\b${name}\\b[^"]*)"`);
      const vm = valueOnlyRe.exec(line);
      if (vm) values.push({ persona: name, line: idx + 1, text: line.trim() });
    }
  });
  return { keys, values };
}

const i18nCs = scanI18n("cs");
const i18nEn = scanI18n("en");

// ---------------------------------------------------------------------------
// 7. API routes containing "subsystem"
// ---------------------------------------------------------------------------

let routeHits = [];
try {
  // ts-rest route defs: `path: "/subsystems..."` in libs/contracts/src, plus any literal
  // `/api/subsystems` string anywhere (docs, web fetches, e2e specs).
  routeHits = [
    ...grepHitsPattern("path:\\s*[\"'`]/?subsystems?", ["libs/contracts/src"]),
    ...grepHitsPattern("[\"'`]/?api/subsystems?", [
      "apps/api/src",
      "apps/web",
      "docs",
      "libs/contracts/src",
    ]),
  ];
  // De-dupe file:line.
  const seenRoute = new Set();
  routeHits = routeHits.filter((h) => {
    const key = `${h.file}:${h.line}`;
    if (seenRoute.has(key)) return false;
    seenRoute.add(key);
    return true;
  });
} catch {
  routeHits = [];
}

// ---------------------------------------------------------------------------
// 8. .zibby/data files/dirs affected
// ---------------------------------------------------------------------------

const dataFiles = allTrackedPaths(".zibby/data");
const dataFrontmatterHits = [];
const dataMocFiles = [];
const dataWikilinkHits = [];
const dataPersonaDirs = new Set();

for (const rel of dataFiles) {
  const base = rel.split("/").pop();
  if (/^subsystem-.*-moc\.md$/i.test(base)) dataMocFiles.push(rel);
  const topParts = rel.split("/");
  // .zibby/data/<X>/... — flag X if it's a persona name (herald/, maestro/, etc.)
  if (topParts.length > 3) {
    const sub = topParts[2];
    if (PERSONAS.includes(sub)) dataPersonaDirs.add(`.zibby/data/${sub}/`);
  }
}

let fmHits = [];
try {
  fmHits = grepHitsPattern("^(ownerSubsystem|subsystem):", [".zibby/data"]);
} catch {
  fmHits = [];
}
dataFrontmatterHits.push(...fmHits);

let wikilinkHits = [];
try {
  wikilinkHits = grepHitsPattern("\\[\\[subsystem-[a-z-]+-moc\\]\\]", [".zibby/data/vault"]);
} catch {
  wikilinkHits = [];
}
dataWikilinkHits.push(...wikilinkHits);

// ---------------------------------------------------------------------------
// Render markdown
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s).replace(/\|/g, "\\|");
}

const lines = [];
lines.push("# ZC-00 rename inventory — subsystem → department");
lines.push("");
lines.push(`Generated by \`tools/migrate/rename-inventory.mjs\` on ${new Date().toISOString()}.`);
lines.push("Read-only recon for Part 0 (ZC-01..ZC-05). Source of the id/function-word map:");
lines.push("`tools/migrate/zibbycorp-map.mjs`.");
lines.push("");

lines.push("## 1. Per-token file counts by top-level dir");
lines.push("");
lines.push(
  "`git grep -c` (case-insensitive). `subsystem` is a substring match (catches `subsystems`, " +
    "`SubsystemFoo`, `ownerSubsystem`) to mirror the I-6 grep gate in ROADMAP.md; persona ids " +
    "are word-bounded. File counts, not occurrence counts."
);
lines.push("");
lines.push(
  "Caveat: `apps/api/data-test` is a subdirectory of `apps/api`, so its files are counted in " +
    "both columns — the `total` column double-counts them. Treat `total` as an upper bound, not " +
    "a partition.",
);
lines.push("");
lines.push(`| token | ${TOP_LEVEL_DIRS.join(" | ")} | total |`);
lines.push(`|---|${TOP_LEVEL_DIRS.map(() => "---").join("|")}|---|`);
for (const token of TOKENS) {
  const row = TOP_LEVEL_DIRS.map(
    (dir) => countTable.find((r) => r.token === token && r.dir === dir).count,
  );
  const total = row.reduce((a, b) => a + b, 0);
  lines.push(`| ${token} | ${row.join(" | ")} | ${total} |`);
}
lines.push("");

lines.push("## 2. Tracked file/dir paths whose NAME contains a token (git mv candidates)");
lines.push("");
for (const token of TOKENS) {
  const set = pathHits.get(token);
  if (set.size === 0) continue;
  lines.push(`### \`${token}\` (${set.size})`);
  lines.push("");
  for (const p of [...set].sort()) lines.push(`- \`${p}\``);
  lines.push("");
}

lines.push("## 3. Persona-prefixed string-literal ids");
lines.push("");
lines.push(
  "Distinct ids matching `<persona>-<word>[-<word>...]`, with proposed neutral replacement.",
);
lines.push("");
const idRows = [...idHits.entries()].sort(([a], [b]) => a.localeCompare(b));
if (idRows.length === 0) {
  lines.push("_None found._");
} else {
  lines.push("| id | proposed | occurrences | file:line |");
  lines.push("|---|---|---|---|");
  for (const [id, hits] of idRows) {
    const proposed = proposedReplacement(id) ?? "(manual)";
    const locs = hits.map((h) => `${h.file}:${h.line}`).join("<br>");
    lines.push(`| \`${id}\` | \`${proposed}\` | ${hits.length} | ${locs} |`);
  }
}
lines.push("");

lines.push("## 4. `ledger` — generic word vs. subsystem id");
lines.push("");
lines.push(
  `Total \`ledger\` hits: ${ledgerHits.length}. Heuristic split (generic finance-word context vs. bare subsystem-id use) — verify by hand before ZC-05's \`check:names\`.`,
);
lines.push("");
lines.push(`### Likely generic word (${ledgerGeneric.length})`);
lines.push("");
for (const h of ledgerGeneric.slice(0, 200))
  lines.push(`- \`${h.file}:${h.line}\` — \`${esc(h.text.trim())}\``);
if (ledgerGeneric.length > 200) lines.push(`- … and ${ledgerGeneric.length - 200} more`);
lines.push("");
lines.push(`### Likely subsystem id (${ledgerSubsystemId.length})`);
lines.push("");
for (const h of ledgerSubsystemId.slice(0, 200))
  lines.push(`- \`${h.file}:${h.line}\` — \`${esc(h.text.trim())}\``);
if (ledgerSubsystemId.length > 200) lines.push(`- … and ${ledgerSubsystemId.length - 200} more`);
lines.push("");

lines.push("## 5. Exported TS symbols containing Subsystem/SUBSYSTEM");
lines.push("");
if (symbolRows.length === 0) {
  lines.push("_None found._");
} else {
  lines.push("| kind | symbol | proposed | file:line |");
  lines.push("|---|---|---|---|");
  for (const row of symbolRows.sort((a, b) => a.file.localeCompare(b.file))) {
    lines.push(
      `| ${row.kind} | \`${row.name}\` | \`${proposedSymbolName(row.name)}\` | ${row.file}:${row.line} |`,
    );
  }
}
lines.push("");

lines.push("## 6. i18n — apps/web/i18n/messages");
lines.push("");
lines.push(`### cs.json keys containing "Subsystem"/"subsystem" (${i18nCs.keys.length})`);
lines.push("");
for (const k of i18nCs.keys) lines.push(`- line ${k.line}: \`"${k.key}"\``);
lines.push("");
lines.push(`### cs.json values naming a persona (${i18nCs.values.length})`);
lines.push("");
for (const v of i18nCs.values) lines.push(`- line ${v.line} (${v.persona}): \`${esc(v.text)}\``);
lines.push("");
lines.push(`### en.json keys containing "Subsystem"/"subsystem" (${i18nEn.keys.length})`);
lines.push("");
for (const k of i18nEn.keys) lines.push(`- line ${k.line}: \`"${k.key}"\``);
lines.push("");
lines.push(`### en.json values naming a persona (${i18nEn.values.length})`);
lines.push("");
for (const v of i18nEn.values) lines.push(`- line ${v.line} (${v.persona}): \`${esc(v.text)}\``);
lines.push("");

lines.push("## 7. API routes containing `subsystem`");
lines.push("");
if (routeHits.length === 0) {
  lines.push(
    "_None found by the route-shaped filter — see §1/§3 for the broader `subsystem` grep._",
  );
} else {
  for (const h of routeHits) lines.push(`- \`${h.file}:${h.line}\` — \`${esc(h.text.trim())}\``);
}
lines.push("");

lines.push("## 8. `.zibby/data` affected");
lines.push("");
lines.push(
  `### Frontmatter \`ownerSubsystem:\` / \`subsystem:\` keys (${dataFrontmatterHits.length})`,
);
lines.push("");
for (const h of dataFrontmatterHits.slice(0, 300))
  lines.push(`- \`${h.file}:${h.line}\` — \`${esc(h.text.trim())}\``);
if (dataFrontmatterHits.length > 300)
  lines.push(`- … and ${dataFrontmatterHits.length - 300} more`);
lines.push("");
lines.push(`### Persona-named data dirs (${dataPersonaDirs.size}, from tracked files only)`);
lines.push("");
for (const d of [...dataPersonaDirs].sort()) lines.push(`- \`${d}\``);
lines.push(
  "- `.zibby/data/maestro/` — on disk (`merge-watch/`) but currently empty, so `git ls-files` finds no tracked file under it. ZC-02/ZC-03 must still move this dir (`herald/` → `comms/`, `maestro/` → `release/` per PART-0 ZC-02 §4).",
);
lines.push("");
lines.push(`### Vault MOC files \`subsystem-<id>-moc.md\` (${dataMocFiles.length})`);
lines.push("");
for (const f of dataMocFiles.sort()) lines.push(`- \`${f}\``);
lines.push("");
lines.push(`### Vault wikilinks \`[[subsystem-<id>-moc]]\` (${dataWikilinkHits.length})`);
lines.push("");
for (const h of dataWikilinkHits.slice(0, 300))
  lines.push(`- \`${h.file}:${h.line}\` — \`${esc(h.text.trim())}\``);
if (dataWikilinkHits.length > 300) lines.push(`- … and ${dataWikilinkHits.length - 300} more`);
lines.push("");

lines.push("---");
lines.push("");
lines.push(
  "Note: D-016 (uncommitted at generation time, in `docs/plans/zibbycorp/DECISIONS.md`) drops the read-tolerance layer described in D-004/PART-0 ZC-01 — no `legacy.ts`, `DepartmentIdSchema` stays a plain enum, and the persona map lives only in `tools/migrate/zibbycorp-map.mjs`. The `color` field on the department registry is *kept* until ZB-13 (not dropped in ZC-01).",
);
lines.push("");

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join("\n"), "utf8");

 
console.log(`Wrote ${OUT}`);
