import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable, Optional } from "@nestjs/common";
import type { Workspace } from "@zibby/contracts";
import {
  GIT_NETWORK_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  exec,
  isGitRepo as isGitRepoAt,
} from "../shared/git-exec";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** Hard cap on a sanitized branch slug, leaving room under git's ref-name limits. */
const SLUG_MAX = 60;

/** Raised when worktree creation fails on a *git* project — the run must not silently
 * touch the operator's main checkout, so the caller surfaces this rather than falling
 * back to direct-checkout (which is reserved for non-git projects). */
export class WorkspaceSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceSetupError";
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
    .replace(/-+$/g, "");
  return slug || "run";
}

/**
 * Owns the per-run git worktree (Phase 3.1). A project-targeted run works on its
 * own branch in a worktree under the run dir — never the operator's main checkout —
 * so koder's commits are visible to review/verify and the PR is cut from an
 * isolated branch. Pure `git` over the shared bounded-`execFile` wrapper
 * (`../shared/git-exec`) with explicit `cwd`, no new deps; the branch is never
 * deleted (it may carry the PR — Law: no irreversible deletes), only the
 * worktree is pruned on run delete.
 */
@Injectable()
export class WorkspaceService {
  private readonly log?: ScopedLogger;

  constructor(@Optional() logger?: LoggerService) {
    this.log = logger?.child(WorkspaceService.name);
  }

  /** Is `dir` inside a git work tree? A cheap `rev-parse` probe (no network).
   * Delegates to the shared {@link isGitRepoAt} (Task 8 dedup); the import is
   * aliased so this method doesn't shadow its own free-function delegate
   * (same pattern as `SelfService.isGitRepo`). */
  async isGitRepo(dir: string): Promise<boolean> {
    return isGitRepoAt(dir);
  }

  /**
   * Cut a fresh worktree + branch from the project's origin. `dir` must not exist
   * (git creates it). Phase 76: BEFORE cutting, fetches `origin` (the only network
   * git call this method makes) and cuts from `origin/<default-branch>` rather than
   * local HEAD, so a run always starts from what's actually on the remote — not a
   * stale or locally-diverged checkout. Offline (fetch fails) degrades gracefully
   * to local HEAD (logged, never thrown) so an offline machine still runs. Returns
   * the record persisted on the run aggregate. Throws {@link WorkspaceSetupError}
   * on any OTHER git failure (the caller fails the run). Never `checkout`s or
   * `reset`s the operator's main working tree — `git worktree add` is isolated by
   * construction, and every call here is a read (`rev-parse`, `symbolic-ref`,
   * `fetch`) except the `worktree add` itself.
   */
  async createWorktree(opts: {
    projectPath: string;
    runId: string;
    slug: string;
    dir: string;
  }): Promise<Workspace> {
    const branch = `zibby/${opts.runId}-${sanitizeBranchSlug(opts.slug)}`;
    try {
      const base = await this.resolveWorktreeBase(opts.projectPath);
      await exec("git", ["worktree", "add", "-b", branch, opts.dir, base.ref], {
        cwd: opts.projectPath,
        timeout: GIT_TIMEOUT_MS,
      });
      this.log?.info("worktree created", {
        projectPath: opts.projectPath,
        branch,
        dir: opts.dir,
        base: base.ref,
      });
      return { branch, path: opts.dir, baseRef: base.sha };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkspaceSetupError(
        `Failed to create worktree for branch "${branch}" in "${opts.projectPath}": ${message}`,
      );
    }
  }

  /**
   * The ref (and its resolved sha) to cut a worktree from: `origin/<default>` when
   * `git fetch origin` succeeds, else local `HEAD` (offline fallback — logged as a
   * warning, never thrown, so a project with no remote configured, or a genuinely
   * offline machine, still gets a working run). This is the ONLY network git call
   * `createWorktree` makes; every other call here is local and read-only.
   */
  private async resolveWorktreeBase(projectPath: string): Promise<{ ref: string; sha: string }> {
    const fetched = await exec("git", ["fetch", "origin"], {
      cwd: projectPath,
      timeout: GIT_NETWORK_TIMEOUT_MS,
    }).then(
      () => true,
      (error: unknown) => {
        this.log?.warn("git fetch origin failed; falling back to local HEAD (offline?)", {
          projectPath,
          err: error instanceof Error ? error.message : String(error),
        });
        return false;
      },
    );
    if (!fetched) {
      const head = await exec("git", ["rev-parse", "HEAD"], {
        cwd: projectPath,
        timeout: GIT_TIMEOUT_MS,
      });
      return { ref: "HEAD", sha: head.stdout.trim() };
    }
    const ref = `origin/${await this.originDefaultBranch(projectPath)}`;
    const sha = await exec("git", ["rev-parse", ref], { cwd: projectPath, timeout: GIT_TIMEOUT_MS });
    return { ref, sha: sha.stdout.trim() };
  }

