import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_LEVEL_MAPPING } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LevelMappingStore } from "./level-mapping.store";

describe("LevelMappingStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "level-mapping-store-"));
    file = path.join(dir, "_level-mapping.json");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("seeds DEFAULT_LEVEL_MAPPING when the file doesn't exist yet", async () => {
    const store = new LevelMappingStore(file);
    expect(await store.read()).toEqual(DEFAULT_LEVEL_MAPPING);
  });

  it("write persists atomically and a fresh store reads it back", async () => {
    const store = new LevelMappingStore(file);
    const next = {
      entries: [{ kind: "jira" as const, externalLevel: "Spike", target: "task" as const }],
    };
    await store.write(next);
    expect(await store.read()).toEqual(next);
    expect(await new LevelMappingStore(file).read()).toEqual(next);
  });

  it("falls back to the seed on a corrupt file", async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, "{ not json");
    const store = new LevelMappingStore(file);
    expect(await store.read()).toEqual(DEFAULT_LEVEL_MAPPING);
  });

  it("falls back to the seed on a structurally-invalid (but valid JSON) file", async () => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ entries: "not-an-array" }));
    const store = new LevelMappingStore(file);
    expect(await store.read()).toEqual(DEFAULT_LEVEL_MAPPING);
  });

  describe("ensureLevels", () => {
    it("appends unseen levels for a kind, defaulting to target: task", async () => {
      const store = new LevelMappingStore(file);
      const before = (await store.read()).entries.length;
      const result = await store.ensureLevels("jira", ["Spike"]);
      expect(result.entries).toHaveLength(before + 1);
      expect(result.entries.at(-1)).toEqual({
        kind: "jira",
        externalLevel: "Spike",
        target: "task",
      });
    });

    it("does not append a level that already exists (case-insensitively)", async () => {
      const store = new LevelMappingStore(file);
      const before = await store.read();
      const result = await store.ensureLevels("jira", ["epic", "EPIC"]);
      expect(result.entries).toEqual(before.entries);
    });

    it("de-duplicates repeats of the same unseen level within one call", async () => {
      const store = new LevelMappingStore(file);
      const before = (await store.read()).entries.length;
      const result = await store.ensureLevels("jira", ["Spike", "spike", "SPIKE"]);
      expect(result.entries).toHaveLength(before + 1);
    });

    it("persists the appended levels — a fresh store sees them", async () => {
      const store = new LevelMappingStore(file);
      await store.ensureLevels("github", ["Feature Request"]);
      const fresh = new LevelMappingStore(file);
      expect(await fresh.read()).toEqual(await store.read());
    });

    it("returns the unchanged mapping (no write) when nothing new is seen", async () => {
      const store = new LevelMappingStore(file);
      const before = await store.read();
      const result = await store.ensureLevels("jira", ["Epic", "Story"]);
      expect(result).toEqual(before);
      // No file was ever written — read() still comes from the seed default.
      await expect(fs.access(file)).rejects.toThrow();
    });
  });
});
