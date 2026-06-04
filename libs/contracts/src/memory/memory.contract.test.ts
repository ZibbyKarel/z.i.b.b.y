import { describe, expect, it } from "vitest"
import { MemoryGraphSchema, NoteSchema, memoryContract } from "../index"

describe("memoryContract", () => {
  it("exposes index/note/graph/search/daily under /api/memory", () => {
    expect(memoryContract.getIndex.path).toBe("/api/memory/index")
    expect(memoryContract.getNote.path).toBe("/api/memory/note/:id")
    expect(memoryContract.getGraph.path).toBe("/api/memory/graph")
    expect(memoryContract.search.path).toBe("/api/memory/search")
    expect(memoryContract.appendDaily.method).toBe("POST")
  })
})

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
    ).toBe(true)

    expect(
      MemoryGraphSchema.safeParse({
        nodes: [{ id: "a", label: "A", tier: "knowledge" }],
        edges: [{ from: "a", to: "b" }],
      }).success,
    ).toBe(true)
  })

  it("rejects an unknown tier", () => {
    expect(
      NoteSchema.safeParse({ id: "x", path: "x.md", tier: "archive", title: "X", frontmatter: {}, links: [] })
        .success,
    ).toBe(false)
  })
})
