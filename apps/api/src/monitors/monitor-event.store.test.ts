import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CiStatus, MonitorEvent } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MonitorEventNotFoundError, MonitorEventStore } from "./monitor-event.store";

const event = (over: Partial<MonitorEvent>): MonitorEvent => ({
  id: "ci-acme-app-42-1",
  integrationId: "acme-github",
  projectId: "acme",
  kind: "ci-run-failed",
  title: "CI red: build.yml failed on main",
  detail: "Conclusion: failure",
  occurredAt: "2026-07-02T08:12:00.000Z",
  state: "new",
  ...over,
});

describe("MonitorEventStore", () => {
  let dir: string;
  let store: MonitorEventStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "monitor-events-"));
    store = new MonitorEventStore(dir);
    await store.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("putNew persists; the same id is a dedup hit (null), the original untouched", async () => {
    expect(await store.putNew(event({}))).not.toBeNull();
    expect(await store.putNew(event({ title: "different" }))).toBeNull();
    expect((await store.get("ci-acme-app-42-1")).title).toContain("CI red");
  });

  it("patch transitions state/taskId; list filters by state and project", async () => {
    await store.putNew(event({}));
    await store.putNew(
      event({ id: "ci-other-9-1", projectId: "beta", occurredAt: "2026-07-02T09:00:00.000Z" }),
    );
    await store.patch("ci-acme-app-42-1", { state: "handled", taskId: "task_1" });

    expect((await store.get("ci-acme-app-42-1")).taskId).toBe("task_1");
    expect(await store.listFiltered({ state: "new" })).toHaveLength(1);
    expect(await store.listFiltered({ projectId: "acme" })).toHaveLength(1);
    // Newest-first ordering.
    expect((await store.list()).map((e) => e.id)).toEqual(["ci-other-9-1", "ci-acme-app-42-1"]);
  });

  it("cursors round-trip per (integration, adapter) pair", async () => {
    expect(await store.readCursor("acme-github", "github-ci")).toBeUndefined();
    await store.writeCursor("acme-github", "github-ci", "2026-07-02T08:00:00Z");
    await store.writeCursor("acme-github", "fake", "OTHER");
    expect(await store.readCursor("acme-github", "github-ci")).toBe("2026-07-02T08:00:00Z");
    expect(await store.readCursor("acme-github", "fake")).toBe("OTHER");
  });

  it("N4b: status sidecars overwrite per (integration, adapter); list filters by project", async () => {
    const status = (over: Partial<CiStatus>): CiStatus => ({
      integrationId: "acme-github",
      projectId: "acme",
      adapterKind: "github-ci",
      state: "red",
      sinceAt: "2026-07-02T08:00:00.000Z",
      checkedAt: "2026-07-02T08:12:00.000Z",
      summary: "build.yml failed on main",
      ...over,
    });
    expect(await store.listStatuses()).toEqual([]);
    await store.writeStatus(status({}));
    await store.writeStatus(status({ integrationId: "beta-github", projectId: "beta" }));
    // Same pair again → overwrite, not a second entry (state, not history).
    await store.writeStatus(status({ state: "green", sinceAt: "2026-07-02T09:00:00.000Z" }));

    expect(await store.listStatuses()).toHaveLength(2);
    const [acme] = await store.listStatuses({ projectId: "acme" });
    expect(acme).toMatchObject({ state: "green", sinceAt: "2026-07-02T09:00:00.000Z" });
  });

  it("a corrupt event file is skipped by list; get maps it to not-found", async () => {
    await store.putNew(event({}));
    await fs.writeFile(path.join(dir, "broken.json"), "{oops", "utf8");
    expect(await store.list()).toHaveLength(1);
    await expect(store.get("broken")).rejects.toBeInstanceOf(MonitorEventNotFoundError);
  });
});
