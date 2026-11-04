import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ICLOUD_RECIPES_DIR,
  dataDir,
  defaultCloneRoot,
  installRoot,
  recipesDir,
  resolveDataRoot,
  resolveRecipesRoot,
  resolveVaultDir,
  zibbyHome,
} from "./data-dir";

vi.mock("node:fs", async (orig) => {
  const actual = await orig<typeof import("node:fs")>();
  return { ...actual, statSync: vi.fn(actual.statSync) };
});

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
    expect(() => resolveDataRoot()).toThrow(/refusing the live data root/);
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

  it("ZIBBY_SOURCE_ROOT wins (the packaged app points it at its source checkout)", () => {
    process.env.ZIBBY_SOURCE_ROOT = "/tmp/zibby-src";
    try {
      expect(installRoot()).toBe("/tmp/zibby-src");
      expect(defaultCloneRoot()).toBe("/tmp");
    } finally {
      delete process.env.ZIBBY_SOURCE_ROOT;
    }
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

/**
 * The vault defaults to the operator's `~/Documents/AI/Vault` only on the live root; any
 * explicit/isolated data root (tests included) keeps its vault inside that root.
 */
describe("resolveVaultDir", () => {
  const original = { vault: process.env.VAULT_DIR, data: process.env.ZIBBY_DATA_DIR };

  afterEach(() => {
    if (original.vault === undefined) delete process.env.VAULT_DIR;
    else process.env.VAULT_DIR = original.vault;
    if (original.data === undefined) delete process.env.ZIBBY_DATA_DIR;
    else process.env.ZIBBY_DATA_DIR = original.data;
  });

  it("honours VAULT_DIR", () => {
    process.env.VAULT_DIR = "/tmp/some-vault";
    expect(resolveVaultDir()).toBe("/tmp/some-vault");
  });

  it("keeps the vault inside an explicit ZIBBY_DATA_DIR", () => {
    delete process.env.VAULT_DIR;
    process.env.ZIBBY_DATA_DIR = "/tmp/zibby-root";
    expect(resolveVaultDir()).toBe("/tmp/zibby-root/vault");
  });
});

describe("resolveRecipesRoot", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    vi.mocked(fs.statSync).mockReset();
  });

  it("ZIBBY_RECIPES_DIR wins", () => {
    process.env.ZIBBY_RECIPES_DIR = "/tmp/r";
    expect(resolveRecipesRoot()).toBe("/tmp/r");
    expect(recipesDir("agents")).toBe("/tmp/r/agents");
  });

  it("ZIBBY_DATA_DIR keeps recipes in the data root even if the iCloud dir exists", () => {
    delete process.env.ZIBBY_RECIPES_DIR;
    process.env.ZIBBY_DATA_DIR = "/tmp/d";
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as fs.Stats);
    expect(resolveRecipesRoot()).toBe("/tmp/d");
  });

  it("uses the iCloud dir when it exists, else the live data root", () => {
    delete process.env.ZIBBY_RECIPES_DIR;
    delete process.env.ZIBBY_DATA_DIR;
    delete process.env.VITEST;
    const stat = vi.mocked(fs.statSync);
    stat.mockReturnValue({ isDirectory: () => true } as fs.Stats);
    expect(resolveRecipesRoot()).toBe(ICLOUD_RECIPES_DIR);
    stat.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(resolveRecipesRoot()).toBe(path.join(zibbyHome(), "data"));
  });
});
