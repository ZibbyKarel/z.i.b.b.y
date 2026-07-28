import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RoadmapItem } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CorruptRoadmapItemFileError,
  InvalidRoadmapItemIdError,
  InvalidRoadmapProjectIdError,
  RoadmapItemConflictError,
  RoadmapItemNotFoundError,
} from "./roadmap.errors";
import { RoadmapStore } from "./roadmap.store";

const NOW = "2026-07-28T00:00:00.000Z";

const item = (overrides: Partial<RoadmapItem> = {}): RoadmapItem => ({
  id: "item-1",
  projectId: "proj-1",
  level: "epic",
  name: "Rollout za flagem",
  description: "",
  source: { kind: "manual" },
  attachments: [],
  dependsOn: [],
  dependsOnFromSource: [],
  lifecycle: "todo",
  runs: [],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

describe("RoadmapStore", () => {
  let dir: string;
  let store: RoadmapStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-store-"));
    store = new RoadmapStore(dir);
    await store.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("persists two-level (<root>/<projectId>/<itemId>.json) and reads back", async () => {
    await store.put(item());
    const onDisk = path.join(dir, "proj-1", "item-1.json");
    expect(JSON.parse(await fs.readFile(onDisk, "utf8")).id).toBe("item-1");
    expect((await store.get("proj-1", "item-1")).name).toBe("Rollout za flagem");
  });

  it("throws RoadmapItemConflictError on a duplicate (projectId, id) put", async () => {
    await store.put(item());
    await expect(store.put(item({ name: "different" }))).rejects.toBeInstanceOf(
      RoadmapItemConflictError,
    );
    // The original is untouched.
    expect((await store.get("proj-1", "item-1")).name).toBe("Rollout za flagem");
  });

  it("throws RoadmapItemNotFoundError for a missing item", async () => {
    await expect(store.get("proj-1", "missing")).rejects.toBeInstanceOf(RoadmapItemNotFoundError);
  });

  it("update() is an atomic get -> mutate -> write", async () => {
    await store.put(item());
    const updated = await store.update("proj-1", "item-1", (current) => ({
      ...current,
      lifecycle: "enqueued",
      updatedAt: "2026-07-29T00:00:00.000Z",
    }));
    expect(updated.lifecycle).toBe("enqueued");
    expect((await store.get("proj-1", "item-1")).lifecycle).toBe("enqueued");
  });

  it("delete removes the item and a second delete 404s", async () => {
    await store.put(item());
    await store.delete("proj-1", "item-1");
    await expect(store.get("proj-1", "item-1")).rejects.toBeInstanceOf(RoadmapItemNotFoundError);
    await expect(store.delete("proj-1", "item-1")).rejects.toBeInstanceOf(RoadmapItemNotFoundError);
  });

  it("get() throws CorruptRoadmapItemFileError (not NotFound) for a file that parses as JSON but fails the schema", async () => {
    await store.put(item());
    await fs.writeFile(path.join(dir, "proj-1", "item-1.json"), JSON.stringify({ not: "an item" }));
    await expect(store.get("proj-1", "item-1")).rejects.toBeInstanceOf(CorruptRoadmapItemFileError);
  });

  it("list() still tolerates (skips) the same corrupt file get() rejects on", async () => {
    await store.put(item({ id: "a" }));
    await store.put(item({ id: "b" }));
    await fs.writeFile(path.join(dir, "proj-1", "b.json"), JSON.stringify({ not: "an item" }));
    const items = await store.list("proj-1");
    expect(items.map((i) => i.id)).toEqual(["a"]);
  });

  it("delete() is locked — cannot interleave with an in-flight update()'s writeFileAtomic and resurrect the item", async () => {
    await store.put(item());

    // Gate the RENAME half of `update()`'s `writeFileAtomic` (tmp write, then
    // rename-into-place) — the exact window in which an unlocked `delete()`
    // could unlink the CURRENT file while update() is paused, only for
    // update()'s resumed rename to recreate it moments later: a genuine
    // resurrection of a "deleted" item, not merely a stray error.
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const { promises: realFs } = await vi.importActual<typeof import("node:fs")>("node:fs");
    const renameSpy = vi.spyOn(fs, "rename").mockImplementationOnce(async (from, to) => {
      await gate;
      return realFs.rename(from as string, to as string);
    });

    // Kick off update(); it writes its tmp file, then blocks mid-flight
    // (inside its OWN held lock) on the mocked rename.
    const updated = store.update("proj-1", "item-1", (current) => ({
      ...current,
      lifecycle: "enqueued",
    }));

    // Let update() actually reach the mocked rename before racing delete() in.
    await new Promise((resolve) => setImmediate(resolve));

    // If delete() were unlocked (the bug), it would unlink the file RIGHT NOW
    // — then update()'s resumed rename would recreate it, resurrecting a
    // "deleted" item. Locked, this call must queue behind update()'s held
    // lock instead, running only after update() (and its rename) fully lands.
    const deleted = store.delete("proj-1", "item-1");

    releaseGate();
    await updated;
    await deleted;
    renameSpy.mockRestore();

    // Deterministic final state: update() persisted fully, THEN delete() ran
    // — never resurrected.
    await expect(store.get("proj-1", "item-1")).rejects.toBeInstanceOf(RoadmapItemNotFoundError);
  });

  it("list() returns every item in a project, sorted by createdAt, tolerating a corrupt file", async () => {
    await store.put(item({ id: "a", createdAt: "2026-07-28T02:00:00.000Z" }));
    await store.put(item({ id: "b", createdAt: "2026-07-28T01:00:00.000Z" }));
    await fs.writeFile(path.join(dir, "proj-1", "garbage.json"), "{ not json");
    const items = await store.list("proj-1");
    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("list() skips the sibling _config.json file", async () => {
    await store.put(item({ id: "a" }));
    await store.writeConfig("proj-1", { autoSync: true });
    const items = await store.list("proj-1");
    expect(items.map((i) => i.id)).toEqual(["a"]);
  });

  it("list() returns [] for a project with no items yet (directory never created)", async () => {
    expect(await store.list("unknown-project")).toEqual([]);
  });

  it("projectIds() lists only directories that actually exist under the root", async () => {
    await store.put(item({ id: "a", projectId: "proj-1" }));
    await store.put(item({ id: "b", projectId: "proj-2" }));
    expect((await store.projectIds()).sort()).toEqual(["proj-1", "proj-2"]);
  });

  describe("config", () => {
    it("round-trips the per-project config", async () => {
      expect(await store.readConfig("proj-1")).toEqual({ autoSync: false });
      await store.writeConfig("proj-1", { autoSync: true });
      expect(await store.readConfig("proj-1")).toEqual({ autoSync: true });
      // A fresh store instance over the same dir sees the persisted config.
      const fresh = new RoadmapStore(dir);
      await fresh.onModuleInit();
      expect(await fresh.readConfig("proj-1")).toEqual({ autoSync: true });
    });

    it("falls back to the default config on a corrupt _config.json", async () => {
      await fs.mkdir(path.join(dir, "proj-1"), { recursive: true });
      await fs.writeFile(path.join(dir, "proj-1", "_config.json"), "{ not json");
      expect(await store.readConfig("proj-1")).toEqual({ autoSync: false });
    });
  });

  describe("path-traversal rejection", () => {
    it("refuses an unsafe projectId (../) on put/get/list/config with InvalidRoadmapProjectIdError — never the item-id error", async () => {
      await expect(store.put(item({ projectId: "../escape" }))).rejects.toBeInstanceOf(
        InvalidRoadmapProjectIdError,
      );
      await expect(store.get("../escape", "item-1")).rejects.toBeInstanceOf(
        InvalidRoadmapProjectIdError,
      );
      await expect(store.list("../escape")).rejects.toBeInstanceOf(InvalidRoadmapProjectIdError);
      await expect(store.readConfig("../escape")).rejects.toBeInstanceOf(
        InvalidRoadmapProjectIdError,
      );
      await expect(store.writeConfig("../escape", { autoSync: true })).rejects.toBeInstanceOf(
        InvalidRoadmapProjectIdError,
      );
      await expect(store.delete("../escape", "item-1")).rejects.toBeInstanceOf(
        InvalidRoadmapProjectIdError,
      );
    });

    it("refuses an absolute-path projectId with InvalidRoadmapProjectIdError", async () => {
      await expect(store.put(item({ projectId: "/etc/passwd" }))).rejects.toBeInstanceOf(
        InvalidRoadmapProjectIdError,
      );
    });

    it("refuses an unsafe itemId (../) under a valid project with InvalidRoadmapItemIdError — never the project-id error", async () => {
      await expect(store.put(item({ id: "../../escape" }))).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
      await expect(store.get("proj-1", "../../escape")).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
      await expect(store.delete("proj-1", "../../escape")).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
    });

    it("refuses an absolute-path itemId with InvalidRoadmapItemIdError", async () => {
      await expect(store.put(item({ id: "/etc/passwd" }))).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
    });

    it("never lets a traversal id escape the root", async () => {
      await store.put(item()).catch(() => {});
      await store.put(item({ id: "../../escape" })).catch(() => {});
      await store.put(item({ projectId: "../escape" })).catch(() => {});
      const entries = await fs.readdir(dir);
      expect(entries).toEqual(["proj-1"]);
    });
  });
});
