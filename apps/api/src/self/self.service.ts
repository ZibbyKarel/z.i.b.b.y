import * as path from "node:path";
import { Injectable, Optional } from "@nestjs/common";
import {
  type EnsureSelfProjectResult,
  type SelfPr,
  type SelfStatus,
  type SelfUpdateResult,
  isValidGitRemote,
} from "@zibby/contracts";
import { MachineConfigStore } from "../machine/machine-config.store";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { installRoot } from "../shared/data-dir";
import {
  GIT_NETWORK_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  exec,
  isGitRepo as isGitRepoAt,
} from "../shared/git-exec";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** The id ZIBBY registers itself under as a project. */
export const SELF_PROJECT_ID = "zibby";

const SELF_PROJECT_DESC =
  "ZIBBY itself — self-development. Changes happen in a separate clone and land as draft PRs; the operator merges.";

/** `gh` CLI calls — local process, but network-backed under the hood; bounded
 * generously without hanging the status endpoint on a slow GitHub API. */
const GH_TIMEOUT_MS = 15_000;

/** The benign readout for a non-git install (or one with no configured remote
 * this method can't even probe) — never an error, just "nothing to report". */
const NOT_A_REPO_STATUS: SelfStatus = {
  currentBranch: "",
  defaultBranch: "",
  behind: 0,
  ahead: 0,
  dirty: false,
  upToDate: true,
  openPrCount: 0,
  prs: [],
  ghAvailable: false,
};

/** Raised when `updateSelf` would touch a dirty operator tree — refused, never
 * force-touched. Maps to a 409 in the controller. */
export class SelfDirtyError extends Error {
  constructor() {
    super("Refusing to update — the ZIBBY install has uncommitted changes.");
    this.name = "SelfDirtyError";
  }
}

/** Raised when `git pull --ff-only` can't fast-forward (diverged history) or
 * otherwise fails. Maps to a 409 in the controller. NEVER retried with `--force`
 * or `reset --hard` — the operator resolves this by hand. */
export class SelfUpdateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfUpdateConflictError";
  }
}

/** Raised when `ensureSelfProject` can't safely register ZIBBY as a project
 * (no/invalid origin, a conflicting `zibby` project, clone == install tree).
 * Maps to a 409 in the controller. */
export class SelfProjectConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfProjectConflictError";
  }
}

/**
 * Phase 79 — the ZIBBY install repo's own freshness vs. `origin`, backing the
 * top-bar indicator. Every git/gh call is bounded and soft-fails (logs + a safe
 * default) EXCEPT the two `updateSelf` refusals, which are the whole point of
 * that endpoint. Mirrors {@link WorkspaceService}'s posture (bounded `execFile`,
 * offline-tolerant fetch, never `--force`/`reset`) but reads the ZIBBY install
 * root itself (`installRoot()`), not a project checkout.
 */
@Injectable()
export class SelfService {
  private readonly log?: ScopedLogger;

  constructor(
    @Optional() logger?: LoggerService,
    @Optional() private readonly projects?: ProjectsStorageService,
    @Optional() private readonly machineConfig?: MachineConfigStore,
  ) {
    this.log = logger?.child(SelfService.name);
  }

