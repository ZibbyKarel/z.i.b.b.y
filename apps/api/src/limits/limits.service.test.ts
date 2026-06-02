import { describe, expect, it } from "vitest"
import { LimitsService, buildLimits } from "./limits.service"
import type { RateLimitSnapshot, RateLimitsReader } from "./rate-limits.reader"

describe("buildLimits", () => {
  it("shapes a fresh snapshot into the contract payload", () => {
    const limits = buildLimits({
      rolling5hPct: 3,
      weekly7dPct: 8,
      capturedAt: 1_780_000_000_000,
      stale: false,
    })
    expect(limits).toEqual({
      rolling: { usedPct: 3 },
      weekly: { usedPct: 8 },
      capturedAt: 1_780_000_000_000,
      stale: false,
    })
  })

  it("carries the stale flag and null capturedAt through", () => {
    const limits = buildLimits({
      rolling5hPct: 0,
      weekly7dPct: 0,
      capturedAt: null,
      stale: true,
    })
    expect(limits.stale).toBe(true)
    expect(limits.capturedAt).toBeNull()
  })
})

describe("LimitsService.snapshot", () => {
  const fakeReader = (snapshot: RateLimitSnapshot): RateLimitsReader =>
    ({ read: async () => snapshot }) as unknown as RateLimitsReader

  it("reads the utilization snapshot and derives the limits payload", async () => {
    const service = new LimitsService(
      fakeReader({ rolling5hPct: 12, weekly7dPct: 47, capturedAt: 1_780_000_000_000, stale: false }),
    )
    const snap = await service.snapshot()
    expect(snap.rolling.usedPct).toBe(12)
    expect(snap.weekly.usedPct).toBe(47)
    expect(snap.stale).toBe(false)
  })
})
