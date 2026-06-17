import { describe, expect, it } from "vitest"
import type { ResearchSource } from "@zibby/contracts"
import { rankSourceItems, relevanceOf } from "./research-ranking"

const source: ResearchSource = { id: "hn", kind: "hn", label: "HN", enabled: true }

describe("relevanceOf", () => {
  it("scores by fraction of matched interests", () => {
    const { relevance, matchedInterests } = relevanceOf(
      { id: "1", title: "A typescript AI agent toolkit", summary: "" },
      ["typescript", "ai agent", "rust"],
    )
    expect(matchedInterests).toEqual(["typescript", "ai agent"])
    expect(relevance).toBeCloseTo(2 / 3)
  })

  it("is diacritics/punctuation insensitive on whole-phrase match", () => {
    const { relevance } = relevanceOf({ id: "1", title: "Nx-monorepo tips!", summary: "" }, ["nx monorepo"])
    expect(relevance).toBe(1)
  })

  it("returns a neutral 0.5 when no interests are configured", () => {
    const { relevance, matchedInterests } = relevanceOf({ id: "1", title: "anything", summary: "" }, [])
    expect(relevance).toBe(0.5)
    expect(matchedInterests).toEqual([])
  })
})

describe("rankSourceItems", () => {
  it("drops zero-relevance items and sorts by relevance desc", () => {
    const ranked = rankSourceItems(
      source,
      [
        { id: "a", title: "unrelated gardening", summary: "" },
        { id: "b", title: "typescript tips", summary: "" },
        { id: "c", title: "typescript and ai agents", summary: "" },
      ],
      ["typescript", "ai agents"],
    )
    expect(ranked.map((r) => r.id)).toEqual(["c", "b"])
    expect(ranked[0]?.relevance).toBe(1)
    expect(ranked[0]?.source).toBe("hn")
    expect(ranked[0]?.sourceId).toBe("hn")
  })

  it("keeps every item when no interests narrow the digest", () => {
    const ranked = rankSourceItems(
      source,
      [{ id: "a", title: "x", summary: "" }, { id: "b", title: "y", summary: "" }],
      [],
    )
    expect(ranked).toHaveLength(2)
    expect(ranked.every((r) => r.relevance === 0.5)).toBe(true)
  })
})
