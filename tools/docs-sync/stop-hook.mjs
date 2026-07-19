#!/usr/bin/env node
/**
 * Claude Code `Stop` hook (.claude/settings.json). Fires when the agent is
 * about to finish a turn. Runs the docs-sync coverage/touch check in
 * `--scope=worktree` mode (git diff HEAD — the whole session's uncommitted
 * work, not just this turn) and, if it finds a module whose source changed
 * but whose doc was never touched, blocks the stop and hands Claude a
 * concrete list of what to fix — turning the passive "DOCS-HINT" nudge
 * (PostToolUse, same settings.json) into an actual enforcement loop.
 *
 * Stop-hook JSON contract (see Claude Code docs): exit 0, stdout
 * `{"decision":"block","reason":"..."}` re-enters the agent loop with
 * `reason` fed in as context. There is no built-in re-entrancy guard for
 * Stop hooks, so this script keeps its own per-session attempt counter
 * (.cache/docs-sync/<session_id>.attempts, gitignored) and gives up after
 * MAX_ATTEMPTS — better to let a turn end with known-stale docs than to
 * trap the session in a loop it can't escape (e.g. docs genuinely can't be
 * reconciled without operator input).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAX_ATTEMPTS = 3;
const COUNTER_DIR = join(REPO_ROOT, ".cache", "docs-sync");

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function attemptPath(sessionId) {
  return join(COUNTER_DIR, `${sessionId || "unknown"}.attempts`);
}

function bumpAttempts(sessionId) {
  mkdirSync(COUNTER_DIR, { recursive: true });
  const path = attemptPath(sessionId);
  const current = existsSync(path) ? Number(readFileSync(path, "utf8")) || 0 : 0;
  const next = current + 1;
  writeFileSync(path, String(next));
  return next;
}

function clearAttempts(sessionId) {
  const path = attemptPath(sessionId);
  if (existsSync(path)) rmSync(path);
}

function runCheck() {
  try {
    const out = execFileSync(
      "node",
      [join(REPO_ROOT, "tools", "docs-sync", "check.mjs"), "--scope=worktree", "--json"],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    return JSON.parse(out);
  } catch (error) {
    // check.mjs exits non-zero when it finds blocking findings — that's not
    // a crash, its stdout is still the JSON report. execFileSync throws on
    // any non-zero exit, so recover the JSON from the error's stdout.
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout);
      } catch {
        // fall through
      }
    }
    // A genuine tool failure (not a git repo, node missing, etc.) — don't
    // block the user's turn on our own bug. Fail open.
    return { blocking: [], advisory: [] };
  }
}

function main() {
  const input = readStdin();
  const sessionId = input.session_id;

  const report = runCheck();
  if (report.blocking.length === 0) {
    clearAttempts(sessionId);
    process.exit(0);
  }

  const attempts = bumpAttempts(sessionId);
  if (attempts > MAX_ATTEMPTS) {
    clearAttempts(sessionId);
    process.exit(0);
  }

  const bullets = report.blocking.map((f) => `- ${f.message}`).join("\n");
  const reason = `Documentation is out of sync with the code changed this session (attempt ${attempts}/${MAX_ATTEMPTS}):\n${bullets}\n\nUpdate the listed docs/ files (or, if a listed doc genuinely doesn't need a change, make a trivial confirming edit — e.g. a comment or last-reviewed note — so it's part of this session's diff) before finishing.`;

  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

main();
