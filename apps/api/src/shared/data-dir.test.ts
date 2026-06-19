import { afterEach, describe, expect, it } from "vitest";
import { dataDir, resolveDataRoot } from "./data-dir";

/**
 * Phase 12.5 — the data-root resolver is the single switch every file-backed
 * store follows. Under the test runner it MUST resolve to an explicit override
 * (the temp root pinned by `vitest.setup.ts`), never the live `apps/api/data`
 * anchor, or a suite could read/write real data — the meta-circular hazard.
 */
describe("resolveDataRoot", () => {
  const original = process.env.ZIBBY_DATA_DIR;

  afterEach(() => {
    if (original === undefined) delete process.env.ZIBBY_DATA_DIR;
    else process.env.ZIBBY_DATA_DIR = original;
  });

  it("resolves ZIBBY_DATA_DIR (set globally under test) to an absolute path", () => {
    process.env.ZIBBY_DATA_DIR = "/tmp/zibby-root";
    expect(resolveDataRoot()).toBe("/tmp/zibby-root");
    expect(dataDir("goals", "runs")).toBe("/tmp/zibby-root/goals/runs");
  });

  it("refuses the live apps/api/data anchor under VITEST without an override", () => {
    // VITEST is set for the whole run; removing the override must trip the guard.
    delete process.env.ZIBBY_DATA_DIR;
    expect(process.env.VITEST).toBeTruthy();
    expect(() => resolveDataRoot()).toThrow(/refusing the live apps\/api\/data anchor/);
  });
});
