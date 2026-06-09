#!/usr/bin/env node
// PreToolUse approval hook for real `claude -p` agent runs (replaces the old
// stdout-`INTENT` gate that demo scripts faked). Claude Code runs this BEFORE a
// Bash tool call, passing the call as JSON on stdin. A hook's stdout never reaches
// the parent process's pipe, so the gate is coordinated through files in the
// session's own sandbox cwd:
//
//   1. Non-destructive Bash → allow immediately (exit 0).
//   2. A destructive command (rm/rmdir/unlink/shred/trash) → announce it by writing
//      `intent-request.json` into cwd, then BLOCK polling for `intent-decision.json`.
//   3. RunnerCore watches cwd for the request, routes it through the gate evaluator
//      (allow / ask-a-human / deny), and writes the decision file the hook polls.
//   4. The hook returns the decision to Claude as `hookSpecificOutput`, which
//      overrides `--permission-mode dontAsk` (verified by spike).
//
// The cwd is the per-run sandbox (Claude runs there; the directory it cleans is a
// separate `--add-dir` grant), so these coordination files never pollute the target.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const REQUEST_FILE = "intent-request.json"
const DECISION_FILE = "intent-decision.json"
const POLL_MS = 200
const TIMEOUT_MS = 10 * 60 * 1000

/** True for shell commands that delete files — the only ops we gate. */
function isDestructive(command) {
  return /(^|[\s;&|(])(rm|rmdir|unlink|shred|trash)(\s|$)/.test(command)
}

/** Best-effort: pull the file targets out of an `rm`-style command for the card. */
function parseTargets(command) {
  return command
    .split(/\s+/)
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
  const deadline = Date.now() + TIMEOUT_MS
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
    if (Date.now() > deadline) return "deny"
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

  const cwd = input.cwd || process.cwd()
  const targets = parseTargets(command)
  const context = JSON.stringify({
    riskType: "delete",
    summary: `Delete ${targets.length} file(s)`,
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
  decide("deny", "Blocked by the gate (denied or timed out).")
}

main()
