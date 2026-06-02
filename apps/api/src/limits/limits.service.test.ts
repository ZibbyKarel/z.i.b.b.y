import { describe, expect, it } from "vitest"
import { LIMIT_CAPS, LimitsService, buildLimits, usedPct } from "./limits.service"
import type { ClaudeUsageReader, UsageWindows } from "./usage.reader"

describe("usedPct", () => {
  it("rounds used/limit to a whole percent", () => {
    expect(usedPct(0, 200_000)).toBe(0)
    expect(usedPct(100_000, 200_000)).toBe(50)
    expect(usedPct(1, 3)).toBe(33)
  })

  it("returns 0 for a zero limit and clamps overflow to 100", () => {
    expect(usedPct(5, 0)).toBe(0)
    expect(usedPct(300, 200)).toBe(100)
  })
})

describe("buildLimits", () => {
  it("derives usedPct against the caps for both windows", () => {
    const limits = buildLimits(
      { rolling5hTokens: 50_000, weekly7dTokens: 2_500_000 },
      { rollingTokens: 200_000, weeklyTokens: 5_000_000 },
    )
    expect(limits.rolling).toEqual({ usedTokens: 50_000, limitTokens: 200_000, usedPct: 25 })
    expect(limits.weekly).toEqual({ usedTokens: 2_500_000, limitTokens: 5_000_000, usedPct: 50 })
  })

  it("clamps real usage over the cap to 100%", () => {
    const limits = buildLimits({ rolling5hTokens: 271_000, weekly7dTokens: 0 }, LIMIT_CAPS)
    expect(limits.rolling.usedPct).toBe(100)
  })
})

describe("LimitsService.snapshot", () => {
  const fakeReader = (windows: UsageWindows): ClaudeUsageReader =>
    ({ read: async () => windows }) as unknown as ClaudeUsageReader

  it("reads real windowed usage and derives the limits payload", async () => {
    const service = new LimitsService(fakeReader({ rolling5hTokens: 0, weekly7dTokens: 0 }))
    const snap = await service.snapshot()
    expect(snap.rolling).toEqual({ usedTokens: 0, limitTokens: LIMIT_CAPS.rollingTokens, usedPct: 0 })
    expect(snap.weekly.usedTokens).toBe(0)
  })
})