  /**
   * The remote's default branch name (no `origin/` prefix). Three-step fallback:
   * (1) `symbolic-ref` on the cached `refs/remotes/origin/HEAD` — cheap, local,
   * set by `clone` and by `fetch` with a remote that advertises HEAD; (2) parse
   * `git remote show origin`'s "HEAD branch:" line — a second network round-trip,
   * only reached when (1) has nothing cached; (3) `"main"` as the final fallback.
   */
  private async originDefaultBranch(projectPath: string): Promise<string> {
    const symbolic = await exec(
      "git",
      ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
      { cwd: projectPath, timeout: GIT_TIMEOUT_MS },
    )
      .then((r) => r.stdout.trim().replace(/^origin\//, ""))
      .catch(() => "");
    if (symbolic) return symbolic;

    const shown = await exec("git", ["remote", "show", "origin"], {
      cwd: projectPath,
      timeout: GIT_NETWORK_TIMEOUT_MS,
    })
      .then((r) => r.stdout)
      .catch(() => "");
    const match = /HEAD branch:\s*(\S+)/.exec(shown);
    if (match?.[1] && match[1] !== "(unknown)") return match[1];

    return "main";
  }

  /**
   * Phase 76 — clone `remote` into `dir` (bounded network timeout). Used by
   * `ProjectLocalService.clone` so all git invocations live in this one service;
   * never touches `project.path`/the registry — the caller decides where `dir`
   * lands (a machine-local `cloneRoot`). Throws {@link WorkspaceSetupError} on
   * failure (caller maps it onto the HTTP response).
   *
   * Task 8 — argv/transport hardening, unconditional and defense-in-depth on
   * top of `ProjectLocalService.clone()`'s upstream `validateRemote()` gate:
   * `-c protocol.ext.allow=never` defeats git's `ext::` arbitrary-command
   * transport at the config level regardless of what reaches this call, and
   * `--` (end-of-options) defeats leading-dash argv/option injection even if
   * a bad value somehow got this far. Deliberately does NOT add
   * `-c protocol.file.allow=never` — git's local/file transport also governs
   * a bare local-path clone, which the `WorkspaceService.clone (Phase 76)`
   * test below relies on cloning directly (no scheme, no `validateRemote()`
   * in front of it at that layer); `file://` rejection is handled entirely by
   * `validateRemote()` upstream, which every production call path goes
   * through before this method is ever invoked.
   */
  async clone(remote: string, dir: string): Promise<void> {
    try {
      await exec("git", ["-c", "protocol.ext.allow=never", "clone", "--", remote, dir], {
        timeout: GIT_NETWORK_TIMEOUT_MS,
      });
      this.log?.info("cloned repository", { remote, dir });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkspaceSetupError(`Failed to clone "${remote}" into "${dir}": ${message}`);
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
      });
    });
    await exec("git", ["worktree", "prune"], {
      cwd: opts.projectPath,
      timeout: GIT_TIMEOUT_MS,
    }).catch(() => {});
  }

  /**
   * Phase 9.3 — commit a checkpoint on the run's branch after a phase landed green.
   * `git add -A && git commit` IN THE WORKTREE ONLY: refuses (logs + null) unless
   * `worktreePath` carries a `.git` worktree marker, so it can never fall back to the
   * operator's main checkout and commit their dirty tree (a Law-1 violation in spirit).
   * A clean tree → null (nothing to checkpoint). Tolerant of a deleted worktree / any
   * git failure (logs + null) so it never crashes the driver. NEVER pushes — the
   * push/PR gate (3.2/3.3) is untouched. Returns the short sha on success.
   */
  async checkpoint(opts: {
    worktreePath: string;
    phaseId: string;
    summary: string;
  }): Promise<{ sha: string } | null> {
    // A git worktree has a `.git` marker (a file pointing at the main repo). Its
    // absence means this is not a worktree → refuse rather than risk the main checkout.
    const marker = await fs.stat(path.join(opts.worktreePath, ".git")).catch(() => null);
    if (!marker) {
      this.log?.debug("checkpoint skipped — not a worktree", { worktreePath: opts.worktreePath });
      return null;
    }
    try {
      const status = await exec("git", ["status", "--porcelain"], {
        cwd: opts.worktreePath,
        timeout: GIT_TIMEOUT_MS,
      });
      if (!status.stdout.trim()) return null; // clean tree — nothing to checkpoint
      await exec("git", ["add", "-A"], { cwd: opts.worktreePath, timeout: GIT_TIMEOUT_MS });
      const message = `zibby-checkpoint(${opts.phaseId}): ${opts.summary}`;
      // -c identity so the commit works on a worktree with no configured user.
      await exec(
        "git",
        ["-c", "user.email=zibby@local", "-c", "user.name=ZIBBY", "commit", "-m", message],
        { cwd: opts.worktreePath, timeout: GIT_TIMEOUT_MS },
      );
      const head = await exec("git", ["rev-parse", "--short", "HEAD"], {
        cwd: opts.worktreePath,
        timeout: GIT_TIMEOUT_MS,
      });
      const sha = head.stdout.trim();
      this.log?.info("checkpoint committed", {
        worktreePath: opts.worktreePath,
        phaseId: opts.phaseId,
        sha,
      });
      return { sha };
    } catch (error) {
      this.log?.warn("checkpoint failed (soft)", {
        worktreePath: opts.worktreePath,
        phaseId: opts.phaseId,
        err: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Phase 9.3 — `git log --oneline <baseRef>..HEAD` on the run branch: the commits
   * (koder's incremental work + the zibby-checkpoints) made since the branch was cut.
   * Feeds the resume-context block a resumed/retried phase is prefixed with. Best-effort
   * (a missing/cleaned worktree → "").
   */
  async commitLog(opts: { worktreePath: string; baseRef: string }): Promise<string> {
    return exec("git", ["log", "--oneline", `${opts.baseRef}..HEAD`], {
      cwd: opts.worktreePath,
      timeout: GIT_TIMEOUT_MS,
    })
      .then((r) => r.stdout.trim())
      .catch(() => "");
  }

  /**
   * Open the run's PR: `git push -u origin <branch>` then `gh pr create`, run in
   * `cwd`. This is the outward, Tier-3 action the deleted `pr-autor` agent used to
   * perform — now a system step a `pr` output runs, but ONLY after the operator
   * approved the gate (`pipeline-output` / `task-output`; the runner never calls this
   * before approval). The title/body come from the gate's draft.
   *
   * `branch` may be passed explicitly — a task-output gate captures it at terminal and
   * pushes from the REPO dir, because a worktree's commits live in the shared object
   * store and the branch ref outlives `git worktree remove` (commit ≠ push). When
   * omitted (the pipeline path, `cwd` is the live worktree) it is derived from
   * `cwd`'s current branch. Returns the PR url on success, null on any failure (a
   * failed open surfaces as a soft error, not a crash — the branch work is committed
   * and safe).
   */
  async openPr(opts: {
    cwd: string;
    branch?: string;
    title: string;
    /** PR body source: a file (`--body-file`, the pipeline path) or an inline string. */
    bodyFile?: string;
    body?: string;
  }): Promise<{ url: string } | null> {
    const marker = await fs.stat(path.join(opts.cwd, ".git")).catch(() => null);
    if (!marker) {
      this.log?.warn("openPr skipped — not a git dir", { cwd: opts.cwd });
      return null;
    }
    try {
      const branch =
        opts.branch ??
        (
          await exec("git", ["branch", "--show-current"], {
            cwd: opts.cwd,
            timeout: GIT_TIMEOUT_MS,
          })
        ).stdout.trim();
      if (!branch) throw new Error("detached HEAD; no branch to push");
      await exec("git", ["push", "-u", "origin", branch], {
        cwd: opts.cwd,
        timeout: GIT_TIMEOUT_MS,
      });
      const bodyArgs =
        opts.bodyFile !== undefined ? ["--body-file", opts.bodyFile] : ["--body", opts.body ?? ""];
      const created = await exec(
        "gh",
        ["pr", "create", "--title", opts.title, ...bodyArgs, "--head", branch],
        { cwd: opts.cwd, timeout: GIT_TIMEOUT_MS },
      );
      const url = created.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
      this.log?.info("PR opened", { cwd: opts.cwd, branch, url });
      return { url };
    } catch (error) {
      this.log?.warn("openPr failed (soft)", {
        cwd: opts.cwd,
        err: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
      .catch(() => "");
    const stat = await exec("git", ["diff", "--stat", `${opts.baseRef}...HEAD`], {
      cwd: opts.worktreePath,
      timeout: GIT_TIMEOUT_MS,
    })
      .then((r) => r.stdout.trim())
      .catch(() => "");
    return [commits, stat].filter(Boolean).join("\n\n");
  }

  /**
   * The branch-vs-base line-change totals — summed `git diff --numstat` added/deleted
   * columns (binary files show `-`/`-` and are skipped). The coloured `+X / −Y` the run
   * detail's PR output surface renders. Best-effort: any git failure yields `{0, 0}`.
   */
  async diffStats(opts: {
    worktreePath: string;
    baseRef: string;
  }): Promise<{ additions: number; deletions: number }> {
    const out = await exec("git", ["diff", "--numstat", `${opts.baseRef}...HEAD`], {
      cwd: opts.worktreePath,
      timeout: GIT_TIMEOUT_MS,
    })
      .then((r) => r.stdout)
      .catch(() => "");
    let additions = 0;
    let deletions = 0;
    for (const line of out.split(/\r?\n/)) {
      const [add, del] = line.split("\t");
      if (add && add !== "-") additions += Number.parseInt(add, 10) || 0;
      if (del && del !== "-") deletions += Number.parseInt(del, 10) || 0;
    }
    return { additions, deletions };
  }
}
