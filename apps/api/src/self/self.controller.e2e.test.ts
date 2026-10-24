import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Same promisify-aware `execFile` mock as `self.service.test.ts`: the REAL
// SelfService runs behind the controller, only git/gh are stubbed.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("node:child_process", () => {
  const customPromisify = Symbol.for("nodejs.util.promisify.custom");
  Object.defineProperty(execFileMock, customPromisify, {
    value: (file: string, args: string[], options: unknown) =>
      new Promise((resolve, reject) => {
        execFileMock(file, args, options, (error: Error | null, stdout: string, stderr: string) => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        });
      }),
  });
  return { execFile: execFileMock };
});

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { MachineConfigStore } from "../machine/machine-config.store";
import { ProjectConflictError } from "../projects/projects.errors";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { SelfController } from "./self.controller";
import { SelfService } from "./self.service";

type Resp = { stdout: string } | { error: Error };

function mockGit(responses: Record<string, Resp>): void {
  execFileMock.mockImplementation((...callArgs: unknown[]) => {
    const key = `${callArgs[0] as string} ${((callArgs[1] as string[]) ?? []).join(" ")}`.trim();
    const callback = callArgs[callArgs.length - 1] as (
      error: Error | null,
      stdout: string,
      stderr: string,
    ) => void;
    const resp = responses[key];
    if (!resp) callback(new Error(`unmocked exec call: ${key}`), "", "");
    else if ("error" in resp) callback(resp.error, "", "");
    else callback(null, resp.stdout, "");
    return {} as never;
  });
}

const ORIGIN = "git remote get-url origin";
const SSH = "git@github.com:me/zibby.git";

/**
 * HTTP e2e for `POST /api/self/project` (A5): every `ensureSelfProject` refusal
 * surfaces as a 409 `{ message }` — never a 500. A minimal testing module: the
 * real controller + service, with the projects registry and machine config
 * stubbed per test.
 */
describe("POST /api/self/project — conflicts map to 409 { message }", () => {
  let app: INestApplication;
  const projects = { list: vi.fn(), create: vi.fn() };
  const machineConfig = { read: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SelfController],
      providers: [
        SelfService,
        { provide: ProjectsStorageService, useValue: projects },
        { provide: MachineConfigStore, useValue: machineConfig },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    execFileMock.mockReset();
    projects.list.mockReset();
    projects.create.mockReset();
    machineConfig.read.mockReset();
  });

  const post = () => request(app.getHttpServer()).post("/api/self/project").send({});

  const expect409 = async (): Promise<string> => {
    const res = await post();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: expect.any(String) });
    return (res.body as { message: string }).message;
  };

  it("no origin remote → 409", async () => {
    mockGit({ [ORIGIN]: { error: new Error("No such remote 'origin'") } });
    projects.list.mockResolvedValue([]);
    expect(await expect409()).toMatch(/no `origin`/);
  });

  it("invalid origin → 409 (credentials redacted)", async () => {
    mockGit({ [ORIGIN]: { stdout: "https://u:tok@github.com/has space" } });
    projects.list.mockResolvedValue([]);
    expect(await expect409()).not.toContain("tok");
  });

  it("a foreign `zibby` project → 409, not overwritten", async () => {
    mockGit({ [ORIGIN]: { stdout: SSH } });
    projects.list.mockResolvedValue([{ id: "zibby", gitRemote: "git@github.com:x/y.git" }]);
    expect(await expect409()).toMatch(/different remote/);
    expect(projects.create).not.toHaveBeenCalled();
  });

  it("<cloneRoot>/zibby is the install itself → 409", async () => {
    mockGit({ [ORIGIN]: { stdout: SSH } });
    projects.list.mockResolvedValue([]);
    // A non-existent root, so realpath falls back to path.resolve on both sides.
    vi.spyOn(SelfService.prototype as never, "cwd" as never).mockReturnValue(
      "/nonexistent-self-e2e/zibby" as never,
    );
    machineConfig.read.mockResolvedValue({ cloneRoot: "/nonexistent-self-e2e" });
    try {
      expect(await expect409()).toMatch(/running ZIBBY install itself/);
      expect(projects.create).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("a lost create race to a foreign project → 409, not 500", async () => {
    mockGit({ [ORIGIN]: { stdout: SSH } });
    projects.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "zibby", gitRemote: "git@github.com:x/y.git" }]);
    machineConfig.read.mockResolvedValue({ cloneRoot: "/tmp/zibby-clones" });
    projects.create.mockRejectedValue(new ProjectConflictError("zibby"));
    expect(await expect409()).toMatch(/different remote/);
  });

  it("success → 200 with the ensure result", async () => {
    mockGit({ [ORIGIN]: { stdout: SSH } });
    projects.list.mockResolvedValue([]);
    machineConfig.read.mockResolvedValue({ cloneRoot: "/tmp/zibby-clones" });
    projects.create.mockImplementation(async (input: unknown) => input);
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ projectId: "zibby", created: true });
  });
});
