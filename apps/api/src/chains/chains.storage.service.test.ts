import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Chain } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ChainConflictError,
  ChainNotFoundError,
  ChainsStorageService,
  InvalidChainIdError,
} from "./chains.storage.service";

const CHAIN: Chain = {
  id: "research-then-build",
  name: "Research → Build",
  steps: [{ pipeline: "nightly-research" }, { pipeline: "build-feature" }],
  instructions: "Research topic X overnight, then build an app from the result.",
};

describe("ChainsStorageService", () => {
  let dir: string;
  let store: ChainsStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "chains-store-"));
    store = new ChainsStorageService(dir);
    await store.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("create → get/list round-trips; duplicate id conflicts", async () => {
    await store.create(CHAIN);
    expect(await store.get("research-then-build")).toEqual(CHAIN);
    expect(await store.list()).toEqual([CHAIN]);
    await expect(store.create(CHAIN)).rejects.toBeInstanceOf(ChainConflictError);
  });

  it("round-trips the ownerSubsystem tag; an untagged chain stays absent (Phase 81)", async () => {
    const tagged: Chain = { ...CHAIN, id: "tagged-chain", ownerSubsystem: "loom" };
    await store.create(tagged);
    expect(await store.get("tagged-chain")).toEqual(tagged);

    await store.create(CHAIN);
    const untagged = await store.get("research-then-build");
    expect(untagged.ownerSubsystem).toBeUndefined();
    const raw = await fs.readFile(path.join(dir, "research-then-build.json"), "utf8");
    expect(raw).not.toContain("ownerSubsystem");
  });

  it("delete removes; unknown/invalid ids map to domain errors", async () => {
    await store.create(CHAIN);
    await store.delete("research-then-build");
    await expect(store.get("research-then-build")).rejects.toBeInstanceOf(ChainNotFoundError);
    await expect(store.get("../evil")).rejects.toBeInstanceOf(InvalidChainIdError);
  });

  it("a corrupt file is skipped by list, never fatal", async () => {
    await store.create(CHAIN);
    await fs.writeFile(path.join(dir, "broken.json"), "{nope", "utf8");
    expect(await store.list()).toHaveLength(1);
  });
});
