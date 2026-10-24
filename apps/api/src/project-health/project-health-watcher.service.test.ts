import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Project } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectNotFoundError } from "../projects/projects.errors";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import type { SystemConfigStore } from "../system/system-config.store";
import {
  ProjectHealthConflictError,
  ProjectHealthDispatchError,
  ProjectHealthNotFoundError,
  ProjectHealthWatcherService,
} from "./project-health-watcher.service";
import { ProjectHealthStore } from "./project-health.store";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const ACME: Project = {
  id: "acme",
  name: "Acme Shop",
  healthCheck: { url: "https://acme.dev/health", intervalSec: 300 },
};
const BETA: Project = {
  id: "beta",
  name: "Beta",
  healthCheck: { url: "https://beta.dev/health", intervalSec: 60 },
};

const T0 = new Date("2026-10-24T08:00:00.000Z");
const after = (sec: number) => new Date(T0.getTime() + sec * 1000);

describe("ProjectHealthWatcherService", () => {
  let dir: string;
  let store: ProjectHealthStore;
  let projectList: Project[];
  let projects: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let scheduler: { createTask: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  /** Per-url scripted response status; a missing url answers 200. */
  let responses: Map<string, number | Error>;
  let fetchImpl: ReturnType<typeof vi.fn>;

  const makeWatcher = (
    opts: { systemConfig?: SystemConfigStore; timeoutMs?: number; register?: () => void } = {},
  ) =>
    new ProjectHealthWatcherService(
      projects as never,
      store,
      scheduler as never,
      activity as never,
      opts.systemConfig ?? fakeSystemConfigStore(),
      { register: opts.register ?? (() => {}) } as never,
      fakeLogger as never,
      fetchImpl as unknown as typeof fetch,
      opts.timeoutMs,
    );

  const kinds = () => activity.record.mock.calls.map(([entry]) => (entry as { kind: string }).kind);

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "project-health-watch-"));
    store = new ProjectHealthStore(dir);
    projectList = [ACME];
    projects = {
      list: vi.fn(async () => projectList),
      get: vi.fn(async (id: string) => {
        const found = projectList.find((p) => p.id === id);
        if (!found) throw new ProjectNotFoundError(id);
        return found;
      }),
    };
    scheduler = {
      createTask: vi.fn(async () => ({ outcome: "dispatched", task: { id: "task_9" } })),
    };
    activity = { record: vi.fn(async () => {}) };
    responses = new Map();
    fetchImpl = vi.fn(async (url: string) => {
      const scripted = responses.get(url) ?? 200;
      if (scripted instanceof Error) throw scripted;
      return new Response(null, { status: scripted });
    });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("first check up → status written, no activity", async () => {
    await makeWatcher().tick(T0);
    const status = await store.read("acme");
    expect(status).toMatchObject({
      projectId: "acme",
      url: ACME.healthCheck?.url,
      state: "up",
      httpStatus: 200,
      sinceAt: T0.toISOString(),
      checkedAt: T0.toISOString(),
    });
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("first check down → project-health-down recorded once with the spec summary", async () => {
    responses.set("https://acme.dev/health", 503);
    await makeWatcher().tick(T0);
    expect((await store.read("acme"))?.state).toBe("down");
    expect(activity.record).toHaveBeenCalledTimes(1);
    expect(activity.record).toHaveBeenCalledWith({
      kind: "project-health-down",
      summary: "Acme Shop: health check failing — HTTP 503",
      refs: { projectId: "acme" },
    });
  });

  it("still down on the next due tick → no new activity, sinceAt kept, checkedAt advanced", async () => {
    responses.set("https://acme.dev/health", 503);
    const watcher = makeWatcher();
    await watcher.tick(T0);
    await watcher.tick(after(300));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(activity.record).toHaveBeenCalledTimes(1);
    const status = await store.read("acme");
    expect(status?.sinceAt).toBe(T0.toISOString());
    expect(status?.checkedAt).toBe(after(300).toISOString());
  });

  it("down → up records project-health-recovered and clears analysisTaskId", async () => {
    responses.set("https://acme.dev/health", 503);
    const watcher = makeWatcher();
    await watcher.tick(T0);
    await watcher.analyze("acme");
    expect((await store.read("acme"))?.analysisTaskId).toBe("task_9");

    responses.set("https://acme.dev/health", 200);
    await watcher.tick(after(300));
    expect(kinds()).toEqual(["project-health-down", "project-health-recovered"]);
    expect(activity.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "project-health-recovered", refs: { projectId: "acme" } }),
    );
    const status = await store.read("acme");
    expect(status?.state).toBe("up");
    expect(status?.analysisTaskId).toBeUndefined();
    expect(status?.error).toBeUndefined();
    expect(status?.sinceAt).toBe(after(300).toISOString());
  });

  it("a project whose interval has not elapsed is not fetched", async () => {
    const watcher = makeWatcher();
    await watcher.tick(T0);
    await watcher.tick(after(299));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await watcher.tick(after(300));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("a changed url discards the old status and counts as a first check", async () => {
    responses.set("https://acme.dev/health", 503);
    const watcher = makeWatcher();
    await watcher.tick(T0);
    expect(kinds()).toEqual(["project-health-down"]);

    // New url, interval not elapsed — still checked at once; down again is a NEW streak.
    projectList = [
      { ...ACME, healthCheck: { url: "https://acme.dev/v2/health", intervalSec: 300 } },
    ];
    responses.set("https://acme.dev/v2/health", 500);
    await watcher.tick(after(10));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(kinds()).toEqual(["project-health-down", "project-health-down"]);
    const status = await store.read("acme");
    expect(status?.url).toBe("https://acme.dev/v2/health");
    expect(status?.sinceAt).toBe(after(10).toISOString());
  });

  it("a changed url that comes back up records nothing (first-check-up)", async () => {
    responses.set("https://acme.dev/health", 503);
    const watcher = makeWatcher();
    await watcher.tick(T0);
    projectList = [
      { ...ACME, healthCheck: { url: "https://acme.dev/v2/health", intervalSec: 300 } },
    ];
    await watcher.tick(after(10));
    expect(kinds()).toEqual(["project-health-down"]);
    expect((await store.read("acme"))?.state).toBe("up");
  });

  it("removing the health check (or the project) deletes its status file", async () => {
    projectList = [ACME, BETA];
    const watcher = makeWatcher();
    await watcher.tick(T0);
    expect((await store.list()).map((s) => s.projectId)).toEqual(["acme", "beta"]);

    projectList = [{ id: "acme", name: "Acme Shop" }]; // acme: no healthCheck; beta: deleted
    await watcher.tick(after(400));
    expect(await store.list()).toEqual([]);
  });

  it("one project's fetch throwing synchronously does not stop another's check", async () => {
    projectList = [ACME, BETA];
    fetchImpl.mockImplementation((url: string) => {
      if (url === "https://acme.dev/health") throw new Error("sync boom");
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    await makeWatcher().tick(T0);
    expect((await store.read("acme"))?.state).toBe("down");
    expect((await store.read("acme"))?.error).toBe("sync boom");
    expect((await store.read("beta"))?.state).toBe("up");
  });

  it("a store failure for one project does not stop another's check", async () => {
    projectList = [ACME, BETA];
    const realWrite = store.write.bind(store);
    vi.spyOn(store, "write").mockImplementation(async (status) => {
      if (status.projectId === "acme") throw new Error("disk full");
      return realWrite(status);
    });
    await makeWatcher().tick(T0);
    expect((await store.read("beta"))?.state).toBe("up");
  });

  describe("checkNow", () => {
    it("checks immediately regardless of interval and returns the status", async () => {
      const watcher = makeWatcher();
      await watcher.tick(T0);
      responses.set("https://acme.dev/health", 502);
      const status = await watcher.checkNow("acme");
      expect(status).toMatchObject({ projectId: "acme", state: "down", error: "HTTP 502" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(kinds()).toEqual(["project-health-down"]);
    });

    it("a project without a healthCheck → ProjectHealthNotFoundError", async () => {
      projectList = [{ id: "acme", name: "Acme Shop" }];
      await expect(makeWatcher().checkNow("acme")).rejects.toBeInstanceOf(
        ProjectHealthNotFoundError,
      );
    });

    it("an unknown project → ProjectHealthNotFoundError", async () => {
      await expect(makeWatcher().checkNow("ghost")).rejects.toBeInstanceOf(
        ProjectHealthNotFoundError,
      );
    });
  });

  describe("analyze", () => {
    it("on down → creates one task with projectId, the url and the instruction; stores analysisTaskId", async () => {
      responses.set("https://acme.dev/health", 503);
      const watcher = makeWatcher();
      await watcher.tick(T0);

      const result = await watcher.analyze("acme");

      expect(result).toEqual({ taskId: "task_9" });
      expect(scheduler.createTask).toHaveBeenCalledTimes(1);
      const [input, , projectId] = scheduler.createTask.mock.calls[0] as [
        { title: string; text: string; paths: string[] },
        number,
        string,
      ];
      expect(projectId).toBe("acme");
      expect(input.title).toBe("Health check failing: Acme Shop");
      expect(input.paths).toEqual([]);
      expect(input.text).toContain("https://acme.dev/health");
      expect(input.text).toContain("HTTP 503");
      expect(input.text).toContain(T0.toISOString());
      expect(input.text).toContain(
        "Investigate why the project's health check is failing, find the root cause, and prepare a fix on its own branch. Do not push or merge — the PR is the gate.",
      );
      expect((await store.read("acme"))?.analysisTaskId).toBe("task_9");
    });

    it("a second click while analysisTaskId is set still creates a new task", async () => {
      responses.set("https://acme.dev/health", 503);
      const watcher = makeWatcher();
      await watcher.tick(T0);
      await watcher.analyze("acme");
      scheduler.createTask.mockResolvedValueOnce({ outcome: "scheduled", task: { id: "task_10" } });
      expect(await watcher.analyze("acme")).toEqual({ taskId: "task_10" });
      expect(scheduler.createTask).toHaveBeenCalledTimes(2);
      expect((await store.read("acme"))?.analysisTaskId).toBe("task_10");
    });

    it("on up → ProjectHealthConflictError, no task", async () => {
      const watcher = makeWatcher();
      await watcher.tick(T0);
      await expect(watcher.analyze("acme")).rejects.toBeInstanceOf(ProjectHealthConflictError);
      expect(scheduler.createTask).not.toHaveBeenCalled();
    });

    it("project deleted since the last check → NotFound, no task", async () => {
      responses.set("https://acme.dev/health", 503);
      const watcher = makeWatcher();
      await watcher.tick(T0);
      projectList = [];
      await expect(watcher.analyze("acme")).rejects.toBeInstanceOf(ProjectHealthNotFoundError);
      expect(scheduler.createTask).not.toHaveBeenCalled();
    });

    it("healthCheck removed or url changed since the last check → NotFound, no task", async () => {
      responses.set("https://acme.dev/health", 503);
      const watcher = makeWatcher();
      await watcher.tick(T0);
      projectList = [{ id: "acme", name: "Acme Shop" }];
      await expect(watcher.analyze("acme")).rejects.toBeInstanceOf(ProjectHealthNotFoundError);
      projectList = [{ ...ACME, healthCheck: { url: "https://acme.dev/v2", intervalSec: 300 } }];
      await expect(watcher.analyze("acme")).rejects.toBeInstanceOf(ProjectHealthNotFoundError);
      expect(scheduler.createTask).not.toHaveBeenCalled();
    });

    it("a createTask failure → ProjectHealthDispatchError, analysisTaskId untouched", async () => {
      responses.set("https://acme.dev/health", 503);
      const watcher = makeWatcher();
      await watcher.tick(T0);
      scheduler.createTask.mockRejectedValueOnce(new Error("catalog is empty"));
      await expect(watcher.analyze("acme")).rejects.toBeInstanceOf(ProjectHealthDispatchError);
      expect((await store.read("acme"))?.analysisTaskId).toBeUndefined();
    });

    it("createTask runs outside the lock — a slow dispatch does not block checkNow", async () => {
      responses.set("https://acme.dev/health", 503);
      const watcher = makeWatcher();
      await watcher.tick(T0);
      let release: (v: unknown) => void = () => {};
      scheduler.createTask.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const pending = watcher.analyze("acme");
      await vi.waitFor(() => expect(scheduler.createTask).toHaveBeenCalled());
      // The check completes while the dispatch is still pending.
      const status = await watcher.checkNow("acme", after(5));
      expect(status.checkedAt).toBe(after(5).toISOString());
      release({ outcome: "dispatched", task: { id: "task_slow" } });
      expect(await pending).toEqual({ taskId: "task_slow" });
      expect((await store.read("acme"))?.analysisTaskId).toBe("task_slow");
    });

    it("does not stamp analysisTaskId when the project recovered during dispatch", async () => {
      responses.set("https://acme.dev/health", 503);
      const watcher = makeWatcher();
      await watcher.tick(T0);
      scheduler.createTask.mockImplementationOnce(async () => {
        responses.set("https://acme.dev/health", 200);
        await watcher.checkNow("acme", after(5));
        return { outcome: "dispatched", task: { id: "task_late" } };
      });
      expect(await watcher.analyze("acme")).toEqual({ taskId: "task_late" });
      const status = await store.read("acme");
      expect(status?.state).toBe("up");
      expect(status?.analysisTaskId).toBeUndefined();
    });

    it("on unknown (no status) → ProjectHealthNotFoundError", async () => {
      await expect(makeWatcher().analyze("ghost")).rejects.toBeInstanceOf(
        ProjectHealthNotFoundError,
      );
      expect(scheduler.createTask).not.toHaveBeenCalled();
    });
  });

  it("a down result never dispatches a task on its own", async () => {
    responses.set("https://acme.dev/health", 503);
    const watcher = makeWatcher();
    await watcher.tick(T0);
    await watcher.tick(after(300));
    expect(scheduler.createTask).not.toHaveBeenCalled();
  });

  describe("list", () => {
    it("hides statuses whose project is gone, has no healthCheck, or a different url", async () => {
      projectList = [
        ACME,
        BETA,
        { id: "gamma", name: "Gamma", healthCheck: { url: "https://g.dev/h", intervalSec: 60 } },
      ];
      const watcher = makeWatcher();
      await watcher.tick(T0);
      expect((await watcher.list()).map((s) => s.projectId)).toEqual(["acme", "beta", "gamma"]);

      // No tick runs (tick disabled) — the stale files are still on disk.
      projectList = [
        { id: "acme", name: "Acme Shop" },
        { id: "gamma", name: "Gamma", healthCheck: { url: "https://g.dev/v2", intervalSec: 60 } },
      ];
      expect(await store.list()).toHaveLength(3);
      expect(await watcher.list()).toEqual([]);
    });

    it("filters by projectId", async () => {
      projectList = [ACME, BETA];
      const watcher = makeWatcher();
      await watcher.tick(T0);
      expect((await watcher.list({ projectId: "beta" })).map((s) => s.projectId)).toEqual(["beta"]);
    });
  });

  it("a never-resolving fetch for one project does not block another's check within the tick", async () => {
    projectList = [ACME, BETA];
    fetchImpl.mockImplementation((url: string) =>
      url === "https://acme.dev/health"
        ? new Promise<Response>(() => {})
        : Promise.resolve(new Response(null, { status: 200 })),
    );
    await makeWatcher({ timeoutMs: 50 }).tick(T0);
    expect((await store.read("beta"))?.state).toBe("up");
    expect(await store.read("acme")).toMatchObject({ state: "down", error: "timeout after 50 ms" });
  });

  it("runs due checks concurrently, at most 4 at a time", async () => {
    projectList = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      healthCheck: { url: `https://p${i}.dev/h`, intervalSec: 60 },
    }));
    let inFlight = 0;
    let peak = 0;
    fetchImpl.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return new Response(null, { status: 200 });
    });
    await makeWatcher().tick(T0);
    expect(peak).toBe(4);
    expect(await store.list()).toHaveLength(9);
  });

  describe("timer lifecycle", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("re-arms on a systemConfig change and tears down on destroy", async () => {
      vi.useFakeTimers();
      const systemConfig = fakeSystemConfigStore({ projectHealthTickMs: 0 });
      const register = vi.fn();
      const watcher = makeWatcher({ systemConfig, register });
      const tick = vi.spyOn(watcher, "tick").mockResolvedValue(undefined);

      watcher.onModuleInit();
      expect(register).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(tick).not.toHaveBeenCalled(); // 0 = disabled

      await systemConfig.write({ ...systemConfig.current(), projectHealthTickMs: 1_000 });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(tick).toHaveBeenCalledTimes(1);
      expect(watcher.watcherHealth().status).toBe("ok");

      watcher.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(tick).toHaveBeenCalledTimes(1);

      // Unsubscribed: a later config change no longer re-arms.
      await systemConfig.write({ ...systemConfig.current(), projectHealthTickMs: 500 });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(tick).toHaveBeenCalledTimes(1);
    });
  });

  it("reports watcher health under the project-health id (disabled at tick 0)", () => {
    expect(makeWatcher().watcherHealth()).toEqual({
      id: "project-health",
      status: "disabled",
      tickMs: 0,
    });
  });
});
