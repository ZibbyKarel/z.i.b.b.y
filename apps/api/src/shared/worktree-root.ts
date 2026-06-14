import { mkdir } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

/**
 * Phase 12.7 — the base directory for run worktrees, deliberately OUTSIDE the repo
 * and the data tree.
 *
 * Goal/pipeline/agent worktrees were cut at `path.join(<runDir>, "worktree")` under
 * each runner's `*_RUNS_DIR` — i.e. inside `apps/api/data` (the watched/linted/tested
 * tree). So the dev watcher and a verifier's own `pnpm test` traversed them, the
 * builder edited files under its own feet, and a test's `fs.rm(runsDir)` raced the
 * live worktree (the standing `ENOTEMPTY` cleanup flake). This root must NOT derive
 * from `resolveDataRoot` — that is the whole point. Override with `ZIBBY_WORKTREE_ROOT`
 * (the vitest setup pins a temp one per test file; production defaults to the OS temp).
 */
export function resolveWorktreeRoot(): string {
  const root = process.env.ZIBBY_WORKTREE_ROOT
  return root ? path.resolve(root) : path.join(os.tmpdir(), "zibby-worktrees")
}

/**
 * Resolve the absolute worktree dir for `runId` and ensure its parent (the worktree
 * root) exists, so `git worktree add` can create the leaf. The `runId` is unique per
 * run, so leaves never collide; only forensic artifacts stay under `*_RUNS_DIR`.
 */
export async function prepareWorktreeDir(runId: string): Promise<string> {
  const root = resolveWorktreeRoot()
  await mkdir(root, { recursive: true })
  return path.join(root, runId)
}
