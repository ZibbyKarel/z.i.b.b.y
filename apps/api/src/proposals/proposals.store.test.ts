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

  it("skips individually invalid records", async () => {
    await fs.mkdir(path.join(dir, "proposals"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "proposals", "proposals.json"),
      JSON.stringify([P, { id: "bad" }]),
    );
    expect(await store.readAll()).toEqual([P]);
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
