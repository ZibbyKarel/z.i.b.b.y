import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Proposal } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProposalsStore } from "./proposals.store";

const P: Proposal = {
  id: "prop_000000000001",
  source: "gap-detect",
  text: "Automate it?",
  confidence: "low",
  occurrences: 3,
  provenance: { noteId: "suggestions/automation-gaps" },
  createdAt: "2026-10-24T08:00:00.000Z",
  lastSeenAt: "2026-10-24T08:00:00.000Z",
  expiresAt: "2026-11-23T08:00:00.000Z",
  status: "open",
};

describe("ProposalsStore", () => {
  let dir: string;
  let store: ProposalsStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "proposals-store-"));
    store = new ProposalsStore(path.join(dir, "proposals"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads [] when the file does not exist yet", async () => {
    expect(await store.readAll()).toEqual([]);
  });

  it("writes proposals/proposals.json atomically and a fresh store reads it back", async () => {
    await store.mutate(() => ({ next: [P], result: undefined }));
    const raw = JSON.parse(
      await fs.readFile(path.join(dir, "proposals", "proposals.json"), "utf8"),
    );
    expect(raw).toEqual([P]);
    expect(await new ProposalsStore(path.join(dir, "proposals")).readAll()).toEqual([P]);
    const leftovers = (await fs.readdir(path.join(dir, "proposals"))).filter((f) =>
      f.endsWith(".tmp"),
    );
    expect(leftovers).toEqual([]);
  });

  it("reads a corrupt file as []", async () => {
    await fs.mkdir(path.join(dir, "proposals"), { recursive: true });
    await fs.writeFile(path.join(dir, "proposals", "proposals.json"), "{ nope");
    expect(await store.readAll()).toEqual([]);
    await fs.writeFile(path.join(dir, "proposals", "proposals.json"), '{"not":"an array"}');
    expect(await store.readAll()).toEqual([]);
  });

  it.each([
    ["unparseable", "{ nope"],
    ["not an array", '{"not":"an array"}'],
    ["an invalid record", JSON.stringify([P, { id: "bad" }])],
  ])(
    "quarantines a corrupt file (%s) before writing over it — original bytes kept",
    async (_label, bytes) => {
      const pdir = path.join(dir, "proposals");
      await fs.mkdir(pdir, { recursive: true });
      await fs.writeFile(path.join(pdir, "proposals.json"), bytes);
      expect(await store.readAll()).toEqual([]);

      const fresh = { ...P, id: "prop_00000000000f" };
      await store.mutate((all) => ({ next: [...all, fresh], result: undefined }));

      const names = await fs.readdir(pdir);
      const quarantined = names.filter((n) => /^proposals\.json\.corrupt-[0-9TZ.-]+$/.test(n));
      expect(quarantined).toHaveLength(1);
      expect(await fs.readFile(path.join(pdir, quarantined[0] ?? ""), "utf8")).toBe(bytes);
      expect(await store.readAll()).toEqual([fresh]);
    },
  );

  it("refuses to write when the file exists but cannot be read (no silent overwrite)", async () => {
    const pdir = path.join(dir, "proposals");
    // A directory where the file should be: readFile fails with EISDIR, not ENOENT.
    await fs.mkdir(path.join(pdir, "proposals.json"), { recursive: true });
    expect(await store.readAll()).toEqual([]);
    await expect(store.mutate(() => ({ next: [P], result: undefined }))).rejects.toThrow();
  });

  it("serializes concurrent mutations (no lost update)", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.mutate((all) => ({
          next: [...all, { ...P, id: `prop_${String(i).padStart(12, "0")}` }],
          result: undefined,
        })),
      ),
    );
    expect(await store.readAll()).toHaveLength(10);
  });
});
