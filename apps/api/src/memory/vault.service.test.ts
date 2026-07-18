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
  domainOf,
  ownerSubsystemOf,
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

  it("carries the owning project on graph nodes and search hits (Fáze 11)", async () => {
    await vault.createNote({
      id: "alpha-note",
      tier: "knowledge",
      title: "Alpha Note",
      body: "alpha payload",
      frontmatter: { project: "alpha" },
    });
    await vault.createNote({
      id: "global-note",
      tier: "knowledge",
      title: "Global Note",
      body: "alpha payload too",
    });

    const graph = await vault.graph();
    expect(graph.nodes.find((n) => n.id === "alpha-note")?.project).toBe("alpha");
    expect(graph.nodes.find((n) => n.id === "global-note")?.project).toBeUndefined();

    const hits = await vault.search("alpha payload");
    expect(hits.find((h) => h.id === "alpha-note")?.project).toBe("alpha");
    expect(hits.find((h) => h.id === "global-note")?.project).toBeUndefined();
  });

  it("F4b: ownerSubsystemOf reads a valid subsystem, ignores an invalid one, is undefined when absent", async () => {
    expect(ownerSubsystemOf({ subsystem: "forge" })).toBe("forge");
    expect(ownerSubsystemOf({ subsystem: "not-a-subsystem" })).toBeUndefined();
    expect(ownerSubsystemOf({})).toBeUndefined();
  });

  it("F4b: index() carries tags/aliases/subsystem from a fixture note", async () => {
    await vault.createNote({
      id: "subsystem-forge-moc",
      tier: "knowledge",
      title: "Forge — polička",
      body: "Shelf body.",
      tags: ["subsystem", "forge", "moc"],
      frontmatter: { subsystem: "forge", aliases: ["kovárna"] },
    });
    const index = await vault.index();
    const entry = index.find((e) => e.id === "subsystem-forge-moc");
    expect(entry?.subsystem).toBe("forge");
    expect(entry?.tags).toEqual(["subsystem", "forge", "moc"]);
    expect(entry?.aliases).toEqual(["kovárna"]);
  });

  it("F8: domainOf reads 'personal', rejects any other value, is undefined when absent", async () => {
    expect(domainOf({ domain: "personal" })).toBe("personal");
    expect(domainOf({ domain: "work" })).toBeUndefined();
    expect(domainOf({})).toBeUndefined();
  });

  it("F8: index()/graph() carry domain: personal from a fixture note, absent otherwise", async () => {
    await vault.createNote({
      id: "personal-jot",
      tier: "knowledge",
      title: "Personal jot",
      body: "Private body.",
      frontmatter: { domain: "personal" },
    });
    await vault.createNote({
      id: "work-note",
      tier: "knowledge",
      title: "Work note",
      body: "Work body.",
    });

    const index = await vault.index();
    expect(index.find((e) => e.id === "personal-jot")?.domain).toBe("personal");
    expect(index.find((e) => e.id === "work-note")?.domain).toBeUndefined();

    const graph = await vault.graph();
    expect(graph.nodes.find((n) => n.id === "personal-jot")?.domain).toBe("personal");
    expect(graph.nodes.find((n) => n.id === "work-note")?.domain).toBeUndefined();

    const hits = await vault.search("body");
    expect(hits.find((h) => h.id === "personal-jot")?.domain).toBe("personal");
    expect(hits.find((h) => h.id === "work-note")?.domain).toBeUndefined();
  });

  it("F4b: index() omits tags/aliases/subsystem from a note that never set them", async () => {
    await vault.createNote({ id: "plain-moc", tier: "knowledge", title: "Plain", body: "x" });
    const entry = (await vault.index()).find((e) => e.id === "plain-moc");
    expect(entry?.subsystem).toBeUndefined();
    expect(entry?.tags).toBeUndefined();
    expect(entry?.aliases).toBeUndefined();
  });

  it("F4b: graph() node carries subsystem", async () => {
    await vault.createNote({
      id: "subsystem-scout-moc",
      tier: "knowledge",
      title: "Scout — polička",
      body: "x",
      frontmatter: { subsystem: "scout" },
    });
    const graph = await vault.graph();
    expect(graph.nodes.find((n) => n.id === "subsystem-scout-moc")?.subsystem).toBe("scout");
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

  describe("raw notes (Fáze 107)", () => {
    it("promotes a boolean `raw` frontmatter value to a typed top-level field", async () => {
      const created = await vault.createNote({
        id: "raw-typed",
        tier: "knowledge",
        body: "x",
        raw: true,
      });
      expect(created.raw).toBe(true);
      expect(created.frontmatter.raw).toBe(true);

      const read = await vault.note("raw-typed");
      expect(read.raw).toBe(true);
    });

    it("omits `raw` when absent, and ignores a foreign non-boolean value", async () => {
      const untouched = await vault.createNote({ id: "raw-absent", tier: "knowledge", body: "x" });
      expect(untouched.raw).toBeUndefined();

      await vault.createNote({
        id: "raw-foreign",
        tier: "knowledge",
        body: "x",
        frontmatter: { raw: "yes" },
      });
      const read = await vault.note("raw-foreign");
      expect(read.raw).toBeUndefined();
    });

    it("rawNotes(): returns only notes with `raw: true`, shaped like note()", async () => {
      await vault.createNote({
        id: "raw-a",
        tier: "knowledge",
        title: "Raw A",
        body: "a",
        raw: true,
      });
      await vault.createNote({ id: "raw-b", tier: "memory", body: "b", raw: false });
      await vault.createNote({ id: "raw-c", tier: "knowledge", body: "c" });

      const rawOnes = await vault.rawNotes();
      expect(rawOnes.map((n) => n.id)).toEqual(["raw-a"]);
      expect(rawOnes[0]?.title).toBe("Raw A");
      expect(rawOnes[0]?.body).toBe("a");
      expect(rawOnes[0]?.backlinks).toEqual([]);
    });

    it("createNote: omitted `tier` defaults to knowledge and forces `raw: true`", async () => {
      const created = await vault.createNote({ id: "quick-capture", body: "captured text" });
      expect(created.tier).toBe("knowledge");
      expect(created.raw).toBe(true);
      expect(created.frontmatter.raw).toBe(true);

      const rawOnes = await vault.rawNotes();
      expect(rawOnes.map((n) => n.id)).toContain("quick-capture");
    });

    it("createNote: explicit `tier` + explicit `raw: false` behaves exactly as today", async () => {
      const created = await vault.createNote({
        id: "explicit-note",
        tier: "memory",
        body: "x",
        raw: false,
      });
      expect(created.tier).toBe("memory");
      expect(created.raw).toBe(false);

      const rawOnes = await vault.rawNotes();
      expect(rawOnes.map((n) => n.id)).not.toContain("explicit-note");
    });

    it("createNote: explicit `tier` with no `raw` leaves it unset (unchanged default behavior)", async () => {
      const created = await vault.createNote({ id: "explicit-no-raw", tier: "daily", body: "x" });
      expect(created.tier).toBe("daily");
      expect(created.raw).toBeUndefined();
      expect(created.frontmatter.raw).toBeUndefined();
    });

    it("updateNote: clears `raw` via the top-level patch field", async () => {
      await vault.createNote({ id: "toggle-raw", tier: "knowledge", body: "x", raw: true });
      const updated = await vault.updateNote("toggle-raw", { raw: false });
      expect(updated.raw).toBe(false);

      const rawOnes = await vault.rawNotes();
      expect(rawOnes.map((n) => n.id)).not.toContain("toggle-raw");
    });
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
