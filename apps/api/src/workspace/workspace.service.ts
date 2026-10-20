import { execFile } from "node:child_process";
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
 * Sanitize a free-form slug source (workflow id / agent id / task title) into the
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
        // The checkout of a large monorepo (cms4: ~65k files) takes well over the
        // 10s local-git bound — the network bound is the finite upper limit here.
        timeout: GIT_NETWORK_TIMEOUT_MS,
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
    const sha = await exec("git", ["rev-parse", ref], {
      cwd: projectPath,
      timeout: GIT_TIMEOUT_MS,
    });
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

  /** The worktree's full HEAD sha (`git rev-parse HEAD`). Throws on a non-git dir. */
  async headSha(worktreePath: string): Promise<string> {
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], {
      cwd: worktreePath,
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout.trim();
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
   * approved the gate (`workflow-output` / `task-output`; the runner never calls this
   * before approval). The title/body come from the gate's draft.
   *
   * `branch` may be passed explicitly — a task-output gate captures it at terminal and
   * pushes from the REPO dir, because a worktree's commits live in the shared object
   * store and the branch ref outlives `git worktree remove` (commit ≠ push). When
   * omitted (the workflow path, `cwd` is the live worktree) it is derived from
   * `cwd`'s current branch. Returns the PR url on success, null on any failure (a
   * failed open surfaces as a soft error, not a crash — the branch work is committed
   * and safe).
   *
   * `draft` (NS2 F0b) — the project's `prOpenMode` setting, threaded through as
   * `gh pr create --draft` when true. Purely cosmetic on the PR's review state;
   * it never gates the open itself (still immediate, Tier-2) and never touches
   * the merge gate.
   */
  async openPr(opts: {
    cwd: string;
    branch?: string;
    title: string;
    /** PR body source: a file (`--body-file`, the workflow path) or an inline string. */
    bodyFile?: string;
    body?: string;
    draft?: boolean;
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
        [
          "pr",
          "create",
          ...(opts.draft ? ["--draft"] : []),
          "--title",
          opts.title,
          ...bodyArgs,
          "--head",
          branch,
        ],
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
   * todo-11 — force-push a rebased PR head from a run's worktree. Every guard lives
   * here, not in the agent prompt: `head`/`base` must be valid, non-option-like branch
   * names and `expectedSha` a full sha; refuses `head` equal to `base` or to the remote
   * default branch, a rebase still in progress, dirty tracked files, a HEAD that is not
   * on top of the freshly fetched `origin/<base>`, and a HEAD that did not preserve the
   * PR's commits. Preservation compares the clicked head's commits
   * (`merge-base(expectedSha, origin/<base>)..expectedSha`) with the new ones
   * (`origin/<base>..HEAD`), merge commits excluded (`--no-merges`: a rebase drops a
   * "merge base into feature" commit). Unapproved, counts must match and every old
   * `patch-id` must survive; with `allowRewrittenCommits` (approved after conflicts
   * were resolved, on the spot (todo-17) or by the operator) HEAD only needs at least
   * one own commit beyond `origin/<base>`. With `rebasedSha` (the HEAD ZIBBY verified at approval time) the
   * worktree HEAD must still equal it, and exactly that sha is pushed. The lease pins
   * the remote branch to `expectedSha`, so a push made since the click is never
   * overwritten. Returns the pushed sha; throws an Error with the reason.
   */
  async pushRebased(opts: {
    cwd: string;
    head: string;
    base: string;
    expectedSha: string;
    allowRewrittenCommits?: boolean;
    rebasedSha?: string;
  }): Promise<string> {
    const { cwd, head, base, expectedSha, allowRewrittenCommits = false, rebasedSha } = opts;
    const git = async (args: string[], timeout = GIT_TIMEOUT_MS): Promise<string> =>
      (await exec("git", args, { cwd, timeout, maxBuffer: 64 * 1024 * 1024 })).stdout.trim();
    const ok = (args: string[]) =>
      git(args).then(
        () => true,
        () => false,
      );
    for (const [label, name] of [
      ["head", head],
      ["base", base],
    ] as const) {
      if (name.startsWith("-") || !(await ok(["check-ref-format", "--branch", name]))) {
        throw new Error(`invalid ${label} branch name "${name}"`);
      }
    }
    if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
      throw new Error(`expectedSha is not a full 40-char sha: "${expectedSha}"`);
    }
    if (rebasedSha !== undefined && !/^[0-9a-f]{40}$/.test(rebasedSha)) {
      throw new Error(`rebasedSha is not a full 40-char sha: "${rebasedSha}"`);
    }
    if (head === base) throw new Error(`refusing to push the base branch "${base}"`);
    const defaultBranch = await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).then(
      (ref) => ref.replace(/^origin\//, ""),
      () => null,
    );
    if (head === defaultBranch) {
      throw new Error(`refusing to push the default branch "${head}"`);
    }
    for (const dir of ["rebase-merge", "rebase-apply"]) {
      const marker = path.resolve(cwd, await git(["rev-parse", "--git-path", dir]));
      if (
        await fs.stat(marker).then(
          () => true,
          () => false,
        )
      ) {
        throw new Error("a rebase is still in progress in the worktree");
      }
    }
    if (await git(["status", "--porcelain", "--untracked-files=no"])) {
      throw new Error("uncommitted changes in the worktree");
    }
    if (rebasedSha !== undefined) {
      const current = await git(["rev-parse", "HEAD"]);
      if (current !== rebasedSha) {
        throw new Error(
          `worktree HEAD ${current.slice(0, 9)} is not the approved rebased head ${rebasedSha.slice(0, 9)}`,
        );
      }
    }
    await git(
      ["fetch", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`],
      GIT_NETWORK_TIMEOUT_MS,
    );
    if (!(await ok(["merge-base", "--is-ancestor", `origin/${base}`, "HEAD"]))) {
      throw new Error(`HEAD is not on top of origin/${base}; rebase again`);
    }
    const hasClicked = () => ok(["cat-file", "-e", `${expectedSha}^{commit}`]);
    if (!(await hasClicked())) {
      await git(["fetch", "origin", expectedSha], GIT_NETWORK_TIMEOUT_MS).catch(() => undefined);
      if (!(await hasClicked())) {
        await git(["fetch", "origin", `refs/heads/${head}`], GIT_NETWORK_TIMEOUT_MS).catch(
          () => undefined,
        );
      }
    }
    if (!(await hasClicked())) {
      throw new Error(`cannot find the clicked head ${expectedSha} to compare commits`);
    }
    const commits = async (range: string): Promise<string[]> =>
      (await git(["rev-list", "--reverse", "--no-merges", range])).split("\n").filter(Boolean);
    const mergeBase = await git(["merge-base", expectedSha, `origin/${base}`]);
    const oldCommits = await commits(`${mergeBase}..${expectedSha}`);
    if (oldCommits.length === 0) {
      throw new Error(`the PR has no commits of its own beyond ${base}; nothing to rebase`);
    }
    const newCommits = await commits(`origin/${base}..HEAD`);
    if (allowRewrittenCommits) {
      // Operator-approved: conflict resolution may squash or split commits; only demand
      // that HEAD still carries own work on top of origin/<base> (checked above).
      if (newCommits.length === 0) {
        throw new Error(`HEAD has no commits of its own beyond origin/${base}; refusing to push`);
      }
    } else {
      if (oldCommits.length !== newCommits.length) {
        throw new Error(
          `rebase did not preserve the PR's commits: ${oldCommits.length} before, ${newCommits.length} after`,
        );
      }
      const patchId = async (sha: string): Promise<string> => {
        const diff = await git(["diff-tree", "-p", "--no-commit-id", "-m", "--root", sha]);
        return (await this.patchIdOf(diff, cwd)) || sha;
      };
      const kept = new Set(await Promise.all(newCommits.map(patchId)));
      const missing: string[] = [];
      for (const sha of oldCommits)
        if (!kept.has(await patchId(sha))) missing.push(sha.slice(0, 9));
      if (missing.length > 0) {
        throw new Error(
          `rebase did not preserve the PR's commits (changed or missing: ${missing.join(", ")})`,
        );
      }
    }
    const sha = rebasedSha ?? (await git(["rev-parse", "HEAD"]));
    await git(
      [
        "push",
        `--force-with-lease=refs/heads/${head}:${expectedSha}`,
        "origin",
        `${sha}:refs/heads/${head}`,
      ],
      GIT_NETWORK_TIMEOUT_MS,
    );
    this.log?.info("rebased branch force-pushed", { cwd, head, base, sha });
    return sha;
  }

  /** `git patch-id --stable` of a diff on stdin; "" for an empty diff. */
  private patchIdOf(diff: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        "git",
        ["patch-id", "--stable"],
        { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(stdout.trim().split(" ")[0] ?? "")),
      );
      child.stdin?.on("error", reject); // early git exit -> EPIPE; reject via the normal path
      child.stdin?.end(diff);
    });
  }

  /**
   * todo-11 — what a pr-rebase worktree really holds, read by ZIBBY (not the agent's
   * report): HEAD's sha, `git log --oneline origin/<base>..HEAD` and
   * `git diff --stat <headSha> HEAD`. Throws when HEAD cannot be read; the log and stat
   * are best-effort ("" on a git failure).
   */
  async rebaseFacts(opts: {
    cwd: string;
    base: string;
    headSha: string;
  }): Promise<{ sha: string; log: string; stat: string }> {
    const git = (args: string[]) =>
      exec("git", args, { cwd: opts.cwd, timeout: GIT_TIMEOUT_MS }).then((r) => r.stdout.trim());
    const sha = await git(["rev-parse", "--verify", "HEAD^{commit}"]);
    const [log, stat] = await Promise.all([
      git(["log", "--oneline", `origin/${opts.base}..HEAD`, "--"]).catch(() => ""),
      git(["diff", "--stat", opts.headSha, "HEAD", "--"]).catch(() => ""),
    ]);
    return { sha, log, stat };
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
