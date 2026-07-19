#!/usr/bin/env node
/**
 * Documentation coverage/sync gate (docs/ops/validation-policy.md).
 *
 * Two independent checks:
 *
 * 1. Coverage (BLOCKING): every `apps/api/src/<module>` directory touched by
 *    the current diff must resolve to a doc file — via manifest.mjs's
 *    API_MODULE_DOC_MAP — that actually exists on disk. Catches "shipped a
 *    brand-new subsystem, never wrote a doc for it" (exactly what happened to
 *    companies/speech/self-knowledge/agent-factory before this tool existed).
 *    Fully deterministic: either the doc file exists or it doesn't.
 *
 * 2. Touch (informational in --scope=staged, BLOCKING in --scope=worktree):
 *    a module whose doc file exists but wasn't part of *this* diff, even
 *    though the module's own source was. At single-commit granularity this
 *    is just noise (most commits are small, unrelated to doc content), so
 *    pre-commit only warns. At whole-session granularity (Stop hook,
 *    --scope=worktree) it's a fair bar: if you touched a module all session
 *    and never once opened its doc, the hook pushes back before the turn ends.
 *
 * Mention checks (manifest.mjs's MENTION_CHECKS) are always advisory-only —
 * "is this directory name mentioned in the doc's prose" is too fuzzy to block
 * on, so they're never counted toward the exit code.
 *
 * Usage:
 *   node tools/docs-sync/check.mjs --scope=staged   # pre-commit: git diff --cached
 *   node tools/docs-sync/check.mjs --scope=worktree # Stop hook: git diff HEAD
 *   node tools/docs-sync/check.mjs --scope=worktree --json  # machine-readable summary
 *
 * Exit code: number of BLOCKING findings for the given scope (0 = clean).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_MODULE_DOC_MAP, MENTION_CHECKS } from "./manifest.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseArgs(argv) {
  const args = { scope: "staged", json: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--json") args.json = true;
    else if (raw.startsWith("--scope=")) args.scope = raw.slice("--scope=".length);
  }
  if (args.scope !== "staged" && args.scope !== "worktree") {
    throw new Error(`--scope must be "staged" or "worktree", got "${args.scope}"`);
  }
  return args;
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function changedFiles(scope) {
  const diffArgs =
    scope === "staged"
      ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]
      : ["diff", "HEAD", "--name-only", "--diff-filter=ACMR"];
  return git(diffArgs)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function touchedApiModules(files) {
  const modules = new Set();
  for (const file of files) {
    const match = /^apps\/api\/src\/([^/]+)\//.exec(file);
    if (match) modules.add(match[1]);
  }
  return modules;
}

function touchedMentionDirs(files, dirsGlob) {
  const names = new Set();
  for (const file of files) {
    if (!file.startsWith(`${dirsGlob}/`)) continue;
    const rest = file.slice(dirsGlob.length + 1);
    const top = rest.split("/")[0];
    if (top) names.add(top);
  }
  return names;
}

function docMentionsName(docPath, name) {
  const full = join(REPO_ROOT, docPath);
  if (!existsSync(full)) return false;
  const content = readFileSync(full, "utf8");
  // Loose match: the directory name appearing as a whole word anywhere.
  return new RegExp(`\\b${name}\\b`, "i").test(content);
}

function main() {
  const args = parseArgs(process.argv);
  const files = changedFiles(args.scope);

  const blocking = [];
  const advisory = [];

  // 1. Coverage — every touched apps/api/src module must have a real doc.
  for (const moduleName of touchedApiModules(files)) {
    if (!(moduleName in API_MODULE_DOC_MAP)) {
      blocking.push({
        kind: "missing-mapping",
        message: `apps/api/src/${moduleName}/ has no entry in tools/docs-sync/manifest.mjs — add a row (a new doc, or fold it into an existing one).`,
      });
      continue;
    }
    const docPath = API_MODULE_DOC_MAP[moduleName];
    if (docPath === null) continue; // intentionally undocumented (e.g. shared/)
    if (!existsSync(join(REPO_ROOT, docPath))) {
      blocking.push({
        kind: "missing-doc",
        message: `apps/api/src/${moduleName}/ changed but ${docPath} doesn't exist yet. Create it (see an existing docs/api/*.md for the expected shape).`,
      });
      continue;
    }
    const docTouched = files.includes(docPath);
    if (!docTouched) {
      const finding = {
        kind: "untouched-doc",
        message: `apps/api/src/${moduleName}/ changed but ${docPath} wasn't part of this ${args.scope === "staged" ? "commit" : "session"} — confirm it's still accurate, or update it.`,
      };
      if (args.scope === "worktree") blocking.push(finding);
      else advisory.push(finding);
    }
  }

  // 2. Mentions — advisory only, both scopes.
  for (const check of MENTION_CHECKS) {
    const dirsRoot = join(REPO_ROOT, check.dirsGlob);
    if (!existsSync(dirsRoot)) continue;
    const touched = touchedMentionDirs(files, check.dirsGlob);
    for (const name of touched) {
      if (!docMentionsName(check.doc, name)) {
        advisory.push({
          kind: "unmentioned",
          message: `${check.dirsGlob}/${name}/ changed but "${name}" isn't mentioned in ${check.doc} — consider adding it.`,
        });
      }
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ scope: args.scope, blocking, advisory }, null, 2));
  } else {
    if (blocking.length === 0 && advisory.length === 0) {
      console.log(`[docs-sync] clean (scope=${args.scope}).`);
    }
    for (const f of blocking) console.error(`[docs-sync][block] ${f.message}`);
    for (const f of advisory) console.warn(`[docs-sync][warn]  ${f.message}`);
  }

  process.exitCode = blocking.length;
}

main();
