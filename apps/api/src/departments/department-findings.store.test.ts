import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SubsystemFindingsStore } from "./subsystem-findings.store";

describe("SubsystemFindingsStore", () => {
  let dir: string;
  let store: SubsystemFindingsStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "subsystem-findings-"));
    store = new SubsystemFindingsStore(dir, {
      child: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    } as never);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("read on a never-written key returns an empty set (first-run fail-open)", async () => {
    expect(await store.read("sentinel")).toEqual(new Set());
  });

  it("write then read round-trips the fingerprint set, deduped", async () => {
    await store.write("sentinel", ["fp-a", "fp-b", "fp-a"]);
    expect(await store.read("sentinel")).toEqual(new Set(["fp-a", "fp-b"]));
  });

  it("a corrupt snapshot file reads as an empty set instead of throwing", async () => {
    await store.write("sentinel", ["fp-a"]);
    await fs.writeFile(path.join(dir, "sentinel.json"), "{ not json", "utf8");
    expect(await store.read("sentinel")).toEqual(new Set());
  });

  it("keeps snapshots for different keys independent", async () => {
    await store.write("sentinel", ["fp-a"]);
    await store.write("loom", ["fp-x", "fp-y"]);
    expect(await store.read("sentinel")).toEqual(new Set(["fp-a"]));
    expect(await store.read("loom")).toEqual(new Set(["fp-x", "fp-y"]));
  });
});
