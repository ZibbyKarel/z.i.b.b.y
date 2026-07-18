import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { MergeWatch } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MergeWatchNotFoundError, MergeWatchStore } from "./merge-watch.store";

const watch = (over: Partial<MergeWatch>): MergeWatch => ({
  id: "merge-acme-app-abc123",
  projectId: "acme",
  repo: "acme/app",
  sha: "abc123",
  prNumber: 42,
  prTitle: "Fix flaky test",
  mergedAt: "2026-07-17T09:00:00.000Z",
  deadline: "2026-07-17T11:00:00.000Z",
  attempts: 0,
  state: "watching",
  ...over,
});

describe("MergeWatchStore", () => {
  let dir: string;
  let store: MergeWatchStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "merge-watch-"));
    store = new MergeWatchStore(dir);
    await store.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("putNew persists; the same id is a dedup hit (null), the original untouched", async () => {
    expect(await store.putNew(watch({}))).not.toBeNull();
    expect(await store.putNew(watch({ prTitle: "different" }))).toBeNull();
    expect((await store.get("merge-acme-app-abc123")).prTitle).toBe("Fix flaky test");
  });

  it("patch transitions state/attempts/taskId — read-merge-write", async () => {
    await store.putNew(watch({}));
    await store.patch("merge-acme-app-abc123", {
      state: "red",
      attempts: 1,
      taskId: "task_1",
    });

    const updated = await store.get("merge-acme-app-abc123");
    expect(updated.state).toBe("red");
    expect(updated.attempts).toBe(1);
    expect(updated.taskId).toBe("task_1");
    // Untouched fields survive the merge.
    expect(updated.sha).toBe("abc123");
  });

  it("list orders newest-mergedAt-first", async () => {
    await store.putNew(watch({ id: "merge-a-1", mergedAt: "2026-07-17T08:00:00.000Z" }));
    await store.putNew(watch({ id: "merge-b-2", mergedAt: "2026-07-17T10:00:00.000Z" }));
    expect((await store.list()).map((w) => w.id)).toEqual(["merge-b-2", "merge-a-1"]);
  });

  it("listWatching filters to state === watching only", async () => {
    await store.putNew(watch({ id: "merge-a-1", state: "watching" }));
    await store.putNew(watch({ id: "merge-b-2", state: "green" }));
    await store.putNew(watch({ id: "merge-c-3", state: "red" }));
    expect((await store.listWatching()).map((w) => w.id)).toEqual(["merge-a-1"]);
  });

  it("a corrupt watch file is skipped by list; get maps it to not-found", async () => {
    await store.putNew(watch({}));
    await fs.writeFile(path.join(dir, "broken.json"), "{oops", "utf8");
    expect(await store.list()).toHaveLength(1);
    await expect(store.get("broken")).rejects.toBeInstanceOf(MergeWatchNotFoundError);
  });
});
