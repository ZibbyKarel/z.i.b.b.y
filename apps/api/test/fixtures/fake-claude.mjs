#!/usr/bin/env node
// Token-free stand-in for the real `claude` CLI, used by e2e tests via `CLAUDE_BIN`.
// It speaks the claude-arg shape the runner builds and plays BOTH the claude session
// and its PreToolUse approval hook — so it exercises the production Variant B trigger
// (RunnerCore watching `cwd/intent-request.json`) without spending tokens.
//
// Behaviour is driven by env vars (the test sets them; the runner forwards process.env):
//   FAKE_CLAUDE_STEPS      progress steps (default 2)
//   FAKE_CLAUDE_DELAY_MS   ms per step (default 20)
//   FAKE_CLAUDE_MARKER     marker file written into cwd (default agent-007-was-here.txt)
//   FAKE_CLAUDE_INTENT     JSON IntendedAction → announced via intent-request.json; on
//                          allow writes FAKE_CLAUDE_RECEIPT, on deny exits non-zero
//   FAKE_CLAUDE_RECEIPT    receipt file written into cwd on an allowed intent
//                          (default payment-done.txt)
//   FAKE_CLAUDE_DELETE     comma-separated filenames (relative to the --add-dir grant)
//                          to delete behind a `delete` gate, mimicking the Cleaner
//   FAKE_CLAUDE_COMMIT     when set, make a file + `git add -A && git commit` in cwd
//                          (Phase 3.1: a run lands commits on its own zibby/* branch)
//   FAKE_CLAUDE_DUMP_ARGS_FILE  absolute path; dump the session's argv as JSON there
//                          (Phase 4: lets an e2e assert grounding reached
//                          --append-system-prompt)
import { execFileSync } from "node:child_process"
import { promises as fs } from "node:fs"
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"

const cwd = process.cwd()
const argv = process.argv.slice(2)

// The gate coordinates through RunnerCore's sandbox (pinned via ZIBBY_INTENT_DIR),
// NOT the child's cwd — which, once a worktree exists, is the worktree (spawnCwd),
// a directory the core never watches. Mirror the real hook: honour the env first.
const intentDir = process.env.ZIBBY_INTENT_DIR || cwd

// Preflight seam: `claude --version` and `claude auth status` must answer before
// the main flow, or every run-starting e2e would execute the full fake session
// just to pass preflight. FAKE_CLAUDE_LOGGED_OUT simulates a missing session.
if (argv.includes("--version")) {
  process.stdout.write("9.9.9 (fake-claude)\n")
  process.exit(0)
}
if (argv[0] === "auth" && argv[1] === "status") {
  const loggedIn = !process.env.FAKE_CLAUDE_LOGGED_OUT
  process.stdout.write(`${JSON.stringify({ loggedIn, subscriptionType: "max" })}\n`)
  process.exit(0)
}

// Phase 4: dump the real session's argv so an e2e can assert what reached the CLI
// (e.g. that the grounding block landed in --append-system-prompt). Best-effort.
if (process.env.FAKE_CLAUDE_DUMP_ARGS_FILE) {
  try {
    await fs.writeFile(process.env.FAKE_CLAUDE_DUMP_ARGS_FILE, JSON.stringify(argv), "utf8")
  } catch {
    // never block the run on a dump failure
  }
}

