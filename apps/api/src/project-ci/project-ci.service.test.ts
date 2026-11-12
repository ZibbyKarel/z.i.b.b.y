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
const RUNS = "/repos/acme/app/actions/runs?branch=main&per_page=50";
const JOBS_11 = "/repos/acme/app/actions/runs/11/jobs?per_page=100";
const JOBS_12 = "/repos/acme/app/actions/runs/12/jobs?per_page=100";

/** A red base branch: CI failed in `test` → step `Run tests`; Lint is still running; an older run is ignored. */
const routes = (): Record<string, unknown> => ({
  "/repos/acme/app": { default_branch: "main" },
  [RUNS]: {
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
      { id: 12, workflow_id: 2, name: "Lint", head_sha: "abc", status: "in_progress" },
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
  [JOBS_11]: {
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
  [JOBS_12]: { jobs: [{ id: 102, name: "lint", status: "in_progress", steps: [] }] },
});

type FakeTask = {
  id: string;
  projectId?: string;
  status: string;
  baseFixCi?: { projectId: string; headSha: string };
  outcome?: unknown;
};

describe("ProjectCiService", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let gh: Record<string, unknown>;
  let integrations: Integration[];
  let project: Project;
  let createTask: ReturnType<typeof vi.fn>;
  let tasks: FakeTask[];
  let service: ProjectCiService;
  const calls = (path: string) =>
    fetchImpl.mock.calls.filter(([u]) => u === `https://api.github.com${path}`).length;

  beforeEach(() => {
    gh = routes();
    integrations = [GITHUB];
    project = PROJECT;
    tasks = [];
    fetchImpl = vi.fn(async (url: string) => {
      const body = gh[url.replace("https://api.github.com", "")];
      return body ? new Response(JSON.stringify(body)) : new Response("{}", { status: 404 });
    });
    let n = 0;
    createTask = vi.fn(async (_input: unknown, _now: number, projectId: string) => {
      await new Promise((r) => setTimeout(r, 5)); // a slow create widens the double-click race
      const task: FakeTask = { id: `task_${++n}`, projectId, status: "dispatched" };
      tasks.push(task);
      return { task };
    });
    const storage = {
      list: async () => tasks,
      setBaseFixCi: async (id: string, baseFixCi: FakeTask["baseFixCi"]) => {
        const t = tasks.find((x) => x.id === id);
        if (t) t.baseFixCi = baseFixCi;
        return t;
      },
    };
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
      storage as never,
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
      ["Lint", "running"],
    ]);
    expect(ci.workflows[0]?.jobs[0]?.steps.map((s) => s.state)).toEqual([
      "passing",
      "failing",
      "skipped",
    ]);
  });

  it("caches per project for PROJECT_CI_CACHE_MS", async () => {
    await service.get("acme", false, 1_000);
    const before = fetchImpl.mock.calls.length;
    await service.get("acme", false, 1_000 + PROJECT_CI_CACHE_MS - 1);
    expect(fetchImpl.mock.calls.length).toBe(before);
    await service.get("acme", false, 1_000 + PROJECT_CI_CACHE_MS);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(before);
  });

  it("fetches the jobs of a completed run once; an in-progress run refetches", async () => {
    await service.get("acme", true);
    await service.get("acme", true);
    await service.get("acme", true);
    expect(calls(JOBS_11)).toBe(1);
    expect(calls(JOBS_12)).toBe(3);
    expect(calls(RUNS)).toBe(3);
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

  it("an unreachable repo is state error (rate limit vs no access), cached like data", async () => {
    fetchImpl.mockResolvedValue(
      new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }),
    );
    const limited = await service.get("acme", false, 1_000);
    expect(limited).toMatchObject({ provider: "github", state: "error", workflows: [] });
    expect(limited.error).toMatch(/rate limited/);
    const before = fetchImpl.mock.calls.length;
    await service.get("acme", false, 1_000 + PROJECT_CI_CACHE_MS - 1);
    expect(fetchImpl.mock.calls.length).toBe(before);

    fetchImpl.mockResolvedValue(
      new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "42" } }),
    );
    const denied = await service.get("acme", true);
    expect(denied.state).toBe("error");
    expect(denied.error).toMatch(/no access/);
    await expect(service.get("nope")).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("fix creates a PR-output task stamped with baseFixCi", async () => {
    expect(await service.fix("acme")).toEqual({ taskId: "task_1" });
    const [input, , projectId, target] = createTask.mock.calls[0] ?? [];
    expect(projectId).toBe("acme");
    expect(target).toBeUndefined();
    expect(input.output).toEqual({ type: "pr" });
    expect(input.title).toBe("Fix base-branch CI: acme/app@main");
    expect(input.text).toContain("CI / test (failed steps: Run tests)");
    expect(input.text).toContain("untrusted data");
    expect(tasks[0]?.baseFixCi).toEqual({ projectId: "acme", headSha: "abc" });
    expect((await service.get("acme")).fixTaskId).toBe("task_1");
  });

  it("concurrent clicks create exactly one task", async () => {
    const results = await Promise.allSettled([service.fix("acme"), service.fix("acme")]);
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ProjectCiConflictError);
  });

  it("fix refuses an open fix for the sha, a green branch, and a project without github", async () => {
    tasks = [
      {
        id: "t0",
        projectId: "acme",
        status: "dispatched",
        baseFixCi: { projectId: "acme", headSha: "abc" },
      },
    ];
    await expect(service.fix("acme")).rejects.toBeInstanceOf(ProjectCiConflictError);
    // A finished fix for the same sha no longer blocks.
    tasks[0]!.outcome = { status: "done" };
    await expect(service.fix("acme")).resolves.toMatchObject({ taskId: "task_1" });
    integrations = [];
    await expect(service.fix("acme")).rejects.toBeInstanceOf(NoGithubLinkError);
    integrations = [GITHUB];
    tasks = [];
    gh[RUNS] = { workflow_runs: [] };
    await expect(service.fix("acme")).rejects.toBeInstanceOf(ProjectCiConflictError);
  });
});

describe("ciStateOf / rollup", () => {
  it("maps GitHub status + conclusion", () => {
    expect(ciStateOf("queued")).toBe("pending");
    expect(ciStateOf("in_progress")).toBe("running");
    expect(ciStateOf("completed", "timed_out")).toBe("failing");
    expect(ciStateOf("completed", "cancelled")).toBe("cancelled");
    expect(ciStateOf("completed", "neutral")).toBe("skipped");
    expect(ciStateOf(undefined)).toBe("none");
  });
  it("rolls up worst-first", () => {
    expect(rollup(["passing", "running", "failing"])).toBe("failing");
    expect(rollup(["passing", "pending"])).toBe("pending");
    expect(rollup(["passing", "cancelled"])).toBe("passing");
    expect(rollup(["cancelled", "skipped"])).toBe("cancelled");
    expect(rollup([])).toBe("none");
  });
});
