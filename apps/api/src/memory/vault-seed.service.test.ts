import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GroundingService } from "./grounding.service";
import { VaultSeedService } from "./vault-seed.service";
import { VaultService } from "./vault.service";

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
    await new VaultSeedService(vault).onModuleInit();

    const { nodes } = await vault.graph();
    expect(nodes.length).toBe(13);
    expect(nodes.map((n) => n.id)).toContain("north-star");
    expect(nodes.map((n) => n.id)).toContain("zibby-index");
    expect(nodes.map((n) => n.id)).toContain("subsystem-forge-moc");

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

    await new VaultSeedService(vault).onModuleInit();

    const { nodes } = await vault.graph();
    expect(nodes).toHaveLength(1);
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

    await expect(new VaultSeedService(vault).onModuleInit()).resolves.toBeUndefined();

    const { nodes } = await vault.graph();
    // 13 seeds attempted, the first one fails — 12 land.
    expect(nodes.length).toBe(12);
  });
});