/** Collect every `--add-dir <dir>` value the runner passed. */
function grantDirs() {
  const dirs = []
  for (let i = 0; i < argv.length; i++) if (argv[i] === "--add-dir" && argv[i + 1]) dirs.push(argv[i + 1])
  return dirs
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (s) => process.stdout.write(`${s}\n`)

/** Block on the decision RunnerCore writes (mirrors the real hook). */
async function waitForDecision() {
  const file = path.join(intentDir, "intent-decision.json")
  const deadline = Date.now() + 60_000
  for (;;) {
    if (existsSync(file)) {
      let decision = "deny"
      try {
        decision = JSON.parse(readFileSync(file, "utf8")).decision === "allow" ? "allow" : "deny"
      } catch {
        decision = "deny"
      }
      rmSync(file, { force: true })
      return decision
    }
    if (Date.now() > deadline) return "deny"
    await sleep(50)
  }
}

async function announce(action) {
  await fs.writeFile(path.join(intentDir, "intent-request.json"), JSON.stringify(action), "utf8")
  log("Waiting for approval…")
  return waitForDecision()
}

/** Make a commit in cwd so a run lands work on its own zibby/* branch (Phase 3.1). */
function gitCommit() {
  const file = process.env.FAKE_CLAUDE_COMMIT_FILE ?? "feature.txt"
  execFileSync("git", ["add", "-A"], { cwd, stdio: "ignore" })
  // -c flags so the commit works even on a worktree without a configured identity.
  execFileSync(
    "git",
    ["-c", "user.email=fake@zibby.local", "-c", "user.name=Fake Claude", "commit", "-m", `feat: ${file}`],
    { cwd, stdio: "ignore" },
  )
}

async function main() {
  log("Fake claude reporting for duty.")
  log("PROGRESS 0")
  await fs.writeFile(
    path.join(cwd, process.env.FAKE_CLAUDE_MARKER ?? "agent-007-was-here.txt"),
    `ran at ${new Date().toISOString()}\n`,
    "utf8",
  )

  // Deterministic failure seam: exit non-zero right after starting, so tests can
  // assert error paths (failed runs, error outcomes) without gate machinery.
  if (process.env.FAKE_CLAUDE_FAIL) {
    log("Simulated failure.")
    process.exit(1)
  }

  // Phase 9: print the real usage-limit line + exit non-zero, so the run flows
  // through the production detectLimit/finalize path → `paused-limit`. The value is
  // the reset epoch (seconds), or "auto" → now + 2s (a near reset for fast e2e).
  if (process.env.FAKE_CLAUDE_LIMIT) {
    const raw = process.env.FAKE_CLAUDE_LIMIT
    const reset = raw === "auto" ? Math.floor(Date.now() / 1000) + 2 : Number(raw)
    log(`Claude AI usage limit reached|${reset}`)
    process.exit(1)
  }

  // Phase 3.1: land a commit on the run's branch (cwd is the worktree when one
  // exists). Ungated — a local commit is reversible, like koder's real commit.
  if (process.env.FAKE_CLAUDE_COMMIT) {
    const file = process.env.FAKE_CLAUDE_COMMIT_FILE ?? "feature.txt"
    await fs.writeFile(path.join(cwd, file), `work at ${new Date().toISOString()}\n`, "utf8")
    gitCommit()
    log(`Committed ${file}.`)
  }

  // Phase 3.3: write the stage's `produces` artifact (e.g. pr-draft.md) into the
  // sandbox the artifact endpoint reads from — that is the intent/coordination dir
  // (the stage's cwd), NOT the worktree spawn cwd. The PR draft must exist BEFORE
  // the gated chain is attempted (the card needs something to show).
  if (process.env.FAKE_CLAUDE_PRODUCE) {
    await fs.writeFile(
      path.join(intentDir, process.env.FAKE_CLAUDE_PRODUCE),
      process.env.FAKE_CLAUDE_PRODUCE_BODY ?? `# Draft\n\nGenerated at ${new Date().toISOString()}\n`,
      "utf8",
    )
  }

  const steps = Number(process.env.FAKE_CLAUDE_STEPS) || 2
  const delay = Number(process.env.FAKE_CLAUDE_DELAY_MS) || 20
  const half = Math.floor(steps / 2)
  for (let i = 1; i <= half; i++) {
    await sleep(delay)
    log(`PROGRESS ${Math.round((i / steps) * 100)}`)
  }

  // Gate A: a generic intended action (approvals tests).
  if (process.env.FAKE_CLAUDE_INTENT) {
    const decision = await announce(JSON.parse(process.env.FAKE_CLAUDE_INTENT))
    if (decision !== "allow") {
      log("Action denied — aborting.")
      process.exit(1)
    }
    await fs.writeFile(
      path.join(cwd, process.env.FAKE_CLAUDE_RECEIPT ?? "payment-done.txt"),
      `done at ${new Date().toISOString()}\n`,
      "utf8",
    )
    // Phase 3.3: only AFTER an allow, execute the gated chain the gate just cleared
    // (push + `gh pr create`) — the held-child-is-the-executor model. A `gh` shim on
    // a prepended PATH records the invocation; nothing here runs before the allow.
    if (process.env.FAKE_CLAUDE_EXEC_CMD) {
      const env = { ...process.env }
      if (process.env.FAKE_CLAUDE_PATH_PREPEND) {
        env.PATH = `${process.env.FAKE_CLAUDE_PATH_PREPEND}${path.delimiter}${process.env.PATH ?? ""}`
      }
      execFileSync("/bin/sh", ["-c", process.env.FAKE_CLAUDE_EXEC_CMD], { cwd, env, stdio: "ignore" })
      log("Executed the approved command.")
    }
  }

  // Gate B: a delete action over the granted directory (Cleaner test).
  if (process.env.FAKE_CLAUDE_DELETE) {
    const target = grantDirs()[0] ?? cwd
    const targets = process.env.FAKE_CLAUDE_DELETE.split(",").map((s) => s.trim()).filter(Boolean)
    const command = `rm ${targets.join(" ")}`
    const context = JSON.stringify({
      riskType: "delete",
      summary: `Delete ${targets.length} file(s)`,
      consequence: "The listed files will be permanently removed.",
      preview: { kind: "command", command, targets },
    })
    const decision = await announce({ action: "delete", context })
    if (decision !== "allow") {
      log("Deletion denied — leaving every file untouched.")
      process.exit(1)
    }
    for (const t of targets) await fs.rm(path.join(target, t), { force: true }).catch(() => {})
  }

  for (let i = half + 1; i <= steps; i++) {
    await sleep(delay)
    log(`PROGRESS ${Math.round((i / steps) * 100)}`)
  }
  log("PROGRESS 100")
  log("Done.")
}

main().catch((err) => {
  log(`fake-claude error: ${err?.message ?? err}`)
  process.exit(1)
})
