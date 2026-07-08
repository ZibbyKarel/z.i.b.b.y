import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dataDir, defaultCloneRoot, installRoot, resolveDataRoot } from "./data-dir";

/**
 * Phase 12.5 — the data-root resolver is the single switch every file-backed
 * store follows. Under the test runner it MUST resolve to an explicit override
 * (the temp root pinned by `vitest.setup.ts`), never the live `.zibby/data`
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

  it("refuses the live .zibby/data anchor under VITEST without an override", () => {
    // VITEST is set for the whole run; removing the override must trip the guard.
    delete process.env.ZIBBY_DATA_DIR;
    expect(process.env.VITEST).toBeTruthy();
    expect(() => resolveDataRoot()).toThrow(/refusing the live \.zibby\/data anchor/);
  });
});

/**
 * Phase 76 — `installRoot`/`defaultCloneRoot` are pure path arithmetic on top of
 * `resolveDataRoot()`: two levels up is the repo root (parent of `.zibby`), one
 * more level up is the clone root (repo root's parent — a sibling location for
 * fresh project clones, not nested inside the ZIBBY repo).
 */
describe("installRoot / defaultCloneRoot", () => {
  const original = process.env.ZIBBY_DATA_DIR;

  afterEach(() => {
    if (original === undefined) delete process.env.ZIBBY_DATA_DIR;
    else process.env.ZIBBY_DATA_DIR = original;
  });

  it("installRoot is two levels up from resolveDataRoot() (the repo root)", () => {
    process.env.ZIBBY_DATA_DIR = "/tmp/zibby-fixture/.zibby/data";
    expect(installRoot()).toBe(path.resolve("/tmp/zibby-fixture"));
  });

  it("defaultCloneRoot is one level up from installRoot (a sibling of the repo root)", () => {
    process.env.ZIBBY_DATA_DIR = "/tmp/zibby-fixture/.zibby/data";
    expect(defaultCloneRoot()).toBe(path.resolve("/tmp"));
    expect(defaultCloneRoot()).toBe(path.resolve(installRoot(), ".."));
  });
});
