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
import { promises as fs } from "node:fs"
import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"

const cwd = process.cwd()
const argv = process.argv.slice(2)

// Preflight seam: `claude --version` must answer before the main flow, or every
// run-starting e2e would execute the full fake session just to pass preflight.
if (argv.includes("--version")) {
  process.stdout.write("9.9.9 (fake-claude)\n")
  process.exit(0)
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
  const file = path.join(cwd, "intent-decision.json")
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
  await fs.writeFile(path.join(cwd, "intent-request.json"), JSON.stringify(action), "utf8")
  log("Waiting for approval…")
  return waitForDecision()
}

async function main() {
  log("Fake claude reporting for duty.")
  log("PROGRESS 0")
  await fs.writeFile(
    path.join(cwd, process.env.FAKE_CLAUDE_MARKER ?? "agent-007-was-here.txt"),
    `ran at ${new Date().toISOString()}\n`,
    "utf8",
  )

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
