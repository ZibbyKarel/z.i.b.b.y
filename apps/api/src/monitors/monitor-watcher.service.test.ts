import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Integration } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { type MonitorAdapter, MonitorAdapterRegistry } from "./monitor-adapter";
import { MonitorEventStore } from "./monitor-event.store";
import { MonitorWatcherService } from "./monitor-watcher.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};
const fakeTrace = { getTraceId: () => undefined, run: (_c: unknown, fn: () => unknown) => fn() };

const GH: Integration = {
  id: "acme-github",
  kind: "github",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "acme/app", streams: ["ci"] },
};

const ALERT = {
  id: "ci-acme-app-42-1",
  kind: "ci-run-failed" as const,
  title: "CI red: build.yml failed on main",
  detail: "Conclusion: failure",
  url: "https://github.com/acme/app/actions/runs/42",
  occurredAt: "2026-07-02T08:12:00.000Z",
};

/** A scriptable adapter — also the "second monitor drops in" seam proof. */
function fakeAdapter(
  kind: string,
  wants: (i: Integration) => boolean,
): MonitorAdapter & {
  poll: ReturnType<typeof vi.fn>;
} {
  return {
    kind,
    wants,
    poll: vi.fn(async () => ({ events: [ALERT], cursor: "C1" })),
  };
}

describe("MonitorWatcherService", () => {
  let dir: string;
  let store: MonitorEventStore;
  let registry: MonitorAdapterRegistry;
  let integrations: { list: ReturnType<typeof vi.fn> };
  let credentials: { read: ReturnType<typeof vi.fn> };
  let scheduler: { createTask: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };

  const makeWatcher = () =>
    new MonitorWatcherService(
      integrations as never,
      credentials as never,
      registry,
      store,
      scheduler as never,
      activity as never,
      fakeSystemConfigStore(),
      fakeTrace as never,
      // F6c watcher-health registry double — registration is exercised in the
      // base/e2e specs, not here.
      { register: () => {} } as never,
      fakeLogger as never,
    );

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "monitor-watch-"));
    store = new MonitorEventStore(dir);
    await store.onModuleInit();
    registry = new MonitorAdapterRegistry();
    integrations = { list: vi.fn(async () => [GH]) };
    credentials = { read: vi.fn(async () => ({ token: "ghp_x" })) };
    scheduler = {
      createTask: vi.fn(async () => ({ outcome: "dispatched", task: { id: "task_9" } })),
    };
    activity = { record: vi.fn(async () => {}) };
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("a new alert is persisted, recorded, and dispatched with the owning project", async () => {
    const adapter = fakeAdapter("github-ci", (i) => i.id === GH.id);
    registry.register(adapter);

    const ingested = await makeWatcher().tick();

    expect(ingested).toEqual([ALERT.id]);
    const stored = await store.get(ALERT.id);
    expect(stored.state).toBe("handled");
    expect(stored.taskId).toBe("task_9");
    expect(stored.projectId).toBe("acme");
    // The investigation rides the ordinary scheduler with the trusted project.
    expect(scheduler.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: ALERT.title }),
      expect.any(Number),
      "acme",
    );
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "monitor-alert" }),
    );
    // Cursor advanced only after the event persisted.
    expect(await store.readCursor(GH.id, "github-ci")).toBe("C1");
  });

  it("a re-poll of the same alert is a dedup no-op (no second task, no second record)", async () => {
    registry.register(fakeAdapter("github-ci", () => true));
    const watcher = makeWatcher();
    await watcher.tick();
    scheduler.createTask.mockClear();
    activity.record.mockClear();

    const second = await watcher.tick();

    expect(second).toEqual([]);
    expect(scheduler.createTask).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it("dispatch failure leaves the alert `new`; the next tick retries it", async () => {
    registry.register(fakeAdapter("github-ci", () => true));
    scheduler.createTask.mockRejectedValueOnce(new Error("empty catalog"));
    const watcher = makeWatcher();

    await watcher.tick();
    expect((await store.get(ALERT.id)).state).toBe("new");

    await watcher.tick(); // retryUnhandled re-drives it
    expect((await store.get(ALERT.id)).state).toBe("handled");
  });

  it("N4b: a poll's status snapshot persists attributed to the integration/project", async () => {
    const adapter = fakeAdapter("github-ci", () => true);
    adapter.poll.mockResolvedValue({
      events: [],
      cursor: "C1",
      status: {
        state: "red" as const,
        sinceAt: "2026-07-02T08:00:00.000Z",
        checkedAt: "2026-07-02T08:12:00.000Z",
        summary: "build.yml failed on main",
      },
    });
    registry.register(adapter);

    await makeWatcher().tick();

    expect(await store.listStatuses()).toEqual([
      expect.objectContaining({
        integrationId: GH.id,
        projectId: "acme",
        adapterKind: "github-ci",
        state: "red",
      }),
    ]);
    // Status is silent Tier-1 state — no alert, no activity, no task.
    expect(activity.record).not.toHaveBeenCalled();
    expect(scheduler.createTask).not.toHaveBeenCalled();
  });

  it("a second monitor plugs into the registry without touching the watcher (Sentry seam)", async () => {
    const ci = fakeAdapter("github-ci", () => true);
    const sentry = fakeAdapter("fake-sentry", () => true);
    sentry.poll.mockResolvedValue({
      events: [{ ...ALERT, id: "sentry-1", title: "Error spike" }],
      cursor: "S1",
    });
    registry.register(ci);
    registry.register(sentry);

    const ingested = await makeWatcher().tick();

    expect(ingested.sort()).toEqual([ALERT.id, "sentry-1"].sort());
    // Each adapter keeps its own cursor namespace on the same integration.
    expect(await store.readCursor(GH.id, "github-ci")).toBe("C1");
    expect(await store.readCursor(GH.id, "fake-sentry")).toBe("S1");
  });

  it("one failing adapter never blocks the others; nothing wants → no poll at all", async () => {
    const broken = fakeAdapter("github-ci", () => true);
    broken.poll.mockRejectedValue(new Error("boom"));
    const healthy = fakeAdapter("fake-sentry", () => true);
    healthy.poll.mockResolvedValue({ events: [{ ...ALERT, id: "ok-1" }], cursor: "S1" });
    registry.register(broken);
    registry.register(healthy);
    process.env.MONITOR_POLL_RETRIES = "0";
    try {
      const ingested = await makeWatcher().tick();
      expect(ingested).toEqual(["ok-1"]);
    } finally {
      delete process.env.MONITOR_POLL_RETRIES;
    }

    // A disabled integration (or one no adapter wants) polls nothing.
    integrations.list.mockResolvedValue([{ ...GH, enabled: false }]);
    healthy.poll.mockClear();
    await makeWatcher().tick();
    expect(healthy.poll).not.toHaveBeenCalled();
  });

  it("T7 — two rapid timer-driven firings run tick() once (TickingWatcherBase guard)", async () => {
    const watcher = makeWatcher();
    let resolveFirst: () => void = () => {};
    const deferred = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const tickSpy = vi.spyOn(watcher, "tick").mockImplementation(async () => {
      await deferred;
      return [];
    });
    const guardedTick = () =>
      (watcher as unknown as { guardedTick(): Promise<void> }).guardedTick();

    const first = guardedTick();
    const second = guardedTick();
    await second; // skipped — resolves without waiting on the first
    expect(tickSpy).toHaveBeenCalledTimes(1);

    resolveFirst();
    await first;
    expect(tickSpy).toHaveBeenCalledTimes(1); // still once — the skipped firing never ran tick()
  });
});
