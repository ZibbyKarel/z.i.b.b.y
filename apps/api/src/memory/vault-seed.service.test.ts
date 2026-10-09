import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEPARTMENT_SEED } from "@zibby/contracts";
import { afterEach, describe, expect, it } from "vitest";
import type { DepartmentsStorageService } from "../departments/departments.storage.service";
import { GroundingService } from "./grounding.service";
import { VaultSeedService } from "./vault-seed.service";
import { VaultService } from "./vault.service";

const departments = {
  list: async () => [...DEPARTMENT_SEED],
} as unknown as DepartmentsStorageService;

describe("VaultSeedService", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("seeds a genuinely empty vault, and grounding on the fresh install is non-empty (fresh-install grounds non-empty)", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-seed-"));
    const vault = new VaultService(dir);
    await vault.onModuleInit();
    await new VaultSeedService(vault, departments).onModuleInit();

    const { nodes } = await vault.graph();
    // 13 seeds + the vault-log note the writes create.
    expect(nodes.length).toBe(14);
    expect(nodes.map((n) => n.id)).toContain("north-star");
    expect(nodes.map((n) => n.id)).toContain("zibby-index");
    expect(nodes.map((n) => n.id)).toContain("department-dev-moc");

    const grounding = new GroundingService(vault);
    const block = await grounding.compose({ task: "anything" });
    expect(block).not.toBe("");
    expect(block).toContain("North Star");
  });

  it("a non-empty vault is a strict no-op (fresh-install semantics only)", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-seed-"));
    const vault = new VaultService(dir);
    await vault.onModuleInit();
    await vault.createNote({
      id: "existing-note",
      tier: "knowledge",
      title: "Existing",
      body: "Already here.",
    });
    const before = await vault.note("existing-note");

    await new VaultSeedService(vault, departments).onModuleInit();

    const { nodes } = await vault.graph();
    // existing-note + the vault-log its creation produced; no seeds.
    expect(nodes).toHaveLength(2);
    const after = await vault.note("existing-note");
    expect(after).toEqual(before);
  });

  it("a failing note write is logged and skipped, the rest of the seed still lands", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-seed-"));
    const vault = new VaultService(dir);
    await vault.onModuleInit();
    const originalCreateNote = vault.createNote.bind(vault);
    let calls = 0;
    vault.createNote = (async (input: Parameters<typeof originalCreateNote>[0]) => {
      calls += 1;
      if (calls === 1) throw new Error("disk exploded");
      return originalCreateNote(input);
    }) as typeof vault.createNote;

    await expect(new VaultSeedService(vault, departments).onModuleInit()).resolves.toBeUndefined();

    const { nodes } = await vault.graph();
    // 13 seeds attempted, the first one fails — 12 land (+ the vault-log note).
    expect(nodes.length).toBe(13);
  });
});
