import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarketplacesStore } from "./marketplaces.store";

const record = (id: string) => ({
  id,
  source: `owner/${id}`,
  devMode: false,
  managedClone: false,
  addedAt: "2026-10-26T10:00:00.000Z",
});

describe("MarketplacesStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "marketplaces-store-"));
    file = path.join(dir, "nested", "marketplaces.json");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads an empty list when the file is missing or corrupt", async () => {
    expect(await new MarketplacesStore(file).list()).toEqual([]);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{ nope");
    expect(await new MarketplacesStore(file).list()).toEqual([]);
  });

  it("adds, replaces by id and removes — visible to a second instance", async () => {
    const a = new MarketplacesStore(file);
    const b = new MarketplacesStore(file);
    await a.add(record("one"));
    await a.add(record("two"));
    await a.add({ ...record("one"), source: "other/one" });
    expect((await b.list()).map((m) => [m.id, m.source])).toEqual([
      ["two", "owner/two"],
      ["one", "other/one"],
    ]);
    await b.remove("two");
    expect(await a.get("two")).toBeUndefined();
    expect((await a.get("one"))?.source).toBe("other/one");
  });
});
