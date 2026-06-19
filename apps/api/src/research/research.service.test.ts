import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchConfig } from "@zibby/contracts";
import { FakeResearchAdapter } from "./fake.adapter";
import { ResearchConfigStore } from "./research-config.store";
import { ResearchService } from "./research.service";

function makeVault() {
  const notes = new Map<string, string>();
  return {
    notes,
    updateNote: vi.fn(async (id: string, { body }: { body: string }) => {
      if (!notes.has(id)) throw new Error("not found");
      notes.set(id, body);
      return { id };
    }),
    createNote: vi.fn(async ({ id, body }: { id: string; body: string }) => {
      notes.set(id, body);
      return { id };
    }),
  };
}

describe("ResearchService", () => {
  let dir: string;
  let configFile: string;
  let digestFile: string;
  let fixturesDir: string;
  let vault: ReturnType<typeof makeVault>;
  let record: ReturnType<typeof vi.fn>;
  let service: ResearchService;

  const now = new Date("2026-06-17T06:00:00.000Z");

  async function writeConfig(config: Partial<ResearchConfig>): Promise<void> {
    await fs.writeFile(
      configFile,
      JSON.stringify({ interests: [], sources: [], financeWatch: false, ...config }),
    );
  }

  async function writeFixture(sourceId: string, items: unknown[]): Promise<void> {
    await fs.writeFile(path.join(fixturesDir, `${sourceId}.json`), JSON.stringify(items));
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "research-"));
    configFile = path.join(dir, "research-config.json");
    digestFile = path.join(dir, "research-digest.json");
    fixturesDir = path.join(dir, "fixtures");
    await fs.mkdir(fixturesDir, { recursive: true });
    vault = makeVault();
    record = vi.fn().mockResolvedValue(undefined);

    service = new ResearchService(
      new ResearchConfigStore(configFile),
      new FakeResearchAdapter(fixturesDir),
      vault as never,
      { record } as never,
      digestFile,
      { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) } as never,
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns an empty digest before the first pass", async () => {
    const digest = await service.latest(now);
    expect(digest.items).toEqual([]);
  });

  it("ranks configured sources, persists JSON + vault note, and records activity", async () => {
    await writeConfig({
      interests: ["typescript"],
      sources: [{ id: "hn", kind: "hn", label: "HN", enabled: true }],
    });
    await writeFixture("hn", [
      { id: "a", title: "typescript wins", summary: "s" },
      { id: "b", title: "unrelated", summary: "s" },
    ]);

    const digest = await service.refresh(now);
    expect(digest.items.map((i) => i.id)).toEqual(["a"]); // "unrelated" dropped (0 relevance)

    // Persisted JSON readable via latest().
    const latest = await service.latest(now);
    expect(latest.items).toHaveLength(1);

    // Vault note mirrored with a bullet line the briefing can parse.
    expect(vault.notes.get("intelligence/digest")).toContain("- **typescript wins** — s");

    // Recorded as a Tier-1 research-digest activity.
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "research-digest", refs: { noteId: "intelligence/digest" } }),
    );
  });

  it("skips a finance source unless financeWatch is on", async () => {
    await writeConfig({
      sources: [{ id: "fin", kind: "finance", label: "Markets", enabled: true }],
      financeWatch: false,
    });
    await writeFixture("fin", [{ id: "f", title: "market move", summary: "s" }]);

    const digest = await service.refresh(now);
    expect(digest.items).toEqual([]);
  });

  it("includes a finance source when financeWatch is on", async () => {
    await writeConfig({
      sources: [{ id: "fin", kind: "finance", label: "Markets", enabled: true }],
      financeWatch: true,
    });
    await writeFixture("fin", [{ id: "f", title: "market move", summary: "s" }]);

    const digest = await service.refresh(now);
    expect(digest.items.map((i) => i.id)).toEqual(["f"]);
  });

  it("skips a disabled source", async () => {
    await writeConfig({
      sources: [{ id: "hn", kind: "hn", label: "HN", enabled: false }],
    });
    await writeFixture("hn", [{ id: "a", title: "x", summary: "s" }]);
    const digest = await service.refresh(now);
    expect(digest.items).toEqual([]);
  });
});
