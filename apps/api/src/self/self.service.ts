import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable, Optional } from "@nestjs/common";
import {
  type EnsureSelfProjectResult,
  type Project,
  type SelfPr,
  type SelfStatus,
  type SelfUpdateResult,
  isValidGitRemote,
} from "@zibby/contracts";
import { MachineConfigStore } from "../machine/machine-config.store";
import { ProjectConflictError } from "../projects/projects.errors";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { installRoot, resolveDataRoot } from "../shared/data-dir";
import {
  GIT_NETWORK_TIMEOUT_MS,
  GIT_TIMEOUT_MS,
  exec,
  isGitRepo as isGitRepoAt,
} from "../shared/git-exec";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { normalizeRemote, redactRemote } from "./self-remote";

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

/** `fs.realpath`, falling back to `path.resolve` when the path doesn't exist. */
async function realpathOr(p: string): Promise<string> {
  return fs.realpath(p).catch(() => path.resolve(p));
}

/** `child` is `parent` itself or sits inside it (both already resolved). */
function isSameOrInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * The paths a `git status --porcelain` listing reports (both sides of a
 * rename, surrounding quotes stripped), relative to the repo root.
 */
function porcelainPaths(stdout: string): string[] {
  return stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => line.slice(3).split(" -> "))
    .map((p) => p.trim().replace(/^"(.*)"$/, "$1"));
}

/** An existing project recognised as ZIBBY itself. */
interface SelfProjectMatch {
  project: Project;
  /** Its `path` resolves to the running install root or somewhere inside it. */
  usesInstallTree: boolean;
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

  /** The install's `origin` URL, or `""` when there is none / not a repo. */
  private async originUrl(): Promise<string> {
    return exec("git", ["remote", "get-url", "origin"], {
      cwd: this.cwd(),
      timeout: GIT_TIMEOUT_MS,
    })
      .then((r) => r.stdout.trim())
      .catch(() => "");
  }

  /**
   * Find an existing project that IS ZIBBY: its `gitRemote` normalises to the
   * same `host/owner/repo` as `origin` (ssh vs https, `.git`, trailing `/`), or
   * its `path` realpath-resolves to the install root. A `zibby`-id project wins
   * a tie; otherwise the first match in registry order.
   */
  private async matchSelfProject(
    projects: readonly Project[],
    origin: string,
  ): Promise<SelfProjectMatch | undefined> {
    const originKey = normalizeRemote(origin);
    const root = await realpathOr(this.cwd());
    const matches: SelfProjectMatch[] = [];
    for (const project of projects) {
      const resolved = project.path ? await realpathOr(project.path) : undefined;
      const byRemote = originKey !== undefined && normalizeRemote(project.gitRemote) === originKey;
      const byPath = resolved !== undefined && resolved === root;
      if (byRemote || byPath) {
        matches.push({
          project,
          usesInstallTree: resolved !== undefined && isSameOrInside(resolved, root),
        });
      }
    }
    return matches.find((m) => m.project.id === SELF_PROJECT_ID) ?? matches[0];
  }

