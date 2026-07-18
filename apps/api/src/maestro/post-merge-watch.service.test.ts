import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Integration, MergeWatch, Project } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MergeWatchStore } from "./merge-watch.store";
import { PostMergeWatchService } from "./post-merge-watch.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const PROJECT: Project = { id: "acme", name: "acme", path: "~/Projects/acme" };
const GITHUB_INTEGRATION: Integration = {
  id: "acme-github",
  kind: "github",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"] },
};

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const NOW = new Date("2026-07-17T10:00:00.000Z");

function watch(over: Partial<MergeWatch> = {}): MergeWatch {
  return {
    id: "merge-acme-app-abc123",
    projectId: "acme",
    repo: "acme/app",
    sha: "abc123",
    prNumber: 42,
    prTitle: "PR #42",
    mergedAt: "2026-07-17T09:00:00.000Z",
    deadline: "2026-07-17T11:00:00.000Z",
    attempts: 0,
    state: "watching",
    ...over,
  };
}

describe("PostMergeWatchService", () => {
  let dir: string;
  let store: MergeWatchStore;
  let projects: { get: ReturnType<typeof vi.fn> };
  let resolvedProjects: { resolveIntegrations: ReturnType<typeof vi.fn> };
  let credentials: { read: ReturnType<typeof vi.fn> };
  let monitorEvents: { listStatuses: ReturnType<typeof vi.fn> };
  let scheduler: { createTask: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  let fetchImpl: ReturnType<typeof vi.fn>;

  const makeService = () =>
    new PostMergeWatchService(
      store,
      projects as never,
      resolvedProjects as never,
      credentials as never,
      monitorEvents as never,
      scheduler as never,
      activity as never,
      fakeLogger as never,
      fetchImpl as unknown as typeof fetch,
    );

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "post-merge-watch-"));
    store = new MergeWatchStore(dir);
    await store.onModuleInit();
    projects = { get: vi.fn(async () => PROJECT) };
    resolvedProjects = { resolveIntegrations: vi.fn(async () => [GITHUB_INTEGRATION]) };
    credentials = { read: vi.fn(async () => ({ token: "ghp_x" })) };
    monitorEvents = { listStatuses: vi.fn(async () => []) };
    scheduler = {
      createTask: vi.fn(async () => ({ outcome: "dispatched", task: { id: "task_9" } })),
    };
    activity = { record: vi.fn(async () => {}) };
    fetchImpl = vi.fn();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("green: all check-runs passing → state green, outcome recorded, no fix task", async () => {
    await store.putNew(watch());
    fetchImpl.mockResolvedValue(
      jsonResponse(200, { check_runs: [{ status: "completed", conclusion: "success" }] }),
    );

    const result = await makeService().poll(NOW);

    expect(result).toEqual({ resolved: 1 });
    expect((await store.get(watch().id)).state).toBe("green");
    expect(scheduler.createTask).not.toHaveBeenCalled();
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "post-merge-outcome" }),
    );
  });

  it("red → gated fix: a failing check-run dispatches a task; no PUT/merge call anywhere", async () => {
    await store.putNew(watch());
    fetchImpl.mockResolvedValue(
      jsonResponse(200, { check_runs: [{ status: "completed", conclusion: "failure" }] }),
    );

    const result = await makeService().poll(NOW);

    expect(result).toEqual({ resolved: 1 });
    expect(scheduler.createTask).toHaveBeenCalledTimes(1);
    expect(scheduler.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ paths: [] }),
      expect.any(Number),
      "acme",
    );
    const updated = await store.get(watch().id);
    expect(updated.state).toBe("red");
    expect(updated.taskId).toBe("task_9");

    // Invariant (d): PostMergeWatchService performs NO PUT/merge call of its own.
    for (const call of fetchImpl.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.method).not.toBe("PUT");
      expect(String(call[0])).not.toContain("/merge");
    }
  });

  it("pending: an in-progress check-run leaves the watch watching, attempts increments", async () => {
    await store.putNew(watch());
    fetchImpl.mockResolvedValue(jsonResponse(200, { check_runs: [{ status: "in_progress" }] }));

    const result = await makeService().poll(NOW);

    expect(result).toEqual({ resolved: 0 });
    const updated = await store.get(watch().id);
    expect(updated.state).toBe("watching");
    expect(updated.attempts).toBe(1);
    expect(scheduler.createTask).not.toHaveBeenCalled();
  });

  it("expiry: now past the deadline → expired, outcome recorded, no task, no fetch", async () => {
    await store.putNew(watch({ deadline: "2026-07-17T09:30:00.000Z" }));

    const result = await makeService().poll(NOW);

    expect(result).toEqual({ resolved: 1 });
    expect((await store.get(watch().id)).state).toBe("expired");
    expect(scheduler.createTask).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "post-merge-outcome" }),
    );
  });

  it("CI-sidecar reuse: a matching green monitor status resolves without a check-runs fetch", async () => {
    await store.putNew(watch());
    monitorEvents.listStatuses.mockResolvedValue([
      {
        integrationId: "acme-github",
        projectId: "acme",
        adapterKind: "github-ci",
        state: "green",
        sinceAt: "2026-07-17T09:05:00.000Z",
        checkedAt: "2026-07-17T09:10:00.000Z", // after mergedAt (09:00) — covers this merge
        summary: "build.yml passed on main",
      },
    ]);

    const result = await makeService().poll(NOW);

    expect(result).toEqual({ resolved: 1 });
    expect((await store.get(watch().id)).state).toBe("green");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fail-open: no token leaves the watch watching, never throws", async () => {
    credentials.read.mockResolvedValue(null);
    await store.putNew(watch());

    const result = await makeService().poll(NOW);

    expect(result).toEqual({ resolved: 0 });
    expect((await store.get(watch().id)).state).toBe("watching");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fail-open: a 403 from GitHub leaves the watch watching (pending rollup), never throws", async () => {
    await store.putNew(watch());
    fetchImpl.mockResolvedValue(jsonResponse(403, {}));

    const result = await makeService().poll(NOW);

    expect(result).toEqual({ resolved: 0 });
    const updated = await store.get(watch().id);
    expect(updated.state).toBe("watching");
    expect(updated.attempts).toBe(1);
  });

  it("fail-open: createTask throwing leaves the watch watching for the next tick's retry", async () => {
    await store.putNew(watch());
    fetchImpl.mockResolvedValue(
      jsonResponse(200, { check_runs: [{ status: "completed", conclusion: "failure" }] }),
    );
    scheduler.createTask.mockRejectedValue(new Error("classifier down"));

    const result = await makeService().poll(NOW);

    expect(result).toEqual({ resolved: 0 });
    expect((await store.get(watch().id)).state).toBe("watching");
  });

  it("per-watch try/catch: one failing watch never blocks another's resolution", async () => {
    await store.putNew(watch({ id: "merge-a-1", projectId: "acme" }));
    await store.putNew(watch({ id: "merge-b-2", projectId: "beta" }));
    projects.get.mockImplementation(async (id: string) => {
      if (id === "beta") throw new Error("boom");
      return PROJECT;
    });
    fetchImpl.mockResolvedValue(
      jsonResponse(200, { check_runs: [{ status: "completed", conclusion: "success" }] }),
    );

    const result = await makeService().poll(NOW);

    // "beta"'s project lookup throws → caught in resolveOne's try, so it's still
    // treated as fail-open (stays watching); "acme" resolves normally.
    expect((await store.get("merge-a-1")).state).toBe("green");
    expect(result.resolved).toBeGreaterThanOrEqual(1);
  });
});
