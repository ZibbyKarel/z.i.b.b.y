import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateNoteError,
  InvalidNoteIdError,
  NoteNotFoundError,
  SimilarNoteError,
  VaultService,
} from "./vault.service";

describe("VaultService write paths", () => {
  let dir: string;
  let vault: VaultService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-write-"));
    vault = new VaultService(dir);
    await vault.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("creates a note and re-reads it round-trip (frontmatter, tier, links)", async () => {
    const created = await vault.createNote({
      id: "alpha",
      tier: "knowledge",
      title: "Alpha",
      body: "Body links to [[beta]].",
      frontmatter: { source: "test" },
    });
    expect(created.tier).toBe("knowledge");
    expect(created.path).toBe(path.join("knowledge", "alpha.md"));

    const read = await vault.note("alpha");
    expect(read.title).toBe("Alpha");
    expect(read.frontmatter.source).toBe("test");
    expect(read.frontmatter.title).toBe("Alpha");
    expect(read.links).toEqual(["beta"]);
    expect(read.body).toContain("Body links to [[beta]].");
  });

  it("places a memory-tier note at the vault root", async () => {
    const note = await vault.createNote({ id: "root-note", tier: "memory", body: "x" });
    expect(note.path).toBe("root-note.md");
    expect(note.tier).toBe("memory");
  });

  it("rejects a duplicate id across tiers (409)", async () => {
    await vault.createNote({ id: "dup", tier: "memory", body: "first" });
    await expect(
      vault.createNote({ id: "dup", tier: "knowledge", body: "second" }),
    ).rejects.toBeInstanceOf(DuplicateNoteError);
  });

  it("rejects traversal / separator / empty / over-long ids (422)", async () => {
    for (const id of ["../escape", "a/b", "..", ".hidden", "", "x".repeat(121)]) {
      await expect(vault.createNote({ id, tier: "knowledge", body: "x" })).rejects.toBeInstanceOf(
        InvalidNoteIdError,
      );
    }
  });

  it("updates: merges frontmatter (patch wins) and preserves unknown keys", async () => {
    await vault.createNote({
      id: "merge",
      tier: "knowledge",
      title: "Old",
      body: "old body",
      frontmatter: { keep: "me", obsidianTag: ["a"] },
    });
    const updated = await vault.updateNote("merge", {
      title: "New",
      body: "new body",
      frontmatter: { keep: "you" },
    });
    expect(updated.title).toBe("New");
    expect(updated.body).toBe("new body");
    expect(updated.frontmatter.keep).toBe("you");
    expect(updated.frontmatter.obsidianTag).toEqual(["a"]);
  });

  it("updates: missing note throws NoteNotFoundError (404)", async () => {
    await expect(vault.updateNote("ghost", { body: "x" })).rejects.toBeInstanceOf(
      NoteNotFoundError,
    );
  });

  it("appends to a note while keeping frontmatter intact", async () => {
    await vault.createNote({ id: "log", tier: "knowledge", title: "Log", body: "line one" });
    const after = await vault.appendToNote("log", "line two");
    expect(after.body).toContain("line one");
    expect(after.body).toContain("line two");
    expect(after.frontmatter.title).toBe("Log");
  });

  it("leaves no .tmp files after writes", async () => {
    await vault.createNote({ id: "clean", tier: "knowledge", body: "x" });
    await vault.updateNote("clean", { body: "y" });
    await vault.appendToNote("clean", "z");
    const entries = await fs.readdir(path.join(dir, "knowledge"));
    expect(entries.some((e) => e.includes(".tmp"))).toBe(false);
  });

  it("updateIndex: auto-creates a missing MOC and is idempotent", async () => {
    await vault.updateIndex("proj-moc", "learned-1");
    await vault.updateIndex("proj-moc", "learned-1");
    const moc = await vault.note("proj-moc");
    expect(moc.tier).toBe("knowledge");
    const occurrences = (moc.body?.match(/\[\[learned-1\]\]/g) ?? []).length;
    expect(occurrences).toBe(1);
    expect(moc.links).toContain("learned-1");
  });

  it("updateIndex: replaces an existing line when the label changes", async () => {
    await vault.updateIndex("moc2", "target", "First label");
    await vault.updateIndex("moc2", "target", "Second label");
    const moc = await vault.note("moc2");
    expect(moc.body).toContain("Second label");
    expect(moc.body).not.toContain("First label");
    const occurrences = (moc.body?.match(/\[\[target\]\]/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it("invalidates the scan cache: a write is immediately visible in graph()", async () => {
    await vault.createNote({ id: "fresh", tier: "knowledge", title: "Fresh", body: "x" });
    const graph = await vault.graph();
    expect(graph.nodes.some((n) => n.id === "fresh")).toBe(true);
  });

  it("round-trips typed `type`/`tags` through frontmatter (Fáze 3)", async () => {
    const created = await vault.createNote({
      id: "typed-1",
      tier: "knowledge",
      title: "Typed",
      body: "x",
      type: "decision",
      tags: ["infra", "pnpm"],
    });
    expect(created.type).toBe("decision");
    expect(created.tags).toEqual(["infra", "pnpm"]);
    expect(created.frontmatter.type).toBe("decision");
    expect(created.frontmatter.tags).toEqual(["infra", "pnpm"]);

    const read = await vault.note("typed-1");
    expect(read.type).toBe("decision");
    expect(read.tags).toEqual(["infra", "pnpm"]);
  });

  it("omits `type`/`tags` from a note that never set them (backwards compatible)", async () => {
    const created = await vault.createNote({ id: "untyped-1", tier: "knowledge", body: "x" });
    expect(created.type).toBeUndefined();
    expect(created.tags).toBeUndefined();
  });

  it("ignores a foreign/invalid `type` frontmatter value instead of surfacing it", async () => {
    await vault.createNote({
      id: "foreign-type",
      tier: "knowledge",
      body: "x",
      frontmatter: { type: "not-a-real-type" },
    });
    const read = await vault.note("foreign-type");
    expect(read.type).toBeUndefined();
  });

  describe("createNote: dedupe (findSimilar)", () => {
    it("dedupe: false (default) ignores a near-duplicate and writes anyway", async () => {
      await vault.createNote({
        id: "orig",
        tier: "knowledge",
        title: "pnpm is canonical",
        body: "Always use pnpm, never npm or yarn, for this monorepo.",
        tags: ["pnpm", "tooling"],
      });
      const created = await vault.createNote({
        id: "dup-not-deduped",
        tier: "knowledge",
        title: "pnpm is canonical",
        body: "Always use pnpm, never npm or yarn, for this monorepo.",
        tags: ["pnpm", "tooling"],
      });
      expect(created.id).toBe("dup-not-deduped");
    });

    it("dedupe: true throws SimilarNoteError when title+tags+body cross the threshold", async () => {
      await vault.createNote({
        id: "orig-2",
        tier: "knowledge",
        title: "pnpm is canonical",
        body: "Always use pnpm, never npm or yarn, for this monorepo.",
        tags: ["pnpm", "tooling"],
      });
      await expect(
        vault.createNote({
          id: "similar-2",
          tier: "knowledge",
          title: "pnpm is canonical",
          body: "Always use pnpm, never npm or yarn, for this monorepo.",
          tags: ["pnpm", "tooling"],
          dedupe: true,
        }),
      ).rejects.toBeInstanceOf(SimilarNoteError);
    });

    it("dedupe: true — a title-only match with unrelated tags/body stays below threshold", async () => {
      await vault.createNote({
        id: "orig-3",
        tier: "knowledge",
        title: "Same Title",
        body: "Completely unrelated content about widgets and gadgets and things.",
        tags: ["widgets"],
      });
      // Title match alone is 0.4 — below SIMILARITY_THRESHOLD (0.75).
      const created = await vault.createNote({
        id: "different-3",
        tier: "knowledge",
        title: "Same Title",
        body: "Totally different subject matter involving spreadsheets and finance.",
        tags: ["finance"],
        dedupe: true,
      });
      expect(created.id).toBe("different-3");
    });

    it("dedupe: true — findSimilar restricts comparison to the same tier", async () => {
      await vault.createNote({
        id: "memory-note",
        tier: "memory",
        title: "pnpm is canonical",
        body: "Always use pnpm, never npm or yarn, for this monorepo.",
        tags: ["pnpm", "tooling"],
      });
      // Same title/tags/body but a DIFFERENT tier — must not be treated as similar.
      const created = await vault.createNote({
        id: "knowledge-note",
        tier: "knowledge",
        title: "pnpm is canonical",
        body: "Always use pnpm, never npm or yarn, for this monorepo.",
        tags: ["pnpm", "tooling"],
        dedupe: true,
      });
      expect(created.id).toBe("knowledge-note");
    });

    it("findSimilar carries the existing note's id on SimilarNoteError", async () => {
      await vault.createNote({
        id: "carrier",
        tier: "knowledge",
        title: "carried title",
        body: "identical body text used for the similarity match here.",
        tags: ["a", "b"],
      });
      await expect(
        vault.createNote({
          id: "carrier-2",
          tier: "knowledge",
          title: "carried title",
          body: "identical body text used for the similarity match here.",
          tags: ["a", "b"],
          dedupe: true,
        }),
      ).rejects.toMatchObject({ existingId: "carrier" });
    });
  });
});
