import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import type { Project, ProjectLocalState } from "@zibby/contracts";
import { MachineConfigStore } from "../machine/machine-config.store";
import { ensureDir } from "../shared/file-storage";
import { WorkspaceService } from "../workspace/workspace.service";
import {
  ProjectAlreadyClonedError,
  ProjectLocalUnresolvedError,
  ProjectNoRemoteError,
} from "./projects.errors";

/**
 * Phase 76 — per-machine resolution of where a project's working dir actually
 * lives. `project.path` is the canonical, SYNCED registry field, but on any one
 * machine it may not exist yet (a fresh machine, a not-yet-cloned project); this
 * service tells the caller what THIS machine sees, and can clone the project
 * into the machine-local `cloneRoot` when it's missing. `path`/the registry are
 * NEVER mutated here — cloning is a local filesystem side effect only.
 */
@Injectable()
export class ProjectLocalService {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly machineConfig: MachineConfigStore,
  ) {}

  /**
   * THIS machine's view: `project.path` if it exists and is a git repo
   * (`source: "path"`); else `<cloneRoot>/<project.id>` if THAT exists and is a
   * git repo (`source: "cloneRoot"` — a prior local clone); else absent
   * (`source: "none"`, `resolvedPath: null` — needs a clone).
   */
  async resolve(project: Project): Promise<ProjectLocalState> {
    const { cloneRoot } = await this.machineConfig.read();

    if (await this.isPresentGitRepo(project.path)) {
      return {
        present: true,
        isGitRepo: true,
        // Non-null: `isPresentGitRepo` only returns true for a defined `dir`.
        resolvedPath: project.path as string,
        source: "path",
        cloneRoot,
      };
    }

    const candidate = path.join(cloneRoot, project.id);
    if (await this.isPresentGitRepo(candidate)) {
      return {
        present: true,
        isGitRepo: true,
        resolvedPath: candidate,
        source: "cloneRoot",
        cloneRoot,
      };
    }

    return { present: false, isGitRepo: false, resolvedPath: null, source: "none", cloneRoot };
  }

  /**
   * Clone the project's `gitRemote` into `<cloneRoot>/<project.id>` on this
   * machine. Rejects with {@link ProjectNoRemoteError} (→ 422) when the project
   * has no `gitRemote`, and {@link ProjectAlreadyClonedError} (→ 409) when
   * `resolve()` already reports it present — re-cloning would be a no-op at
   * best, a collision at worst. Never touches `project.path` or the registry.
   */
  async clone(project: Project): Promise<ProjectLocalState> {
    if (!project.gitRemote) {
      throw new ProjectNoRemoteError(project.id);
    }
    const state = await this.resolve(project);
    if (state.present) {
      throw new ProjectAlreadyClonedError(project.id);
    }

    const dest = path.join(state.cloneRoot, project.id);
    await ensureDir(state.cloneRoot);
    await this.workspace.clone(project.gitRemote, dest);
    return this.resolve(project);
  }

  /**
   * Phase 77 — resolve the path a RUN (agent/goal/pipeline dispatch) should use
   * for `project` on THIS machine, cloning into `cloneRoot` when absent and a
   * `gitRemote` is configured. Returns:
   *
   * - `{ path: state.resolvedPath, isGitRepo: true }` when already present
   *   (`path` or a prior `cloneRoot` clone) — the caller cuts a worktree.
   * - the same shape, freshly cloned, when absent but `gitRemote` is set.
   * - `{ path: project.path, isGitRepo: false }` when absent, with no
   *   `gitRemote`, but `project.path` exists as an ordinary (non-git) folder —
   *   the pre-Phase-76 "non-git project" posture (direct checkout, no
   *   worktree), unaffected by the clone machinery.
   *
   * Throws {@link ProjectLocalUnresolvedError} only when NONE of the above
   * resolve — nothing on this machine to run against, and nothing to clone.
   */
  async resolveForRun(project: Project): Promise<{ path: string; isGitRepo: boolean }> {
    const state = await this.resolve(project);
    if (state.present) {
      // `present` only when resolve() found a real path — non-null by construction.
      return { path: state.resolvedPath as string, isGitRepo: true };
    }
    if (project.gitRemote) {
      const cloned = await this.clone(project);
      return { path: cloned.resolvedPath as string, isGitRepo: true };
    }
    const stat = project.path ? await fs.stat(project.path).catch(() => null) : null;
    if (stat?.isDirectory() && project.path) {
      return { path: project.path, isGitRepo: false };
    }
    throw new ProjectLocalUnresolvedError(project.id);
  }

  /** `dir` exists, is a directory, and is a git work tree — tolerant of ENOENT/undefined. */
  private async isPresentGitRepo(dir: string | undefined): Promise<boolean> {
    if (!dir) return false;
    const stat = await fs.stat(dir).catch(() => null);
    if (!stat?.isDirectory()) return false;
    return this.workspace.isGitRepo(dir);
  }
}
