import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateNoteError,
  InvalidNoteIdError,
  NoteNotFoundError,
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
});