  /** The `zibby` project id when that project exists; soft-fails to undefined. */
  private async selfProjectId(): Promise<string | undefined> {
    try {
      const all = (await this.projects?.list()) ?? [];
      return all.some((p) => p.id === SELF_PROJECT_ID) ? SELF_PROJECT_ID : undefined;
    } catch (error) {
      this.log?.warn("self project lookup failed (soft)", {
        err: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private cwd(): string {
    return installRoot();
  }

  /** Delegates to the shared {@link isGitRepoAt} (Task 8 dedup). */
  private async isGitRepo(): Promise<boolean> {
    return isGitRepoAt(this.cwd());
  }

  /** `origin`'s default branch (no `origin/` prefix); `"main"` when unknown. */
  private async defaultBranch(): Promise<string> {
    const symbolic = await exec(
      "git",
      ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
      { cwd: this.cwd(), timeout: GIT_TIMEOUT_MS },
    )
      .then((r) => r.stdout.trim().replace(/^origin\//, ""))
      .catch(() => "");
    return symbolic || "main";
  }

  private async currentBranch(): Promise<string> {
    return exec("git", ["branch", "--show-current"], { cwd: this.cwd(), timeout: GIT_TIMEOUT_MS })
      .then((r) => r.stdout.trim())
      .catch(() => "");
  }

  private async isDirty(): Promise<boolean> {
    return exec("git", ["status", "--porcelain"], { cwd: this.cwd(), timeout: GIT_TIMEOUT_MS })
      .then((r) => r.stdout.trim().length > 0)
      .catch(() => false);
  }

  /** `git rev-list --count <range>`, soft-failing to 0 (unknown ref, etc). */
  private async countBetween(range: string): Promise<number> {
    return exec("git", ["rev-list", "--count", range], {
      cwd: this.cwd(),
      timeout: GIT_TIMEOUT_MS,
    })
      .then((r) => Number.parseInt(r.stdout.trim(), 10) || 0)
      .catch(() => 0);
  }

  /** `git fetch origin`, soft-failing (offline/no remote) — the caller keeps
   * working off whatever refs are last-known locally. Never throws. */
  private async fetchOrigin(): Promise<boolean> {
    return exec("git", ["fetch", "origin"], {
      cwd: this.cwd(),
      timeout: GIT_NETWORK_TIMEOUT_MS,
    }).then(
      () => true,
      (error: unknown) => {
        this.log?.warn("git fetch origin failed; using last-known refs (offline?)", {
          err: error instanceof Error ? error.message : String(error),
        });
        return false;
      },
    );
  }

  /** Open PRs via `gh pr list`, when the `gh` CLI is on PATH. Never throws —
   * any failure (gh missing, not authenticated, API error) degrades to
   * `{ ghAvailable: false, prs: [] }`. */
  private async openPrs(): Promise<{ ghAvailable: boolean; prs: SelfPr[] }> {
    const ghOk = await exec("gh", ["--version"], { cwd: this.cwd(), timeout: GIT_TIMEOUT_MS }).then(
      () => true,
      () => false,
    );
    if (!ghOk) return { ghAvailable: false, prs: [] };

    try {
      const { stdout } = await exec(
        "gh",
        ["pr", "list", "--state", "open", "--json", "number,title,url"],
        { cwd: this.cwd(), timeout: GH_TIMEOUT_MS },
      );
      const parsed: unknown = JSON.parse(stdout);
      if (!Array.isArray(parsed)) throw new Error("gh pr list did not return an array");
      const prs: SelfPr[] = parsed.map((row) => {
        const r = row as { number: number; title: string; url: string };
        return { number: r.number, title: r.title, url: r.url };
      });
      return { ghAvailable: true, prs };
    } catch (error) {
      this.log?.warn("gh pr list failed (soft)", {
        err: error instanceof Error ? error.message : String(error),
      });
      return { ghAvailable: false, prs: [] };
    }
  }

  /**
   * The freshness + open-PR readout. Never throws/500s on a normal machine —
   * every sub-step soft-fails to a safe default; a genuinely non-git install
   * returns {@link NOT_A_REPO_STATUS} outright.
   */
  async status(): Promise<SelfStatus> {
    const projectId = await this.selfProjectId();
    const projectField = projectId ? { projectId } : {};
    if (!(await this.isGitRepo())) return { ...NOT_A_REPO_STATUS, ...projectField };

    const fetched = await this.fetchOrigin();
    const [defaultBranch, currentBranch, dirty] = await Promise.all([
      this.defaultBranch(),
      this.currentBranch(),
      this.isDirty(),
    ]);
    const [behind, ahead] = await Promise.all([
      this.countBetween(`HEAD..origin/${defaultBranch}`),
      this.countBetween(`origin/${defaultBranch}..HEAD`),
    ]);
    const { ghAvailable, prs } = await this.openPrs();

    return {
      currentBranch,
      defaultBranch,
      behind,
      ahead,
      dirty,
      upToDate: behind === 0,
      openPrCount: prs.length,
      prs,
      ghAvailable,
      ...(fetched ? { fetchedAt: new Date().toISOString() } : {}),
      ...projectField,
    };
  }

  /**
   * Register the ZIBBY install as the project `zibby` so it can edit itself in
   * a SEPARATE clone (`<cloneRoot>/zibby`, draft PRs) — Builder ≠ Subject.
   * Idempotent; never writes a `path`, never mutates git state, never
   * overwrites an existing `zibby` project. Refusals throw
   * {@link SelfProjectConflictError} (409).
   */
  async ensureSelfProject(): Promise<EnsureSelfProjectResult> {
    if (!this.projects || !this.machineConfig) {
      throw new Error("SelfService: projects storage / machine config not wired");
    }
    const origin = await exec("git", ["remote", "get-url", "origin"], {
      cwd: this.cwd(),
      timeout: GIT_TIMEOUT_MS,
    })
      .then((r) => r.stdout.trim())
      .catch(() => "");
    if (!origin) {
      throw new SelfProjectConflictError("The ZIBBY install has no `origin` remote to register.");
    }
    if (!isValidGitRemote(origin)) {
      throw new SelfProjectConflictError(
        `The ZIBBY \`origin\` remote is not a valid git remote: ${origin}`,
      );
    }

    const existing = (await this.projects.list()).find((p) => p.id === SELF_PROJECT_ID);
    if (existing) {
      if (existing.gitRemote === origin) return { projectId: SELF_PROJECT_ID, created: false };
      throw new SelfProjectConflictError(
        `A project "${SELF_PROJECT_ID}" already exists with a different remote (${existing.gitRemote ?? "none"}); not overwriting it.`,
      );
    }

    const { cloneRoot } = await this.machineConfig.read();
    if (path.resolve(cloneRoot, SELF_PROJECT_ID) === path.resolve(this.cwd())) {
      throw new SelfProjectConflictError(
        `<cloneRoot>/${SELF_PROJECT_ID} is the running ZIBBY install itself — pick a different clone root so the clone is separate from the builder.`,
      );
    }

    await this.projects.create({
      id: SELF_PROJECT_ID,
      name: "ZIBBY",
      desc: SELF_PROJECT_DESC,
      gitRemote: origin,
      prOpenMode: "draft",
    });
    this.log?.info("self project registered", { id: SELF_PROJECT_ID });
    return { projectId: SELF_PROJECT_ID, created: true };
  }

  /**
   * The one sanctioned self-update: `git pull --ff-only origin <default>` in
   * the install root. Refuses (throws) rather than touching a dirty tree or
   * forcing a non-fast-forward history — this is an operator-triggered button,
   * never called autonomously, and NEVER falls back to `--force`/`reset --hard`.
   */
  async update(): Promise<SelfUpdateResult> {
    if (!(await this.isGitRepo())) {
      return { updated: false, behind: 0, message: "not a git repository" };
    }
    if (await this.isDirty()) {
      throw new SelfDirtyError();
    }

    // Best-effort refresh so `behind` reflects the current remote tip, not a
    // stale prior fetch — offline degrades to whatever was last known.
    await this.fetchOrigin();
    const branch = await this.defaultBranch();
    const behind = await this.countBetween(`HEAD..origin/${branch}`);
    if (behind === 0) {
      return { updated: false, behind: 0, message: "already up to date" };
    }

    try {
      await exec("git", ["pull", "--ff-only", "origin", branch], {
        cwd: this.cwd(),
        timeout: GIT_NETWORK_TIMEOUT_MS,
      });
      this.log?.info("self-update pulled", { branch, behind });
      return { updated: true, behind: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SelfUpdateConflictError(
        `git pull --ff-only failed for "${branch}" (diverged history or network): ${message}`,
      );
    }
  }
}
