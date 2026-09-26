import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DepartmentFindingsStore } from "./department-findings.store";

describe("DepartmentFindingsStore", () => {
  let dir: string;
  let store: DepartmentFindingsStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "department-findings-"));
    store = new DepartmentFindingsStore(dir, {
      child: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    } as never);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("read on a never-written key returns an empty set (first-run fail-open)", async () => {
    expect(await store.read("sec")).toEqual(new Set());
  });

  it("write then read round-trips the fingerprint set, deduped", async () => {
    await store.write("sec", ["fp-a", "fp-b", "fp-a"]);
    expect(await store.read("sec")).toEqual(new Set(["fp-a", "fp-b"]));
  });

  it("a corrupt snapshot file reads as an empty set instead of throwing", async () => {
    await store.write("sec", ["fp-a"]);
    await fs.writeFile(path.join(dir, "sec.json"), "{ not json", "utf8");
    expect(await store.read("sec")).toEqual(new Set());
  });

  it("keeps snapshots for different keys independent", async () => {
    await store.write("sec", ["fp-a"]);
    await store.write("qa", ["fp-x", "fp-y"]);
    expect(await store.read("sec")).toEqual(new Set(["fp-a"]));
    expect(await store.read("qa")).toEqual(new Set(["fp-x", "fp-y"]));
  });
});
