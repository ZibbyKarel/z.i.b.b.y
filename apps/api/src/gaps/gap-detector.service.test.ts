import { describe, expect, it, vi } from "vitest"
import type { ActivityEntry } from "@zibby/contracts"
import { GapDetectorService } from "./gap-detector.service"

function taskCreated(summary: string, daysAgo = 1, i = 0): ActivityEntry {
  return {
    id: `tc-${summary}-${daysAgo}-${i}`,
    at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    kind: "task-created",
    summary,
    refs: {},
  }
}

function makeService(entries: ActivityEntry[] = [], vaultBody = "") {
  const activity = { readRange: vi.fn(async () => entries) }
  const vault = {
    note: vi.fn(async () => {
      if (!vaultBody) throw new Error("not found")
      return { id: "suggestions/automation-gaps", title: "Automation Gaps", body: vaultBody, tier: "memory" }
    }),
    updateNote: vi.fn(async () => ({}) as never),
    createNote: vi.fn(async () => ({}) as never),
  }
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) }
  return { svc: new GapDetectorService(activity as never, vault as never, logger as never), vault }
}

describe("GapDetectorService", () => {
  it("returns no gaps when there is no task-created activity", async () => {
    const { svc } = makeService([])
    const result = await svc.detect(new Date())
    expect(result.gaps).toHaveLength(0)
    expect(result.suggestions).toHaveLength(0)
  })

  it("ignores a summary that repeats below the 3× threshold", async () => {
    const { svc } = makeService([taskCreated("Deploy to staging", 1), taskCreated("Deploy to staging", 2)])
    const result = await svc.detect(new Date())
    expect(result.gaps).toHaveLength(0)
  })

  it("flags a recurring task summary (≥3×, punctuation/case-insensitive) and writes the vault note", async () => {
    const { svc, vault } = makeService([
      taskCreated("Deploy to staging", 1, 1),
      taskCreated("deploy to STAGING!", 2, 2),
      taskCreated("Deploy   to staging", 3, 3),
    ])
    const result = await svc.detect(new Date())
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0]?.count).toBe(3)
    expect(result.suggestions[0]).toContain("automate it?")
    expect(vault.updateNote).toHaveBeenCalled()
  })

  it("ignores non-task-created kinds", async () => {
    const entries: ActivityEntry[] = [
      { id: "x", at: new Date().toISOString(), kind: "run-finished", summary: "x done", refs: {} },
      { id: "y", at: new Date().toISOString(), kind: "run-finished", summary: "x done", refs: {} },
      { id: "z", at: new Date().toISOString(), kind: "run-finished", summary: "x done", refs: {} },
    ]
    const { svc } = makeService(entries)
    expect((await svc.detect(new Date())).gaps).toHaveLength(0)
  })

  it("reads the suggestion bullets back for the briefing", async () => {
    const body = "*Updated: 2026-06-17*\n\n- [ ] You created 3 similar tasks (\"X\") — automate it?\n"
    const { svc } = makeService([], body)
    expect(await svc.readGaps()).toEqual(['You created 3 similar tasks ("X") — automate it?'])
  })
})
