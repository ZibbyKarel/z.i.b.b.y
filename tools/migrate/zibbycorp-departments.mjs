#!/usr/bin/env node
// ZibbyCorp department migration (ZC-03 / D-004, D-013, D-016).
//
// Rewrites a `.zibby/data`-shaped directory so every subsystem id, field name,
// and vault note reflects the new department vocabulary. Dry-run by default;
// `--apply` backs the whole tree up first, then writes. Idempotent: a second
// `--apply` run reports zero changes.
//
// This file reuses `zibbycorp-map.mjs` (DEPARTMENT_ID / FUNCTION_WORD / rewrite /
// rewritePath) for every generic conversion. It adds only the data-specific
// passes the shared map cannot express on its own:
//   - YAML/JSON field VALUES (ownerSubsystem/department/subsystem/from) must
//     become the short DepartmentId ("qa"), not the prose function word
//     ("arch") the generic map produces for bare/compound identifiers.
//   - `ledger` is excluded from the shared map's auto rules (too generic a
//     word — "budget-ledger", "reply-ledger"), so it gets its own narrow,
//     context-guarded pass here.
//   - Vault MOC filenames/wikilinks need the short id, and MOC display text
//     needs the full department display name, not the function word.
//   - `chains/` is purged, not rewritten.
//
// Usage:
//   node tools/migrate/zibbycorp-departments.mjs --data <dir> [--apply] [--report <file>]

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTO_PERSONAS, DEPARTMENT_ID, rewrite, rewritePath } from "./zibbycorp-map.mjs";

/** Old subsystem id -> full department display name (D-004 id table). */
export const DISPLAY_NAME = {
  dev: "Development",
  ops: "Monitoring & Ops",
  sec: "Security",
  rel: "Release Management",
  inc: "Incident Response",
  rnd: "R&D",
  com: "Communications",
  qa: "QA & Architecture",
  knw: "Knowledge Management",
  fin: "Finance",
  per: "Personal Office",
};

/** Every persona the migration knows about, including `ledger` (id-context only). */
export const ALL_PERSONAS = Object.keys(DEPARTMENT_ID);

const TEXT_EXTENSIONS = new Set([".md", ".json", ".jsonl", ".yaml", ".yml", ".txt"]);

const TOP_SKIP = new Set(["_purged"]);
/**
 * Inbound third-party content (Law 4: inbound is data) — never rewritten. Jira/GitHub/
 * Slack text legitimately says "Atlassian Forge", "OpenAI Codex", …; these dirs carry no
 * structural department ids. Backed up, never migrated.
 */
const INBOUND_SKIP = new Set(["channels", "roadmap", "integration-state"]);
const isBackupDir = (name) => /^_backup-/.test(name) || name === ".git";

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Content passes
// ---------------------------------------------------------------------------

const ID_CONTEXT_KEYS = ["ownerSubsystem", "department", "subsystem"];

/**
 * Fix the one gap in the shared map's generic pass: a bare/quoted persona
 * value under a department-id field must become the short id ("qa"), not the
 * map's default prose function word ("arch"). Runs BEFORE the generic pass so
 * the generic pass never sees these personas (its output — a new id — never
 * collides with an old persona name, so this is safe to do first).
 */
function rewriteIdFieldValues(text, personas) {
  let out = text;
  for (const persona of personas) {
    const id = DEPARTMENT_ID[persona];
    for (const key of ID_CONTEXT_KEYS) {
      // YAML/frontmatter bare scalar: `  ownerSubsystem: forge`
      out = out.replace(
        new RegExp(String.raw`(^[ \t]*${key}[ \t]*:[ \t]*)${persona}([ \t]*)$`, "gm"),
        (_m, pre, trail) => `${pre}${id}${trail}`,
      );
    }
  }
  return out;
}

/**
 * `ledger` is excluded from the shared map's auto rules on purpose (it's a
 * generic English word — "budget-ledger", "reply-ledger" — so a blanket
 * replace would corrupt unrelated paths/content). This pass only touches it
 * where it is unambiguously the subsystem id: the department-id field keys
 * (bare or quoted), the `from` field of a handoff signal, and the `id` of a
 * `{kind:"subsystem"|"department", id:"ledger"}` target object.
 */
