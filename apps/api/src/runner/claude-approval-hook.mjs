#!/usr/bin/env node
// PreToolUse approval hook for real `claude -p` agent runs (replaces the old
// stdout-`INTENT` gate that demo scripts faked). Claude Code runs this BEFORE a
// Bash tool call, passing the call as JSON on stdin. A hook's stdout never reaches
// the parent process's pipe, so the gate is coordinated through files in the
// session's own sandbox cwd:
//
//   1. Non-destructive Bash → allow immediately (exit 0).
//   2. A destructive command (the rm family, plus `find … -delete` and `git clean`,
//      which delete with no rm token to catch) → announce it by writing
//      `intent-request.json` into cwd, then BLOCK polling for `intent-decision.json`.
//   3. RunnerCore watches cwd for the request, routes it through the gate evaluator
//      (allow / ask-a-human / deny), and writes the decision file the hook polls.
//   4. The hook returns the decision to Claude as `hookSpecificOutput`, which
//      overrides `--permission-mode dontAsk` (verified by spike).
//
// The coordination directory is the run's sandbox, passed explicitly by RunnerCore as
// `ZIBBY_INTENT_DIR`. We must NOT use the Bash call's own cwd: a clean/tidy agent runs
// `rm …` *inside* the granted `--add-dir` target (that's its working dir), so trusting
// `input.cwd` would drop the request into the target — where the core never watches —
// stranding the gate and leaving a stray `intent-request.json` behind. The env var
// keeps both sides pointed at the same sandbox regardless of where the command runs.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const REQUEST_FILE = "intent-request.json"
const DECISION_FILE = "intent-decision.json"
const POLL_MS = 200

// File-removal binaries invoked directly. The leading class covers command
// boundaries (start, separators, subshells, command-substitution) so `$(rm …)`
// and `` `rm …` `` are caught too, not just a bare `rm` at column 0.
const RM_FAMILY = /(^|[\s;&|(`])(rm|rmdir|unlink|shred|trash|trash-put)(\s|$)/

/**
 * True for shell commands that delete files — the only ops we gate. A denylist is
 * inherently leaky, but it must at least cover the idioms an autonomous tidy/clean
 * agent actually reaches for: the rm family, `find … -delete` (the canonical
 * `.DS_Store` sweep, which carries no rm token), and `git clean` (removes untracked
 * files). `find … -exec rm …` is already covered by RM_FAMILY via its `rm` token.
 */
function isDestructive(command) {
  if (RM_FAMILY.test(command)) return true
  if (/\bfind\b[\s\S]*\s-delete(\s|$)/.test(command)) return true
  // `git clean` as an adjacent subcommand — not the word "clean" anywhere after
  // `git` (which would gate a harmless `git commit -m "clean up"`).
  if (/\bgit\s+clean(\s|$)/.test(command)) return true
  return false
}

/** Quote-aware tokenizer so a target like `"zibby-ascii 2.txt"` stays one token. */
function tokenize(command) {
  const tokens = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m
  while ((m = re.exec(command)) !== null) tokens.push(m[1] ?? m[2] ?? m[3])
  return tokens
}

/**
 * Best-effort: pull the file targets out of an `rm`-style command for the card.
 * Only the rm family lists its files as positional args; for `find`/`git clean`
 * the deletion set is implicit (a query / the untracked set), so we list no
 * explicit targets and let the command-string preview be the source of truth.
 */
function parseTargets(command) {
  const tokens = tokenize(command)
  if (!/^(rm|rmdir|unlink|shred|trash|trash-put)$/.test(tokens[0] ?? "")) return []
  return tokens
    .slice(1) // drop the binary
    .filter((tok) => tok && !tok.startsWith("-")) // drop flags
}

/** Emit a PreToolUse decision and exit. `allow` overrides dontAsk; `deny` blocks. */
function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision,
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}

function waitForDecision(decisionFile) {
  // No deadline: the gate is a hard guarantee, so the hook blocks until a human
  // (or the gate evaluator) decides. A timeout here would let the session carry
  // on without the approval — the run would "finish" as if it had been confirmed.
  // An abandoned run is ended by rejecting or deleting it, which kills this hook
  // along with the whole process group.
  for (;;) {
    if (existsSync(decisionFile)) {
      let decision = "deny"
      try {
        decision = JSON.parse(readFileSync(decisionFile, "utf8")).decision === "allow"
          ? "allow"
          : "deny"
      } catch {
        decision = "deny"
      }
      rmSync(decisionFile, { force: true })
      return decision
    }
    // Busy-block is acceptable: the hook is a short-lived child whose whole job is
    // to wait. A small synchronous sleep keeps the CPU idle between polls.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS)
  }
}

function main() {
  let input
  try {
    input = JSON.parse(readFileSync(0, "utf8"))
  } catch {
    // Can't parse the event → don't gate; let Claude's own permissions decide.
    process.exit(0)
  }

  const command = input?.tool_input?.command ?? ""
  if (input?.tool_name !== "Bash" || !isDestructive(command)) process.exit(0)

  // The sandbox RunnerCore watches — pinned via env, not the command's cwd (which is
  // the granted target the agent is operating on). Fall back to the call's cwd only if
  // the env var is somehow absent (e.g. a non-RunnerCore invocation).
  const cwd = process.env.ZIBBY_INTENT_DIR || input.cwd || process.cwd()
  const targets = parseTargets(command)
  const context = JSON.stringify({
    riskType: "delete",
    summary: targets.length ? `Delete ${targets.length} file(s)` : "Delete files matched by the command",
    consequence: "The listed files will be permanently removed.",
    preview: { kind: "command", command, targets },
  })

  writeFileSync(
    path.join(cwd, REQUEST_FILE),
    JSON.stringify({ action: "delete", context }),
    "utf8",
  )

  const decision = waitForDecision(path.join(cwd, DECISION_FILE))
  if (decision === "allow") decide("allow", "Approved by the gate.")
  decide("deny", "Blocked by the gate (denied).")
}

main()
