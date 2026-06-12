import { describe, expect, it, vi } from "vitest"
import type { TriageVerdict } from "@zibby/contracts"
import { KeywordTriager } from "./keyword-triager"
import { TriageService } from "./triage.service"
import type { TriageRouter } from "./triage-router"

const fakeLogger = { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }

function service(router: TriageRouter) {
  return new TriageService(router, new KeywordTriager(), fakeLogger as never)
}

const verdict = (over: Partial<TriageVerdict>): TriageVerdict => ({
  actionable: true,
  tier: 2,
  category: "question",
  confidence: 0.9,
  reason: "ok",
  ...over,
})

describe("TriageService", () => {
  it("uses a valid, confident router verdict as-is", async () => {
    const svc = service({ triage: async () => verdict({ tier: 2, confidence: 0.9 }) })
    const v = await svc.triage("can you help?")
    expect(v.tier).toBe(2)
  })

  it("escalates a low-confidence router verdict one tier (never lowers)", async () => {
    const svc = service({ triage: async () => verdict({ tier: 1, confidence: 0.3 }) })
    const v = await svc.triage("anything")
    expect(v.tier).toBe(2)
    expect(v.reason).toContain("escalated")
  })

  it("falls back to the keyword triager when the router returns null", async () => {
    const svc = service({ triage: async () => null })
    const v = await svc.triage("The app crashes with an exception")
    expect(v.tier).toBe(1) // keyword bug rule
    expect(v.category).toBe("bug")
  })

  it("falls back to the keyword triager when the router throws", async () => {
    const svc = service({
      triage: async () => {
        throw new Error("boom")
      },
    })
    const v = await svc.triage("Tady je nabídka se smlouvou")
    expect(v.tier).toBe(3)
  })
})
