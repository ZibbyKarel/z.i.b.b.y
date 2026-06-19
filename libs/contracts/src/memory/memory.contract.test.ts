import { describe, expect, it } from "vitest";
import { MemoryGraphSchema, NoteIdSchema, NoteSchema, memoryContract } from "../index";

describe("memoryContract", () => {
  it("exposes index/note/graph/search/daily under /api/memory", () => {
    expect(memoryContract.getIndex.path).toBe("/api/memory/index");
    expect(memoryContract.getNote.path).toBe("/api/memory/note/:id");
    expect(memoryContract.getGraph.path).toBe("/api/memory/graph");
    expect(memoryContract.search.path).toBe("/api/memory/search");
    expect(memoryContract.appendDaily.method).toBe("POST");
  });

  it("exposes the write surfaces (create/update/append/index)", () => {
    expect(memoryContract.createNote.method).toBe("POST");
    expect(memoryContract.createNote.path).toBe("/api/memory/notes");
    expect(memoryContract.updateNote.method).toBe("PATCH");
    expect(memoryContract.updateNote.path).toBe("/api/memory/notes/:id");
    expect(memoryContract.appendToNote.path).toBe("/api/memory/notes/:id/append");
    expect(memoryContract.updateIndex.path).toBe("/api/memory/index/:id/links");
  });
});

describe("NoteIdSchema", () => {
  it("accepts existing-shaped ids", () => {
    for (const id of ["MEMORY", "2026-06-12", "zibby-index", "learned-run_123"]) {
      expect(NoteIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("rejects traversal / separator / empty / over-long ids", () => {
    for (const id of ["../x", "a/b", "..", ".hidden", "", "x".repeat(121)]) {
      expect(NoteIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

describe("memory schemas", () => {
  it("validates a note and a graph", () => {
    expect(
      NoteSchema.safeParse({
        id: "zibby",
        path: "zibby.md",
        tier: "memory",
        title: "Zibby",
        frontmatter: {},
        links: ["rohlik"],
      }).success,
    ).toBe(true);

    expect(
      MemoryGraphSchema.safeParse({
        nodes: [{ id: "a", label: "A", tier: "knowledge" }],
        edges: [{ from: "a", to: "b" }],
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown tier", () => {
    expect(
      NoteSchema.safeParse({
        id: "x",
        path: "x.md",
        tier: "archive",
        title: "X",
        frontmatter: {},
        links: [],
      }).success,
    ).toBe(false);
  });
});