function rewriteLedgerIdContexts(text) {
  let out = text;
  const id = DEPARTMENT_ID.ledger; // "fin"

  for (const key of [...ID_CONTEXT_KEYS, "from"]) {
    // YAML/frontmatter bare scalar
    out = out.replace(
      new RegExp(String.raw`(^[ \t]*${key}[ \t]*:[ \t]*)ledger([ \t]*)$`, "gm"),
      (_m, pre, trail) => `${pre}${id}${trail}`,
    );
    // JSON quoted scalar
    out = out.replace(
      new RegExp(String.raw`("${key}"[ \t]*:[ \t]*")ledger(")`, "g"),
      (_m, pre, post) => `${pre}${id}${post}`,
    );
  }

  // `{"kind": "subsystem"|"department", "id": "ledger"}` target objects, either
  // key order, tolerant of formatting between the two keys but not across `{}`.
  out = out.replace(
    /("kind"\s*:\s*"(?:subsystem|department)"[^{}]*?"id"\s*:\s*")ledger(")/gs,
    (_m, pre, post) => `${pre}${id}${post}`,
  );
  out = out.replace(
    /("id"\s*:\s*")ledger("[^{}]*?"kind"\s*:\s*"(?:subsystem|department)")/gs,
    (_m, pre, post) => `${pre}${id}${post}`,
  );

  return out;
}

/**
 * Vault wikilinks: `[[subsystem-<persona>-moc]]` (optionally with a `#anchor`
 * or `|alias`) must point at the renamed file, which uses the short id
 * (`department-qa-moc`), matching the filename rewrite below — not the
 * generic map's prose function word.
 */
function rewriteVaultWikilinks(text) {
  let out = text;
  for (const persona of ALL_PERSONAS) {
    const id = DEPARTMENT_ID[persona];
    out = out.replace(
      new RegExp(String.raw`\[\[subsystem-${persona}-moc(#[^\]|]*)?(\|[^\]]*)?\]\]`, "g"),
      (_m, anchor, alias) => `[[department-${id}-moc${anchor ?? ""}${alias ?? ""}]]`,
    );
  }
  return out;
}

/**
 * MOC display text: a capitalized, standalone mention of the old persona name
 * (title, opening sentence, a cross-reference in another note) becomes the
 * full department display name, not the map's abbreviated function word.
 * Scoped to vault/** content only.
 */
function rewriteVaultDisplayNames(text) {
  let out = text;
  for (const persona of ALL_PERSONAS) {
    const display = DISPLAY_NAME[DEPARTMENT_ID[persona]];
    const P = cap(persona);
    out = out.replace(new RegExp(String.raw`(?<![A-Za-z])${P}(?![a-z])`, "g"), display);
  }
  return out;
}

const isVaultPath = (relPath) => relPath === "vault" || relPath.startsWith("vault/");
// Only the agent/pipeline DEFINITION files directly under `agents/`/`pipelines/`
// (e.g. `agents/foo.md`, `pipelines/foo.pipeline.md`) — NOT their `runs/**`
// execution artifacts (reports, logs, prompts), which get the full pipeline
// like any other data file.
const isFrontmatterOnlyPath = (relPath) => /^(agents|pipelines)\/[^/]+\.md$/.test(relPath);

const FRONTMATTER_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/;

/** Runs the migration pipeline over one blob of text (no path-scoped rules). */
function migrateBlock(text) {
  let out = text;
  out = rewriteLedgerIdContexts(out);
  out = rewriteIdFieldValues(out, AUTO_PERSONAS);
  out = rewrite(out); // shared generic pass — everything else
  return out;
}

/**
 * Full content pipeline for one file, given its ORIGINAL repo-relative path.
 *
 * `agents/*.md` and `pipelines/*.md`: PART-0 is explicit that only the
 * frontmatter is mapped — "Body text is untouched" — so only the block
 * between the `---` fences goes through the pipeline; the prose body (which
 * may itself mention persona words in unrelated markdown, e.g. an agent
 * describing "Forge" the metalworking process) is left exactly as written.
 */
export function migrateContent(text, relPath) {
  if (isFrontmatterOnlyPath(relPath)) {
    const m = FRONTMATTER_RE.exec(text);
    if (!m) return text; // no frontmatter fence — nothing to migrate
    const [, open, inner, close] = m;
    const migratedInner = migrateBlock(inner);
    return open + migratedInner + close + text.slice(m[0].length);
  }

  let out = text;
  if (isVaultPath(relPath)) {
    out = rewriteVaultWikilinks(out);
    out = rewriteVaultDisplayNames(out);
  }
  return migrateBlock(out);
}

// ---------------------------------------------------------------------------
// Path rewriting
// ---------------------------------------------------------------------------

const MOC_RE = /^subsystem-([a-z]+)-moc\.md$/;