  /** The matched self project for the status readout; soft-fails to undefined. */
  private async selfProjectMatch(): Promise<SelfProjectMatch | undefined> {
    try {
      const all = (await this.projects?.list()) ?? [];
      if (all.length === 0) return undefined;
      return await this.matchSelfProject(all, await this.originUrl());
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

  /**
   * The data dir relative to the install root (`.zibby/data` by default), in
   * git's `/` form — or `undefined` when the data dir lives outside the install.
   */
  private runtimeDataPrefix(): string | undefined {
    const rel = path.relative(this.cwd(), resolveDataRoot());
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
    return rel.split(path.sep).join("/");
  }

  /**
   * Uncommitted changes in the install tree, IGNORING ZIBBY's own runtime writes
   * under the data dir (registry, gate rules, …) when that dir sits inside the
   * install. Upgrade stays safe regardless: `git pull --ff-only` itself refuses
   * a fast-forward that would overwrite a locally modified file.
   */
  private async isDirty(): Promise<boolean> {
    const prefix = this.runtimeDataPrefix();
    return exec("git", ["status", "--porcelain"], { cwd: this.cwd(), timeout: GIT_TIMEOUT_MS })
      .then((r) =>
        porcelainPaths(r.stdout).some(
          (p) => prefix === undefined || (p !== prefix && !p.startsWith(`${prefix}/`)),
        ),
      )
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
    const match = await this.selfProjectMatch();
    const projectField = match
      ? { projectId: match.project.id, projectUsesInstallTree: match.usesInstallTree }
      : {};
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
   * Idempotent: an existing project that already IS ZIBBY (same normalised
   * remote, or its `path` is the install root — e.g. a hand-made `zibby-self`)
   * is recognised and returned untouched, never duplicated or modified. Never
   * writes a `path`, never mutates git state, never persists or echoes origin
   * credentials. Refusals throw {@link SelfProjectConflictError} (409).
   */
  async ensureSelfProject(): Promise<EnsureSelfProjectResult> {
    if (!this.projects || !this.machineConfig) {
      throw new Error("SelfService: projects storage / machine config not wired");
    }
    const rawOrigin = await this.originUrl();
    if (!rawOrigin) {
      throw new SelfProjectConflictError("The ZIBBY install has no `origin` remote to register.");
    }
    // Validate the remote AS CONFIGURED (redaction's URL round-trip could
    // percent-encode an invalid remote into a valid-looking one), then only ever
    // persist / echo the credential-free form.
    if (!isValidGitRemote(rawOrigin)) {
      throw new SelfProjectConflictError(
        `The ZIBBY \`origin\` remote is not a valid git remote: ${redactRemote(rawOrigin)}`,
      );
    }
    const origin = redactRemote(rawOrigin);

    const all = await this.projects.list();
    const match = await this.matchSelfProject(all, origin);
    if (match) return { projectId: match.project.id, created: false };

    const foreign = all.find((p) => p.id === SELF_PROJECT_ID);
    if (foreign) throw this.foreignConflict(foreign);

    const { cloneRoot } = await this.machineConfig.read();
    const clonePath = path.join(await realpathOr(cloneRoot), SELF_PROJECT_ID);
    if (clonePath === (await realpathOr(this.cwd()))) {
      throw new SelfProjectConflictError(
        `<cloneRoot>/${SELF_PROJECT_ID} is the running ZIBBY install itself — pick a different clone root so the clone is separate from the builder.`,
      );
    }

    try {
      await this.projects.create({
        id: SELF_PROJECT_ID,
        name: "ZIBBY",
        desc: SELF_PROJECT_DESC,
        gitRemote: origin,
        prOpenMode: "draft",
      });
    } catch (error) {
      if (!(error instanceof ProjectConflictError)) throw error;
      // Lost a create race (double click / two tabs): whoever won may well be
      // ZIBBY itself — re-match before calling it a conflict.
      const after = await this.projects.list();
      const raced = await this.matchSelfProject(after, origin);
      if (raced) return { projectId: raced.project.id, created: false };
      const winner = after.find((p) => p.id === SELF_PROJECT_ID);
      throw winner
        ? this.foreignConflict(winner)
        : new SelfProjectConflictError(`A project "${SELF_PROJECT_ID}" already exists.`);
    }
    this.log?.info("self project registered", { id: SELF_PROJECT_ID });
    return { projectId: SELF_PROJECT_ID, created: true };
  }

  /** 409 for a `zibby` project that points somewhere else (credentials redacted). */
  private foreignConflict(existing: Project): SelfProjectConflictError {
    const remote = existing.gitRemote ? redactRemote(existing.gitRemote) : "none";
    return new SelfProjectConflictError(
      `A project "${SELF_PROJECT_ID}" already exists with a different remote (${remote}); not overwriting it.`,
    );
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
