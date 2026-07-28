import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RoadmapItem } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidRoadmapItemIdError,
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
    it("refuses an unsafe projectId (../) on put/get/list/config", async () => {
      await expect(store.put(item({ projectId: "../escape" }))).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
      await expect(store.get("../escape", "item-1")).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
      await expect(store.list("../escape")).rejects.toBeInstanceOf(InvalidRoadmapItemIdError);
      await expect(store.readConfig("../escape")).rejects.toBeInstanceOf(InvalidRoadmapItemIdError);
    });

    it("refuses an absolute-path projectId", async () => {
      await expect(store.put(item({ projectId: "/etc/passwd" }))).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
    });

    it("refuses an unsafe itemId (../) under a valid project", async () => {
      await expect(store.put(item({ id: "../../escape" }))).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
      await expect(store.get("proj-1", "../../escape")).rejects.toBeInstanceOf(
        InvalidRoadmapItemIdError,
      );
    });

    it("refuses an absolute-path itemId", async () => {
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
