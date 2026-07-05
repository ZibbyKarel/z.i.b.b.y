import { describe, expect, it } from "vitest";
import {
  CreateNoteSchema,
  MemoryGraphSchema,
  NoteIdSchema,
  NoteSchema,
  NoteTypeSchema,
  SearchHitSchema,
  memoryContract,
} from "../index";

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

  it("accepts an optional `project` on graph nodes and search hits (Fáze 11)", () => {
    const graph = MemoryGraphSchema.safeParse({
      nodes: [
        { id: "a", label: "A", tier: "knowledge", project: "alpha" },
        { id: "b", label: "B", tier: "memory" },
      ],
      edges: [],
    });
    expect(graph.success).toBe(true);
    if (graph.success) {
      expect(graph.data.nodes[0]?.project).toBe("alpha");
      expect(graph.data.nodes[1]?.project).toBeUndefined();
    }

    const hit = SearchHitSchema.safeParse({
      id: "a",
      title: "A",
      tier: "knowledge",
      snippet: "…",
      project: "alpha",
    });
    expect(hit.success).toBe(true);
    // Back-compat: a hit without `project` still validates.
    expect(
      SearchHitSchema.safeParse({ id: "b", title: "B", tier: "memory", snippet: "…" }).success,
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

  it("accepts an optional typed `type`/`tags` pair on a note (Fáze 3)", () => {
    const parsed = NoteSchema.safeParse({
      id: "zibby",
      path: "zibby.md",
      tier: "memory",
      title: "Zibby",
      frontmatter: {},
      links: [],
      type: "decision",
      tags: ["infra", "pnpm"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("decision");
      expect(parsed.data.tags).toEqual(["infra", "pnpm"]);
    }
  });

  it("omitting `type`/`tags` still validates (backwards compatible)", () => {
    expect(
      NoteSchema.safeParse({
        id: "zibby",
        path: "zibby.md",
        tier: "memory",
        title: "Zibby",
        frontmatter: {},
        links: [],
      }).success,
    ).toBe(true);
  });
});

describe("NoteTypeSchema", () => {
  it("accepts exactly the four durable-note kinds", () => {
    for (const type of ["decision", "preference", "fact", "pattern"]) {
      expect(NoteTypeSchema.safeParse(type).success).toBe(true);
    }
    expect(NoteTypeSchema.safeParse("todo").success).toBe(false);
  });
});

describe("CreateNoteSchema", () => {
  it("accepts optional `type`/`tags`/`dedupe` write-option fields", () => {
    const parsed = CreateNoteSchema.safeParse({
      id: "note-1",
      tier: "knowledge",
      body: "x",
      type: "pattern",
      tags: ["a", "b"],
      dedupe: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("still validates without any of the new fields (backwards compatible)", () => {
    expect(CreateNoteSchema.safeParse({ id: "note-1", tier: "knowledge", body: "x" }).success).toBe(
      true,
    );
  });
});