/** Full path pipeline for one repo-relative path. */
export function migratePath(relPath) {
  const parts = relPath.split("/");
  const newParts = parts.map((part, i) => {
    if (i === parts.length - 1) {
      const m = MOC_RE.exec(part);
      if (m && DEPARTMENT_ID[m[1]]) {
        return `department-${DEPARTMENT_ID[m[1]]}-moc.md`;
      }
    }
    return rewritePath(part);
  });
  return newParts.join("/");
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function isTextFile(relPath) {
  const dot = relPath.lastIndexOf(".");
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(relPath.slice(dot).toLowerCase());
}

/** List every file (relative, POSIX-separated) under `dir`, skipping backups/purged/git. */
function walkFiles(dir, base = dir, skipTopChains = true) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(base, full).split(sep).join("/");
    const isTop = dirname(rel) === ".";
    if (isTop && (TOP_SKIP.has(entry.name) || isBackupDir(entry.name))) continue;
    if (isTop && skipTopChains && entry.name === "chains") continue;
      if (isTop && skipTopChains && INBOUND_SKIP.has(entry.name)) continue;
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, base, skipTopChains));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FilePlan
 * @property {string} oldRel
 * @property {string} newRel
 * @property {boolean} isText
 * @property {boolean} pathChanged
 * @property {boolean} contentChanged
 * @property {string|Buffer} newContent
 */

function planFiles(dataDir) {
  const files = walkFiles(dataDir, dataDir);
  const plans = [];
  for (const oldRel of files) {
    const full = join(dataDir, oldRel);
    const newRel = migratePath(oldRel);
    const text = isTextFile(oldRel);
    let newContent;
    let contentChanged = false;
    if (text) {
      const original = readFileSync(full, "utf8");
      newContent = migrateContent(original, oldRel);
      contentChanged = newContent !== original;
    } else {
      newContent = readFileSync(full); // Buffer, copied verbatim
    }
    plans.push({
      oldRel,
      newRel,
      isText: text,
      pathChanged: newRel !== oldRel,
      contentChanged,
      newContent,
    });
  }
  return plans;
}

function planChains(dataDir, timestamp) {
  const chainsDir = join(dataDir, "chains");
  if (!existsSync(chainsDir) || !statSync(chainsDir).isDirectory()) return null;
  const files = walkFiles(chainsDir, chainsDir, false);
  return {
    sourceRel: "chains",
    targetRel: `_purged/chains-${timestamp}`,
    fileCount: files.length,
  };
}

