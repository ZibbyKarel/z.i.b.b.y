import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CategoryConflictError,
  CategoryManifestStore,
  CategoryNotFoundError,
} from "./category-manifest-store";

/** A minimal concrete subclass — the base's `constructor` is protected. */
class TestCategoryStore extends CategoryManifestStore {
  constructor(dir: string) {
    super(dir);
  }
}

describe("CategoryManifestStore concurrency (Task 3)", () => {
  let dir: string;
  let store: TestCategoryStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "category-manifest-test-"));
    store = new TestCategoryStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("concurrent creates with DISTINCT names both land in the final manifest", async () => {
    await Promise.all([
      store.create({ name: "alpha", glyph: "🅰️" }),
      store.create({ name: "beta", glyph: "🅱️" }),
    ]);

    const names = (await store.list()).map((c) => c.name).sort();
    expect(names).toEqual(["alpha", "beta"]);
  });

  it("concurrent creates with the SAME name: exactly one succeeds, the other throws CategoryConflictError", async () => {
    const results = await Promise.allSettled([
      store.create({ name: "dup", glyph: "🔁" }),
      store.create({ name: "dup", glyph: "🔁" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === "rejected") {
      expect(rejected[0].reason).toBeInstanceOf(CategoryConflictError);
    }

    // Not a silent overwrite — the manifest holds exactly one "dup" entry.
    const dupEntries = (await store.list()).filter((c) => c.name === "dup");
    expect(dupEntries).toHaveLength(1);
  });

  it("concurrent delete + create on distinct names both apply cleanly", async () => {
    await store.create({ name: "keep", glyph: "🟢" });
    await store.create({ name: "gone", glyph: "🔴" });

    await Promise.all([store.delete("gone"), store.create({ name: "fresh", glyph: "✨" })]);

    const names = (await store.list()).map((c) => c.name).sort();
    expect(names).toEqual(["fresh", "keep"]);
  });

  it("delete on a name that does not exist throws CategoryNotFoundError, leaving the manifest untouched", async () => {
    await store.create({ name: "solo", glyph: "🟣" });
    await expect(store.delete("ghost")).rejects.toBeInstanceOf(CategoryNotFoundError);
    expect((await store.list()).map((c) => c.name)).toEqual(["solo"]);
  });
});
