import { describe, expect, it, vi } from "vitest"
import { IdeaGeneratorService, pairIdeas } from "./idea-generator.service"

describe("pairIdeas", () => {
  const trends = [
    { title: "AI agent frameworks surge", summary: "Lots of new agent toolkits." },
    { title: "Nx 21 task caching", summary: "Faster monorepo builds." },
    { title: "A typescript CVE", summary: "Patch your HTTP client." },
    { title: "Extra trend", summary: "Beyond the cap." },
  ]

  it("pairs interests with trends, capped at 3", () => {
    const ideas = pairIdeas(["ai agents", "typescript"], trends)
    expect(ideas).toHaveLength(3)
    expect(ideas[0]?.title).toBe("ai agents × AI agent frameworks surge")
    // interests cycle: idea[2] reuses the first interest
    expect(ideas[2]?.title.startsWith("ai agents ×")).toBe(true)
    expect(ideas[0]?.rationale).toContain("Lots of new agent toolkits")
  })

  it("is empty with no interests or no trends (stays quiet)", () => {
    expect(pairIdeas([], trends)).toEqual([])
    expect(pairIdeas(["x"], [])).toEqual([])
  })
})

function makeService(opts: {
  interests?: string[]
  trends?: Array<{ title: string; summary: string }>
  vaultBody?: string
}) {
  const config = { read: vi.fn(async () => ({ interests: opts.interests ?? [], sources: [], financeWatch: false })) }
  const research = {
    latest: vi.fn(async () => ({ generatedAt: new Date(0).toISOString(), items: (opts.trends ?? []).map((t, i) => ({ id: `t${i}`, source: "hn", sourceId: "hn", relevance: 1, matchedInterests: [], ...t })) })),
  }
  const vault = {
    note: vi.fn(async () => {
      if (!opts.vaultBody) throw new Error("not found")
      return { id: "suggestions/app-ideas", title: "App Ideas", body: opts.vaultBody, tier: "memory" }
    }),
    updateNote: vi.fn(async () => ({}) as never),
    createNote: vi.fn(async () => ({}) as never),
  }
  const record = vi.fn().mockResolvedValue(undefined)
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) }
  return {
    svc: new IdeaGeneratorService(config as never, research as never, vault as never, { record } as never, logger as never),
    vault,
    record,
  }
}

describe("IdeaGeneratorService", () => {
  it("generates ideas, writes the vault note, and records activity", async () => {
    const { svc, vault, record } = makeService({
      interests: ["ai agents"],
      trends: [{ title: "Agent toolkits", summary: "new tools" }],
    })
    const result = await svc.generate(new Date())
    expect(result.ideas).toHaveLength(1)
    expect(result.suggestions[0]).toContain("ai agents × Agent toolkits")
    expect(vault.updateNote).toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "app-ideas-generated", refs: { noteId: "suggestions/app-ideas" } }),
    )
  })

  it("writes nothing when there are no interests or trends", async () => {
    const { svc, vault } = makeService({ interests: [], trends: [] })
    const result = await svc.generate(new Date())
    expect(result.ideas).toEqual([])
    expect(vault.updateNote).not.toHaveBeenCalled()
    expect(vault.createNote).not.toHaveBeenCalled()
  })

  it("reads idea bullets back for the briefing", async () => {
    const body = "*Updated*\n\n- [ ] ai agents × X — pair it\n"
    const { svc } = makeService({ vaultBody: body })
    expect(await svc.readIdeas()).toEqual(["ai agents × X — pair it"])
  })
})
