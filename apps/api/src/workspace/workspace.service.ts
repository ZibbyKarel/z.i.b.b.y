import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { Injectable, Optional } from "@nestjs/common"
import type { Workspace } from "@zibby/contracts"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"

const exec = promisify(execFile)

/** Git invocations are local-only (no fetch/pull) — a short timeout bounds a hang. */
const GIT_TIMEOUT_MS = 10_000

/** Hard cap on a sanitized branch slug, leaving room under git's ref-name limits. */
const SLUG_MAX = 60

/** Raised when worktree creation fails on a *git* project — the run must not silently
 * touch the operator's main checkout, so the caller surfaces this rather than falling
 * back to direct-checkout (which is reserved for non-git projects). */
export class WorkspaceSetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspaceSetupError"
  }
}

/**
 * Sanitize a free-form slug source (pipeline id / agent id / task title) into the
 * trailing segment of a `zibby/<runId>-<slug>` branch name: lowercase, only
 * `[a-z0-9-]`, collapsed dash runs, trimmed, capped. Empty input → `run` so the
 * branch is always well-formed. A pure exported helper (unit-tested directly).
 */
export function sanitizeBranchSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "")
  return slug || "run"
}

/**
 * Owns the per-run git worktree (Phase 3.1). A project-targeted run works on its
 * own branch in a worktree under the run dir — never the operator's main checkout —
 * so koder's commits are visible to review/verify and the PR is cut from an
 * isolated branch. Pure `git` over {@link execFile} with explicit `cwd`, no new
 * deps; the branch is never deleted (it may carry the PR — Law: no irreversible
 * deletes), only the worktree is pruned on run delete.
 */
@Injectable()
export class WorkspaceService {
  private readonly log?: ScopedLogger

  constructor(@Optional() logger?: LoggerService) {
    this.log = logger?.child(WorkspaceService.name)
  }

  /** Is `dir` inside a git work tree? A cheap `rev-parse` probe (no network). */
  async isGitRepo(dir: string): Promise<boolean> {
    try {
      await exec("git", ["rev-parse", "--git-dir"], { cwd: dir, timeout: GIT_TIMEOUT_MS })
      return true
    } catch {
      return false
    }
  }

  /**
   * Cut a fresh worktree + branch from the project's current HEAD. `dir` must not
   * exist (git creates it). No fetch/pull — the branch is local, off whatever the
   * checkout's HEAD is now. Returns the record persisted on the run aggregate.
   * Throws {@link WorkspaceSetupError} on any git failure (the caller fails the run).
   */
  async createWorktree(opts: {
    projectPath: string
    runId: string
    slug: string
    dir: string
  }): Promise<Workspace> {
    const branch = `zibby/${opts.runId}-${sanitizeBranchSlug(opts.slug)}`
    try {
      const head = await exec("git", ["rev-parse", "HEAD"], {
        cwd: opts.projectPath,
        timeout: GIT_TIMEOUT_MS,
      })
      const baseRef = head.stdout.trim()
      await exec("git", ["worktree", "add", "-b", branch, opts.dir, "HEAD"], {
        cwd: opts.projectPath,
        timeout: GIT_TIMEOUT_MS,
      })
      this.log?.info("worktree created", { projectPath: opts.projectPath, branch, dir: opts.dir })
      return { branch, path: opts.dir, baseRef }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new WorkspaceSetupError(
        `Failed to create worktree for branch "${branch}" in "${opts.projectPath}": ${message}`,
      )
    }
  }

  /**
   * Remove a run's worktree and prune its `.git/worktrees/*` metadata. Tolerant:
   * an already-removed worktree dir (e.g. the sandbox rm ran first) still has its
   * metadata cleared by the `prune` fallback. NEVER deletes the branch — it may
   * carry the PR; pruning branches is the operator's call.
   */
  async removeWorktree(opts: { projectPath: string; worktreePath: string }): Promise<void> {
    await exec("git", ["worktree", "remove", "--force", opts.worktreePath], {
      cwd: opts.projectPath,
      timeout: GIT_TIMEOUT_MS,
    }).catch((error) => {
      this.log?.debug("worktree remove failed; pruning metadata", {
        worktreePath: opts.worktreePath,
        err: error instanceof Error ? error.message : String(error),
      })
    })
    await exec("git", ["worktree", "prune"], {
      cwd: opts.projectPath,
      timeout: GIT_TIMEOUT_MS,
    }).catch(() => {})
  }

  /**
   * A human-readable diff of the run's branch against its base HEAD — the commit
   * list plus the changed-files summary. Consumed by the PR gate (3.3) to assemble
   * the Tier-3 decision surface. Best-effort: a git failure yields an empty string.
   */
  async diffstat(opts: { worktreePath: string; baseRef: string }): Promise<string> {
    const commits = await exec("git", ["log", "--oneline", `${opts.baseRef}..HEAD`], {
      cwd: opts.worktreePath,
      timeout: GIT_TIMEOUT_MS,
    })
      .then((r) => r.stdout.trim())
      .catch(() => "")
    const stat = await exec("git", ["diff", "--stat", `${opts.baseRef}...HEAD`], {
      cwd: opts.worktreePath,
      timeout: GIT_TIMEOUT_MS,
    })
      .then((r) => r.stdout.trim())
      .catch(() => "")
    return [commits, stat].filter(Boolean).join("\n\n")
  }
}
