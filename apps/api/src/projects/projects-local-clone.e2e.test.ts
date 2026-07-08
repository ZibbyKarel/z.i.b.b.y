import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { MACHINE_CONFIG_FILE, MachineConfigStore } from "../machine/machine-config.store";
import { WorkspaceService } from "../workspace/workspace.service";
import { ProjectLocalService } from "./project-local.service";
import { PROJECT_SECRETS_DIR, ProjectSecretsStore } from "./project-secrets.store";
import { ProjectVaultService } from "./project-vault.service";
import { ProjectsController } from "./projects.controller";
import { PROJECTS_DIR, ProjectsStorageService } from "./projects.storage.service";
import { ResolvedProjectService } from "./resolved-project.service";
import { StandupService } from "./standup.service";

const exec = promisify(execFile);

/** A throwaway git repo with one commit — same fixture shape used across the suite. */
async function initRepo(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await exec("git", ["init", "-b", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "test@zibby.local"], { cwd: dir });
  await exec("git", ["config", "user.name", "ZIBBY Test"], { cwd: dir });
  await fs.writeFile(path.join(dir, "a.txt"), "x", "utf8");
  await exec("git", ["add", "-A"], { cwd: dir });
  await exec("git", ["commit", "-m", "initial"], { cwd: dir });
}

/**
 * HTTP e2e for the Phase 76 local-clone routes: `GET /projects/:id/local-state`
 * and `POST /projects/:id/clone`. A MINIMAL testing module — only what
 * `ProjectsController`'s constructor needs to resolve, mirroring
 * `tasks-attachments.test.ts` — with the routes' actual collaborators
 * (`ProjectsStorageService`, `ProjectSecretsStore`, `ProjectLocalService` and its
 * `WorkspaceService`/`MachineConfigStore`) real, and the unrelated ones
 * (`StandupService`, `ProjectVaultService`, `ResolvedProjectService`) stubbed.
 */
describe("Phase 76 — GET /api/projects/:id/local-state, POST /api/projects/:id/clone", () => {
  let app: INestApplication;
  let root: string;
  let cloneRoot: string;
  let storage: ProjectsStorageService;
  let workspace: WorkspaceService;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "projects-local-e2e-"));
    cloneRoot = path.join(root, "clone-root");

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: PROJECTS_DIR, useFactory: () => path.join(root, "projects") },
        { provide: PROJECT_SECRETS_DIR, useFactory: () => path.join(root, "project-secrets") },
        { provide: MACHINE_CONFIG_FILE, useFactory: () => path.join(root, "machine-config.json") },
        ProjectsStorageService,
        ProjectSecretsStore,
        MachineConfigStore,
        WorkspaceService,
        ProjectLocalService,
        { provide: StandupService, useValue: {} },
        {
          provide: ProjectVaultService,
          useValue: { write: async () => {}, remove: async () => {} },
        },
        { provide: ResolvedProjectService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    storage = moduleRef.get(ProjectsStorageService);
    workspace = moduleRef.get(WorkspaceService);
    const secrets = moduleRef.get(ProjectSecretsStore);
    await secrets.onModuleInit();
    const machineConfig = moduleRef.get(MachineConfigStore);
    await machineConfig.write({ cloneRoot });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("404s local-state for an unknown project", async () => {
    const res = await request(app.getHttpServer()).get("/api/projects/ghost/local-state");
    expect(res.status).toBe(404);
  });

  it("reports absent (source: none) for a project whose path doesn't exist yet", async () => {
    await storage.create({ id: "beta", name: "Beta", path: path.join(root, "beta-nowhere") });
    const res = await request(app.getHttpServer()).get("/api/projects/beta/local-state");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      present: false,
      isGitRepo: false,
      resolvedPath: null,
      source: "none",
      cloneRoot,
    });
  });

  it("reports present (source: path) once the project's path is a real git repo", async () => {
    const projectPath = path.join(root, "gamma-repo");
    await initRepo(projectPath);
    await storage.create({ id: "gamma", name: "Gamma", path: projectPath });

    const res = await request(app.getHttpServer()).get("/api/projects/gamma/local-state");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      present: true,
      isGitRepo: true,
      resolvedPath: projectPath,
      source: "path",
      cloneRoot,
    });
  });

  it("404s clone for an unknown project", async () => {
    const res = await request(app.getHttpServer()).post("/api/projects/ghost/clone");
    expect(res.status).toBe(404);
  });

  it("422s clone when the project has no gitRemote", async () => {
    await storage.create({ id: "delta", name: "Delta", path: path.join(root, "delta-nowhere") });
    const res = await request(app.getHttpServer()).post("/api/projects/delta/clone");
    expect(res.status).toBe(422);
  });

  it("409s clone when the project is already present on this machine", async () => {
    const projectPath = path.join(root, "epsilon-repo");
    await initRepo(projectPath);
    await storage.create({
      id: "epsilon",
      name: "Epsilon",
      path: projectPath,
      gitRemote: "https://example.invalid/epsilon.git",
    });

    const res = await request(app.getHttpServer()).post("/api/projects/epsilon/clone");
    expect(res.status).toBe(409);
  });

  it("200s clone: clones into <cloneRoot>/<id> and returns the fresh local state (WorkspaceService.clone mocked — no real network)", async () => {
    await storage.create({
      id: "zeta",
      name: "Zeta",
      path: path.join(root, "zeta-nowhere"),
      gitRemote: "https://example.invalid/zeta.git",
    });
    const dest = path.join(cloneRoot, "zeta");
    const cloneSpy = vi
      .spyOn(workspace, "clone")
      .mockImplementation(async (_remote, dir) => initRepo(dir));

    const res = await request(app.getHttpServer()).post("/api/projects/zeta/clone");

    expect(cloneSpy).toHaveBeenCalledWith("https://example.invalid/zeta.git", dest);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      present: true,
      isGitRepo: true,
      resolvedPath: dest,
      source: "cloneRoot",
      cloneRoot,
    });
  });
});
