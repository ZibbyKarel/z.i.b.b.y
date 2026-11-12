import type { Integration, Project } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import {
  PROJECT_CI_CACHE_MS,
  ProjectCiConflictError,
  ProjectCiService,
  ciStateOf,
  rollup,
} from "./project-ci.service";

const PROJECT: Project = { id: "acme", name: "Acme", path: "~/acme" };
const GITHUB = { id: "gh", config: { kind: "github", repo: "acme/app" } } as unknown as Integration;

/** A red base branch: CI failed in `test` → step `Run tests`; Lint passed; an older run is ignored. */
const ROUTES: Record<string, unknown> = {
  "/repos/acme/app": { default_branch: "main" },
  "/repos/acme/app/actions/runs?branch=main&per_page=50": {
    workflow_runs: [
      {
        id: 11,
        workflow_id: 1,
        name: "CI",
        head_sha: "abc",
        status: "completed",
        conclusion: "failure",
        html_url: "u11",
      },
      {
        id: 12,
        workflow_id: 2,
        name: "Lint",
        head_sha: "abc",
        status: "completed",
        conclusion: "success",
      },
      {
        id: 9,
        workflow_id: 1,
        name: "CI",
        head_sha: "old",
        status: "completed",
        conclusion: "success",
      },
    ],
  },
  "/repos/acme/app/actions/runs/11/jobs?per_page=100": {
    jobs: [
      {
        id: 101,
        name: "test",
        status: "completed",
        conclusion: "failure",
        steps: [
          { number: 1, name: "Checkout", status: "completed", conclusion: "success" },
          { number: 2, name: "Run tests", status: "completed", conclusion: "failure" },
          { number: 3, name: "Upload", status: "completed", conclusion: "skipped" },
        ],
      },
    ],
  },
  "/repos/acme/app/actions/runs/12/jobs?per_page=100": {
    jobs: [{ id: 102, name: "lint", status: "completed", conclusion: "success", steps: [] }],
  },
};

describe("ProjectCiService", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let integrations: Integration[];
  let project: Project;
  let createTask: ReturnType<typeof vi.fn>;
  let tasks: { id: string; projectId?: string; title?: string; status: string }[];
  let service: ProjectCiService;

  beforeEach(() => {
    integrations = [GITHUB];
    project = PROJECT;
    tasks = [];
    fetchImpl = vi.fn(async (url: string) => {
      const body = ROUTES[url.replace("https://api.github.com", "")];
      return body ? new Response(JSON.stringify(body)) : new Response("{}", { status: 404 });
    });
    createTask = vi.fn(async () => ({ task: { id: "task_1" } }));
    service = new ProjectCiService(
      {
        get: async (id: string) => {
          if (id !== PROJECT.id) throw new ProjectNotFoundError(id);
          return project;
        },
      } as never,
      { resolveIntegrations: async () => integrations } as never,
      { read: async () => ({ token: "tok" }) } as never,
      { createTask } as never,
      { list: async () => tasks } as never,
      fetchImpl as unknown as typeof fetch,
    );
  });

  it("reads base-branch runs of the newest commit with jobs and failed steps", async () => {
    const ci = await service.get("acme");
    expect(ci).toMatchObject({
      provider: "github",
      repoUrl: "https://github.com/acme/app",
      branch: "main",
      headSha: "abc",
      state: "failing",
    });
    expect(ci.workflows.map((w) => [w.name, w.state])).toEqual([
      ["CI", "failing"],
      ["Lint", "passing"],
    ]);
    expect(ci.workflows[0]?.jobs[0]?.steps.map((s) => s.state)).toEqual([
      "passing",
      "failing",
      "skipped",
    ]);
  });

  it("caches per project for PROJECT_CI_CACHE_MS", async () => {
    await service.get("acme", false, 1_000);
    const calls = fetchImpl.mock.calls.length;
    await service.get("acme", false, 1_000 + PROJECT_CI_CACHE_MS - 1);
    expect(fetchImpl.mock.calls.length).toBe(calls);
    await service.get("acme", false, 1_000 + PROJECT_CI_CACHE_MS);
    expect(fetchImpl.mock.calls.length).toBe(calls * 2);
  });

  it("no github link: gitlab from gitRemote (deferred) or none — never an error", async () => {
    integrations = [];
    project = { ...PROJECT, gitRemote: "git@gitlab.com:acme/app.git" };
    expect(await service.get("acme")).toMatchObject({
      provider: "gitlab",
      repoUrl: "https://gitlab.com/acme/app",
      state: "none",
      workflows: [],
    });
    project = PROJECT;
    expect((await service.get("acme", true)).provider).toBe("none");
  });

  it("throws on rate limit and ProjectNotFound", async () => {
    fetchImpl.mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(service.get("acme")).rejects.toThrow(/rate limited/);
    await expect(service.get("nope")).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("fix creates a PR-output task naming the failed job and step", async () => {
    expect(await service.fix("acme")).toEqual({ taskId: "task_1" });
    const [input, , projectId, target] = createTask.mock.calls[0] ?? [];
    expect(projectId).toBe("acme");
    expect(target).toBeUndefined();
    expect(input.output).toEqual({ type: "pr" });
    expect(input.title).toBe("Fix base-branch CI: acme/app@main");
    expect(input.text).toContain("CI / test (failed steps: Run tests)");
    expect(input.text).toContain("untrusted data");
  });

  it("fix refuses a green branch, a running fix, and a project without github", async () => {
    tasks = [{ id: "t0", projectId: "acme", title: "Fix base-branch CI: x", status: "dispatched" }];
    await expect(service.fix("acme")).rejects.toBeInstanceOf(ProjectCiConflictError);
    integrations = [];
    await expect(service.fix("acme")).rejects.toBeInstanceOf(NoGithubLinkError);
    integrations = [GITHUB];
    tasks = [];
    ROUTES["/repos/acme/app/actions/runs?branch=main&per_page=50"] = { workflow_runs: [] };
    await expect(service.fix("acme")).rejects.toBeInstanceOf(ProjectCiConflictError);
  });
});

describe("ciStateOf / rollup", () => {
  it("maps GitHub status + conclusion", () => {
    expect(ciStateOf("queued")).toBe("pending");
    expect(ciStateOf("in_progress")).toBe("running");
    expect(ciStateOf("completed", "timed_out")).toBe("failing");
    expect(ciStateOf("completed", "cancelled")).toBe("skipped");
    expect(ciStateOf(undefined)).toBe("none");
  });
  it("rolls up worst-first", () => {
    expect(rollup(["passing", "running", "failing"])).toBe("failing");
    expect(rollup(["passing", "pending"])).toBe("pending");
    expect(rollup([])).toBe("none");
  });
});
