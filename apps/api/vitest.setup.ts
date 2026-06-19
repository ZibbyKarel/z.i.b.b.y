import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, sep } from "node:path"
import "reflect-metadata"
import { TEST_SYSTEM_CONFIG } from "./src/system/system-config.fixture"

/**
 * Phase 12.5 — global e2e isolation barrier (the meta-circular safety net).
 *
 * 26 of 28 e2e suites boot the full `AppModule`; only a couple isolate their
 * goal/data dirs. Without a global data-root override every un-isolated suite
 * reads and writes the repo's REAL `apps/api/data` — so one suite's pipeline/goal
 * run is `reconstruct()`ed by the next suite that boots (the cross-suite flake),
 * and the committed-`.env` `AGENT_RUNNER_MODE=claude` would drive a REAL `claude`
 * from inside the test run. That is exactly the "target IS ZIBBY" collapse the
 * Phase 12 RCA names. This setup runs once per forked test FILE (vitest forks
 * each file into its own process), before any `AppModule` boots, and hard-isolates
 * three things — each with `??=` so a suite that already chose its own value wins:
 *
 *   1. `ZIBBY_DATA_DIR` → a fresh temp root (every `*_DIR` fallback follows it).
 *   2. `AGENT_RUNNER_MODE` → `demo` (neutralises the local `.env` claude leak;
 *      `dotenv`/`ConfigModule` never overrides an already-set process.env var).
 *   3. `CLAUDE_BIN` → the token-free fake (the agent runner has no demo mode, so a
 *      reconstructed agent-maker goal must never reach real claude).
 *
 * The temp data root is SEEDED from the real data dir (agents, pipelines, skills,
 * projects, vault, gate-rules/mandate/budget/POLICY) so suites that read seeds
 * keep passing — but every volatile/runtime subtree (`runs/`, `goals`, `tasks`,
 * `activity`, `approvals`, `channels`, `proposals`, `credentials`, `budget-ledger`)
 * is filtered out, so nothing reconstructible is ever copied in.
 */

/** Runtime/volatile path segments never copied into the seeded test data root. */
const VOLATILE_SEGMENTS = new Set([
  "runs",
  "goals",
  "tasks",
  "activity",
  "approvals",
  "channels",
  "proposals",
  "credentials",
  "budget-ledger",
])

const cleanups: Array<() => void> = []

if (!process.env.ZIBBY_DATA_DIR) {
  const realData = join(__dirname, "data")
  const tempData = mkdtempSync(join(tmpdir(), "zibby-data-"))
  try {
    cpSync(realData, tempData, {
      recursive: true,
      filter: (src) => {
        const rel = relative(realData, src)
        if (!rel) return true
        return !rel.split(sep).some((segment) => VOLATILE_SEGMENTS.has(segment))
      },
    })
  } catch {
    // No real data dir (or a partial copy) is fine — suites that need a seed
    // set their own *_DIR; the isolation (an empty temp root) is what matters.
  }
  process.env.ZIBBY_DATA_DIR = tempData
  cleanups.push(() => rmSync(tempData, { recursive: true, force: true }))
}

// Phase 12.7: pin a per-file temp worktree root so run worktrees are cut OUTSIDE
// the data tree AND cleaned up — a test's `fs.rm(runsDir)` can no longer race a
// live worktree (the standing `ENOTEMPTY` cleanup flake).
if (!process.env.ZIBBY_WORKTREE_ROOT) {
  const dir = mkdtempSync(join(tmpdir(), "zibby-worktrees-"))
  process.env.ZIBBY_WORKTREE_ROOT = dir
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
}

// The runtime system config (tick intervals, channel adapter mode, goal auto-resume)
// is now file-backed, not env-driven. Seed a config file with the test defaults
// (every heartbeat OFF, fake channel adapter) and point SYSTEM_CONFIG_FILE at it —
// independent of any per-suite ZIBBY_DATA_DIR override, like ACTIVITY_DIR. A suite
// that needs a different knob writes this file (merged) before it boots the app.
if (!process.env.SYSTEM_CONFIG_FILE) {
  const dir = mkdtempSync(join(tmpdir(), "zibby-system-"))
  const file = join(dir, "system-config.json")
  writeFileSync(file, `${JSON.stringify(TEST_SYSTEM_CONFIG, null, 2)}\n`)
  process.env.SYSTEM_CONFIG_FILE = file
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
}

// Neutralise the committed `.env` `AGENT_RUNNER_MODE=claude` leak: tests run on
// the deterministic demo seam unless a suite explicitly opts into another mode.
process.env.AGENT_RUNNER_MODE ??= "demo"

// M8: keep the integration-poll retry/backoff effectively instant under test so a
// failing-poll case exercises the retry path without burning real wall-clock.
process.env.CHANNEL_POLL_BACKOFF_MS ??= "1"

// The agent runner always spawns real `claude` (no demo mode); pin the token-free
// fake so a reconstructed agent-maker can never reach the real binary.
process.env.CLAUDE_BIN ??= join(__dirname, "test", "fixtures", "fake-claude.mjs")

/**
 * Isolate the activity log per test FILE (Phase 6.1). `ActivityLogService` is
 * `@Global` and fires on every dispatch / approval / gate evaluation; pointing
 * `ACTIVITY_DIR` at its own fresh temp dir keeps each suite's log clean even
 * before the data-root override above (and stays independent of it).
 */
if (!process.env.ACTIVITY_DIR) {
  const dir = mkdtempSync(join(tmpdir(), "zibby-activity-"))
  process.env.ACTIVITY_DIR = dir
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
}

process.on("exit", () => {
  for (const cleanup of cleanups) {
    try {
      cleanup()
    } catch {
      // best-effort cleanup of the temp dirs
    }
  }
})
