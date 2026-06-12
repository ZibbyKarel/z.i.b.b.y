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
//   5. The hook NEVER outlives Claude Code's hook timeout: a hook killed at that
//      timeout is a NON-decision, and under `dontAsk` the pending command then
//      executes as if approved (verified empirically — this auto-ran a gated `rm`
//      in production). So the hook takes its own, shorter deadline as argv[2] and
//      DENIES fail-closed when it elapses, before the CLI can ever kill it.
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

/**
 * Fallback approval deadline when no argv deadline was passed (a non-RunnerCore
 * invocation). Claude Code kills a hook at its configured timeout — 600 s by
 * default — and treats the kill as a non-decision that lets the command run, so
 * the fallback must deny safely below that default.
 */
const DEFAULT_DEADLINE_S = 540

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

/**
 * Quote- and escape-aware tokenizer so a spaced target stays one token whether it
 * was quoted (`"zibby-ascii 2.txt"`) or backslash-escaped (`zibby-ascii\ 2.txt`).
 * The unquoted alternative consumes `\<char>` pairs so an escaped space doesn't end
 * the token; the captured text is then unescaped for display.
 */
function tokenize(command) {
  const tokens = []
  const re = /"([^"]*)"|'([^']*)'|((?:\\.|[^\s\\])+)/g
  let m
  while ((m = re.exec(command)) !== null) {
    const unquoted = m[3] === undefined ? undefined : m[3].replace(/\\(.)/g, "$1")
    tokens.push(m[1] ?? m[2] ?? unquoted)
  }
  return tokens
}

/**
 * Best-effort: pull the file targets out of an `rm`-style command for the card.
 * A clean/tidy agent typically chains several deletes (`rm a && rm b && rmdir c`),
 * so we split on the shell operators first and collect the positional args of each
 * rm-family segment — otherwise the operator and binary tokens (`&&`, `rm`, `rmdir`)
 * leak into the list and the count is wrong. Only the rm family lists its files as
 * positional args; for `find`/`git clean` the deletion set is implicit (a query /
 * the untracked set), so those segments contribute no explicit targets and the
 * command-string preview stays the source of truth.
 */
function parseTargets(command) {
  const targets = []
  for (const segment of command.split(/&&|\|\||;|\|/)) {
    const tokens = tokenize(segment.trim())
    if (!/^(rm|rmdir|unlink|shred|trash|trash-put)$/.test(tokens[0] ?? "")) continue
    for (const tok of tokens.slice(1)) {
      if (tok && !tok.startsWith("-")) targets.push(tok) // drop the binary + flags
    }
  }
  return targets
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

function waitForDecision(decisionFile, deadlineMs) {
  // The deadline must fire BEFORE Claude Code's own hook timeout: a hook killed by
  // the CLI emits no decision, and a missing decision under `dontAsk` lets the
  // command run as if approved. Blocking forever is therefore NOT a hard guarantee
  // — the only fail-closed shape is to deny ourselves first. RunnerCore passes the
  // deadline (argv) together with a hook timeout registered a margin above it.
  const startedAt = Date.now()
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
    if (Date.now() - startedAt >= deadlineMs) return "timeout"
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
  // `riskType` must be one of the gate's canonical types (platba/mazani/push/
  // odeslani) — the dashboard maps it to the risk icon + badge, and an unknown
  // value silently degrades to the payment (cart) presentation. The preview shape
  // must match the `command` preview the UI renders: `shell` + `cmd` (not a bare
  // `command` field), or the panel shows "undefined" where the shell/command go.
  const context = JSON.stringify({
    riskType: "mazani",
    summary: targets.length
      ? `Smazat ${targets.length} ${targets.length === 1 ? "položku" : "položek"}`
      : "Smazat soubory odpovídající příkazu",
    consequence: "Vypsané soubory budou nevratně odstraněny.",
    preview: {
      kind: "command",
      shell: "bash",
      cmd: command,
      note: targets.length ? `${targets.length} cílů` : undefined,
      targets,
    },
  })

  writeFileSync(
    path.join(cwd, REQUEST_FILE),
    JSON.stringify({ action: "delete", context }),
    "utf8",
  )

  const deadlineS = Number(process.argv[2])
  const deadlineMs =
    (Number.isFinite(deadlineS) && deadlineS > 0 ? deadlineS : DEFAULT_DEADLINE_S) * 1000

  const decision = waitForDecision(path.join(cwd, DECISION_FILE), deadlineMs)
  if (decision === "allow") decide("allow", "Approved by the gate.")
  if (decision === "timeout") {
    // Tidy up an unconsumed request so the stale gate artifact can't confuse a
    // later run sharing this sandbox (RunnerCore normally consumes it in ~200 ms).
    rmSync(path.join(cwd, REQUEST_FILE), { force: true })
    decide("deny", "Approval window elapsed with no decision — denied fail-safe.")
  }
  decide("deny", "Blocked by the gate (denied).")
}

main()
