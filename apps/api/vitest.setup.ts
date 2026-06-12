import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import "reflect-metadata"

/**
 * Isolate the activity log per test FILE (Phase 6.1). `ActivityLogService` is
 * `@Global` and fires on every dispatch / approval / gate evaluation, so any e2e
 * suite that boots `AppModule` without a data-root override would otherwise append
 * into the repo's real `apps/api/data/activity` — and suites sharing one "today"
 * file would corrupt each other's activity assertions. Vitest runs each test file
 * in its own forked, isolated process (so this setup re-runs per file); pointing
 * `ACTIVITY_DIR` at a fresh temp dir here gives every suite its own log, unless the
 * suite has already chosen one explicitly.
 */
if (!process.env.ACTIVITY_DIR) {
  const dir = mkdtempSync(join(tmpdir(), "zibby-activity-"))
  process.env.ACTIVITY_DIR = dir
  process.on("exit", () => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup of the temp log dir
    }
  })
}
