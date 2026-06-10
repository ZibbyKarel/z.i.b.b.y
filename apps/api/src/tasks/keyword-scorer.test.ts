import { describe, expect, it } from "vitest"
import { KeywordScorer } from "./keyword-scorer"
import type { RoutableTarget } from "./task-router"

const candidates: RoutableTarget[] = [
  {
    kind: "agent",
    id: "curator",
    name: "Kurátor",
    glyph: "film",
    category: "Média",
    search: "Kurátor curator Média Třídí a popisuje média v knihovně",
  },
  {
    kind: "agent",
    id: "coder",
    name: "Kodér",
    glyph: "code",
    category: "Vývoj",
    search: "Kodér coder Vývoj Implementuje podle design.md v izolované branchi",
  },
  {
    kind: "pipeline",
    id: "build-feature",
    name: "Build Feature",
    glyph: "flow",
    search: "Build Feature build-feature Spec implementace testy a docs",
  },
]

const scorer = new KeywordScorer()

describe("KeywordScorer", () => {
  it("routes to the candidate whose catalog terms match the description", () => {
    const r = scorer.score({ text: "Srovnej a popiš média v knihovně" }, candidates)
    expect(r?.target.id).toBe("curator")
    expect(r?.matchedTerms.length).toBeGreaterThan(0)
    expect(r?.confidence ?? 0).toBeGreaterThan(0.4)
  })

  it("uses path hints as routing signal", () => {
    const r = scorer.score(
      { text: "srovnej to", paths: ["~/Projects/media-vault"] },
      candidates,
    )
    // "media" in the path matches the curator's catalog blob.
    expect(r?.target.kind).toBe("agent")
  })

  it("returns every candidate for manual override, stripped to the wire shape", () => {
    const r = scorer.score({ text: "cokoliv" }, candidates)
    expect(r?.candidates).toHaveLength(3)
    expect(r?.candidates.some((c) => c.kind === "pipeline")).toBe(true)
    // The internal `search` blob must not leak onto the wire.
    expect(r?.candidates[0]).not.toHaveProperty("search")
  })

  it("flags low confidence when nothing matches", () => {
    const r = scorer.score({ text: "xyzzy zzz" }, candidates)
    expect(r?.confidence).toBeLessThan(0.4)
  })

  it("returns null when the catalog is empty", () => {
    expect(scorer.score({ text: "anything" }, [])).toBeNull()
  })

  it("is deterministic for the same input", () => {
    const a = scorer.score({ text: "Implementuj podle design.md" }, candidates)
    const b = scorer.score({ text: "Implementuj podle design.md" }, candidates)
    expect(a).toEqual(b)
    expect(a?.target.id).toBe("coder")
  })
})