/** Validate move targets: collisions must resolve to byte-identical content. */
function validatePlans(dataDir, plans) {
  const byTarget = new Map();
  for (const p of plans) {
    if (!byTarget.has(p.newRel)) byTarget.set(p.newRel, []);
    byTarget.get(p.newRel).push(p);
  }

  const errors = [];
  const sameBytes = (a, b) => {
    if (Buffer.isBuffer(a) || Buffer.isBuffer(b))
      return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
    return a === b;
  };

  for (const [target, group] of byTarget) {
    if (group.length > 1) {
      const [first, ...rest] = group;
      for (const other of rest) {
        if (!sameBytes(first.newContent, other.newContent)) {
          errors.push(
            `merge conflict at "${target}": "${first.oldRel}" and "${other.oldRel}" both map here with different content`,
          );
        }
      }
    }
    // A target that already exists on disk, under a DIFFERENT original path,
    // must be identical or we abort before writing anything.
    const sources = new Set(group.map((p) => p.oldRel));
    if (!sources.has(target)) {
      const existingFull = join(dataDir, target);
      if (existsSync(existingFull) && statSync(existingFull).isFile()) {
        const existing = group[0].isText
          ? readFileSync(existingFull, "utf8")
          : readFileSync(existingFull);
        if (!sameBytes(existing, group[0].newContent)) {
          errors.push(
            `move target "${target}" already exists with different content (source: "${group[0].oldRel}")`,
          );
        }
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function classify(p) {
  if (p.pathChanged && p.contentChanged) return "EDIT+MOVE";
  if (p.pathChanged) return "MOVE";
  if (p.contentChanged) return "EDIT";
  return "UNCHANGED";
}

function buildReport({ dataDir, apply, plans, chains, backupDir }) {
  const lines = [];
  lines.push(`# ZibbyCorp department migration${apply ? " (applied)" : " (dry run)"}`);
  lines.push("");
  lines.push(`Data dir: \`${dataDir}\``);
  lines.push("");

  const changed = plans.filter((p) => p.pathChanged || p.contentChanged);
  const unchanged = plans.length - changed.length;

  const counts = { EDIT: 0, MOVE: 0, "EDIT+MOVE": 0 };
  for (const p of changed) counts[classify(p)]++;

  lines.push("## Totals");
  lines.push("");
  lines.push(`- Files scanned: ${plans.length}`);
  lines.push(`- Edited (content only): ${counts.EDIT}`);
  lines.push(`- Moved (path only): ${counts.MOVE}`);
  lines.push(`- Edited + moved: ${counts["EDIT+MOVE"]}`);
  lines.push(`- Unchanged: ${unchanged}`);
  if (chains)
    lines.push(`- Purged: \`chains/\` -> \`${chains.targetRel}/\` (${chains.fileCount} files)`);
  if (apply && backupDir) lines.push(`- Backup: \`${backupDir}\``);
  lines.push("");

  lines.push("## Changes");
  lines.push("");
  if (changed.length === 0 && !chains) {
    lines.push("(none)");
  } else {
    for (const p of changed) {
      const kind = classify(p);
      if (kind === "EDIT") lines.push(`- EDIT \`${p.oldRel}\``);
      else lines.push(`- ${kind} \`${p.oldRel}\` -> \`${p.newRel}\``);
    }
    if (chains)
      lines.push(`- PURGE \`chains/\` -> \`${chains.targetRel}/\` (${chains.fileCount} files)`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Copies the whole data dir to `_backup-zibbycorp-<ISO>/`, skipping existing
 * `_backup-*`/`_purged` dirs. Copies file-by-file (not `cpSync(src, dest)`
 * directly) because `dest` is necessarily nested under `src` here, which
 * `cpSync` refuses outright regardless of any filter.
 */
function backupDataDir(dataDir, timestamp) {
  const backupDir = join(dataDir, `_backup-zibbycorp-${timestamp}`);
  const files = walkFiles(dataDir, dataDir, false); // include chains/, exclude _backup-*/_purged
  for (const rel of files) {
    const src = join(dataDir, rel);
    const dest = join(backupDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
  return backupDir;
}

function writePlans(dataDir, plans) {
  const newTargets = new Set(plans.map((p) => p.newRel));
  // Write every changed file to its new location first. A handful of pipeline
  // run artifacts are stored read-only (immutable stage output); temporarily
  // restore owner-write to overwrite them in place, then restore their
  // original mode so the migration doesn't quietly loosen permissions.
  for (const p of plans) {
    if (!p.pathChanged && !p.contentChanged) continue;
    const destFull = join(dataDir, p.newRel);
    mkdirSync(dirname(destFull), { recursive: true });

    let originalMode = null;
    if (existsSync(destFull)) {
      const st = statSync(destFull);
      if ((st.mode & 0o200) === 0) {
        originalMode = st.mode;
        chmodSync(destFull, st.mode | 0o200);
      }
    }

    if (p.isText) {
      writeFileSync(destFull, p.newContent, "utf8");
    } else {
      writeFileSync(destFull, p.newContent);
    }

    if (originalMode !== null) chmodSync(destFull, originalMode);
  }
  // Then remove stale old paths that moved and are not themselves a target.
  for (const p of plans) {
    if (!p.pathChanged) continue;
    if (newTargets.has(p.oldRel)) continue; // still needed as someone else's target
    const oldFull = join(dataDir, p.oldRel);
    if (existsSync(oldFull)) unlinkSync(oldFull);
  }
}

function purgeChains(dataDir, chains) {
  if (!chains) return;
  const src = join(dataDir, chains.sourceRel);
  const dest = join(dataDir, chains.targetRel);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(src, dest);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function runMigration({ dataDir, apply = false, reportPath = null }) {
  if (!existsSync(dataDir) || !statSync(dataDir).isDirectory()) {
    throw new Error(`--data dir does not exist or is not a directory: ${dataDir}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const plans = planFiles(dataDir);
  const chains = planChains(dataDir, timestamp);

  const errors = validatePlans(dataDir, plans);
  if (errors.length > 0) {
    throw new Error(
      `Migration aborted, nothing written:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  let backupDir = null;
  if (apply) {
    backupDir = backupDataDir(dataDir, timestamp);
    writePlans(dataDir, plans);
    purgeChains(dataDir, chains);
  }

  const report = buildReport({ dataDir, apply, plans, chains, backupDir });
  if (reportPath) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, report, "utf8");
  }

  const changed = plans.filter((p) => p.pathChanged || p.contentChanged);
  return {
    plans,
    chains,
    backupDir,
    report,
    changedCount: changed.length + (chains ? 1 : 0),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { apply: false, data: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.apply = true;
    else if (a === "--data") args.data = argv[++i];
    else if (a === "--report") args.report = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.data) throw new Error("--data <dir> is required");
  return args;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}`);
    console.error(
      "usage: node tools/migrate/zibbycorp-departments.mjs --data <dir> [--apply] [--report <file>]",
    );
    process.exit(1);
  }

  try {
    const result = runMigration({ dataDir: args.data, apply: args.apply, reportPath: args.report });
    console.log(result.report);
    if (args.report) console.log(`\nReport written to ${args.report}`);
    process.exit(0);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
