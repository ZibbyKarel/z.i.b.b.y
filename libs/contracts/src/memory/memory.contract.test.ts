import { describe, expect, it } from "vitest";
import {
  CreateNoteSchema,
  ImportRequestSchema,
  ImportResultSchema,
  IndexEntrySchema,
  MemoryGraphSchema,
  NoteDomainSchema,
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
    expect(memoryContract.import.method).toBe("POST");
    expect(memoryContract.import.path).toBe("/api/memory/import");
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

  it("accepts and round-trips `raw: true` (halda flag)", () => {
    const parsed = NoteSchema.safeParse({
      id: "zibby",
      path: "zibby.md",
      tier: "knowledge",
      title: "Zibby",
      frontmatter: {},
      links: [],
      raw: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.raw).toBe(true);
    }
  });

  it("omitting `raw` still validates (backwards compatible)", () => {
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

describe("F4b: subsystem/tags/aliases retrieval fields", () => {
  it("IndexEntrySchema accepts the new optional subsystem/tags/aliases fields", () => {
    const parsed = IndexEntrySchema.safeParse({
      id: "subsystem-forge-moc",
      title: "Forge — polička",
      tier: "knowledge",
      subsystem: "forge",
      tags: ["subsystem", "forge", "moc"],
      aliases: ["kovárna"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.subsystem).toBe("forge");
      expect(parsed.data.tags).toEqual(["subsystem", "forge", "moc"]);
      expect(parsed.data.aliases).toEqual(["kovárna"]);
    }
  });

  it("a legacy IndexEntry payload without the new fields still parses", () => {
    const parsed = IndexEntrySchema.safeParse({
      id: "zibby-index",
      title: "Zibby Index",
      tier: "knowledge",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.subsystem).toBeUndefined();
      expect(parsed.data.tags).toBeUndefined();
      expect(parsed.data.aliases).toBeUndefined();
    }
  });

  it("rejects an invalid subsystem id on IndexEntry", () => {
    expect(
      IndexEntrySchema.safeParse({
        id: "x",
        title: "X",
        tier: "knowledge",
        subsystem: "not-a-subsystem",
      }).success,
    ).toBe(false);
  });

  it("NoteSchema accepts and rejects `subsystem` the same way", () => {
    expect(
      NoteSchema.safeParse({
        id: "subsystem-scout-moc",
        path: "knowledge/subsystem-scout-moc.md",
        tier: "knowledge",
        title: "Scout — polička",
        frontmatter: { subsystem: "scout" },
        links: [],
        subsystem: "scout",
      }).success,
    ).toBe(true);
    expect(
      NoteSchema.safeParse({
        id: "x",
        path: "x.md",
        tier: "knowledge",
        title: "X",
        frontmatter: {},
        links: [],
        subsystem: "not-a-subsystem",
      }).success,
    ).toBe(false);
  });

  it("MemoryGraphSchema node accepts `subsystem`", () => {
    const parsed = MemoryGraphSchema.safeParse({
      nodes: [{ id: "a", label: "A", tier: "knowledge", subsystem: "forge" }],
      edges: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.nodes[0]?.subsystem).toBe("forge");
  });
});

describe("F8: domain (personal-note isolation)", () => {
  it("NoteDomainSchema accepts only the literal 'personal'", () => {
    expect(NoteDomainSchema.safeParse("personal").success).toBe(true);
    expect(NoteDomainSchema.safeParse("work").success).toBe(false);
    expect(NoteDomainSchema.safeParse(undefined).success).toBe(false);
  });

  it("IndexEntrySchema accepts an optional domain: personal and rejects domain: work", () => {
    const personal = IndexEntrySchema.safeParse({
      id: "personal-note",
      title: "Personal note",
      tier: "knowledge",
      domain: "personal",
    });
    expect(personal.success).toBe(true);
    if (personal.success) expect(personal.data.domain).toBe("personal");

    expect(
      IndexEntrySchema.safeParse({
        id: "x",
        title: "X",
        tier: "knowledge",
        domain: "work",
      }).success,
    ).toBe(false);
  });

  it("a legacy IndexEntry payload without `domain` still parses, with domain undefined", () => {
    const parsed = IndexEntrySchema.safeParse({
      id: "zibby-index",
      title: "Zibby Index",
      tier: "knowledge",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.domain).toBeUndefined();
  });

  it("NoteSchema accepts and rejects `domain` the same way", () => {
    expect(
      NoteSchema.safeParse({
        id: "personal-jot",
        path: "knowledge/personal-jot.md",
        tier: "knowledge",
        title: "Jot",
        frontmatter: { domain: "personal" },
        links: [],
        domain: "personal",
      }).success,
    ).toBe(true);
    expect(
      NoteSchema.safeParse({
        id: "x",
        path: "x.md",
        tier: "knowledge",
        title: "X",
        frontmatter: {},
        links: [],
        domain: "work",
      }).success,
    ).toBe(false);
  });

  it("MemoryGraphSchema node accepts `domain`", () => {
    const parsed = MemoryGraphSchema.safeParse({
      nodes: [{ id: "a", label: "A", tier: "knowledge", domain: "personal" }],
      edges: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.nodes[0]?.domain).toBe("personal");
  });

  it("SearchHitSchema accepts `domain`", () => {
    const parsed = SearchHitSchema.safeParse({
      id: "personal-jot",
      title: "Jot",
      tier: "knowledge",
      snippet: "…",
      domain: "personal",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.domain).toBe("personal");
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

  it("accepts `raw` alongside an explicit `tier`", () => {
    const parsed = CreateNoteSchema.safeParse({
      id: "note-1",
      tier: "knowledge",
      body: "x",
      raw: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.raw).toBe(true);
      expect(parsed.data.tier).toBe("knowledge");
    }
  });

  it("accepts omitting `tier` (quick-capture path — server defaults it)", () => {
    const parsed = CreateNoteSchema.safeParse({ id: "note-1", body: "x" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tier).toBeUndefined();
    }
  });

  it("still validates with an explicit `tier` and no `raw`", () => {
    expect(CreateNoteSchema.safeParse({ id: "note-1", tier: "memory", body: "x" }).success).toBe(
      true,
    );
  });
});

describe("ImportRequestSchema", () => {
  it("parses a valid import request", () => {
    const parsed = ImportRequestSchema.safeParse({
      sourcePath: "/Users/karel/notes",
      distillNow: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sourcePath).toBe("/Users/karel/notes");
      expect(parsed.data.distillNow).toBe(true);
    }
  });

  it("defaults `distillNow` to false when omitted", () => {
    const parsed = ImportRequestSchema.safeParse({ sourcePath: "/Users/karel/notes" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.distillNow).toBe(false);
    }
  });

  it("rejects an empty `sourcePath`", () => {
    expect(ImportRequestSchema.safeParse({ sourcePath: "" }).success).toBe(false);
  });
});

describe("ImportResultSchema", () => {
  it("parses a valid import result with `skippedByReason`", () => {
    const parsed = ImportResultSchema.safeParse({
      staged: 12,
      skipped: 3,
      skippedByReason: { unsupported: 2, oversized: 1 },
      distillTriggered: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.staged).toBe(12);
      expect(parsed.data.skippedByReason).toEqual({ unsupported: 2, oversized: 1 });
    }
  });

  it("omitting `skippedByReason` still validates (backwards compatible)", () => {
    const parsed = ImportResultSchema.safeParse({
      staged: 0,
      skipped: 0,
      distillTriggered: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.skippedByReason).toBeUndefined();
    }
  });
});
