import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@zibby/contracts";
import { MachineConfigStore } from "../machine/machine-config.store";
import { WorkspaceService } from "../workspace/workspace.service";
import { ProjectLocalService } from "./project-local.service";
import { ProjectAlreadyClonedError, ProjectNoRemoteError } from "./projects.errors";

const exec = promisify(execFile);

/** A throwaway git repo with one commit — same fixture shape as workspace.service.test.ts. */
async function initRepo(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@zibby.local"], { cwd: dir });
  await exec("git", ["config", "user.name", "ZIBBY Test"], { cwd: dir });
  await fs.writeFile(path.join(dir, "README.md"), "# fixture\n", "utf8");
  await exec("git", ["add", "-A"], { cwd: dir });
  await exec("git", ["commit", "-m", "initial"], { cwd: dir });
}

describe("ProjectLocalService (Phase 76 — per-machine clone resolution)", () => {
  let root: string;
  let cloneRoot: string;
  let machineConfig: MachineConfigStore;
  let workspace: WorkspaceService;
  let service: ProjectLocalService;

  const project = (over: Partial<Project> = {}): Project => ({
    id: "alpha",
    name: "Alpha",
    path: path.join(root, "at-path"),
    ...over,
  });

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "project-local-"));
    cloneRoot = path.join(root, "clone-root");
    machineConfig = new MachineConfigStore(path.join(root, "machine-config.json"));
    await machineConfig.write({ cloneRoot });
    workspace = new WorkspaceService();
    service = new ProjectLocalService(workspace, machineConfig);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  describe("resolve", () => {
    it("reports present at project.path when it's a git repo (source: path)", async () => {
      const p = project();
      await initRepo(p.path);
      expect(await service.resolve(p)).toEqual({
        present: true,
        isGitRepo: true,
        resolvedPath: p.path,
        source: "path",
        cloneRoot,
      });
    });

    it("falls back to <cloneRoot>/<id> when path is absent but the clone exists (source: cloneRoot)", async () => {
      const p = project({ path: path.join(root, "does-not-exist") });
      const candidate = path.join(cloneRoot, p.id);
      await initRepo(candidate);
      expect(await service.resolve(p)).toEqual({
        present: true,
        isGitRepo: true,
        resolvedPath: candidate,
        source: "cloneRoot",
        cloneRoot,
      });
    });

    it("reports absent when neither location resolves (source: none)", async () => {
      const p = project({ path: path.join(root, "does-not-exist") });
      expect(await service.resolve(p)).toEqual({
        present: false,
        isGitRepo: false,
        resolvedPath: null,
        source: "none",
        cloneRoot,
      });
    });

    it("reports absent when path exists but is not a git repo (a plain folder)", async () => {
      const p = project();
      await fs.mkdir(p.path, { recursive: true }); // no git init
      const state = await service.resolve(p);
      expect(state.source).toBe("none");
      expect(state.present).toBe(false);
    });

    it("prefers path over cloneRoot when both are present git repos", async () => {
      const p = project();
      await initRepo(p.path);
      await initRepo(path.join(cloneRoot, p.id));
      expect((await service.resolve(p)).source).toBe("path");
    });
  });

  describe("clone", () => {
    it("rejects with ProjectNoRemoteError when the project has no gitRemote", async () => {
      const p = project({ path: path.join(root, "does-not-exist") });
      await expect(service.clone(p)).rejects.toBeInstanceOf(ProjectNoRemoteError);
    });

    it("rejects with ProjectAlreadyClonedError when already present", async () => {
      const p = project({ gitRemote: "https://example.invalid/alpha.git" });
      await initRepo(p.path);
      await expect(service.clone(p)).rejects.toBeInstanceOf(ProjectAlreadyClonedError);
    });

    it("runs WorkspaceService.clone into <cloneRoot>/<id> and returns the fresh resolve()", async () => {
      const p = project({
        path: path.join(root, "does-not-exist"),
        gitRemote: "https://example.invalid/alpha.git",
      });
      const dest = path.join(cloneRoot, p.id);
      const cloneSpy = vi.spyOn(workspace, "clone").mockImplementation(async (_remote, dir) => {
        await initRepo(dir);
      });

      const state = await service.clone(p);

      expect(cloneSpy).toHaveBeenCalledWith(p.gitRemote, dest);
      expect(state).toEqual({
        present: true,
        isGitRepo: true,
        resolvedPath: dest,
        source: "cloneRoot",
        cloneRoot,
      });
    });

    it("never touches project.path or the registry — only the local clone dir", async () => {
      const p = project({
        path: path.join(root, "does-not-exist"),
        gitRemote: "https://example.invalid/alpha.git",
      });
      vi.spyOn(workspace, "clone").mockImplementation(async (_remote, dir) => {
        await initRepo(dir);
      });
      await service.clone(p);
      // `project.path` was never created as a side effect of cloning.
      expect(
        await fs
          .access(p.path)
          .then(() => true)
          .catch(() => false),
      ).toBe(false);
    });
  });
});
